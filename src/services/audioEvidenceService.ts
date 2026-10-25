import { NativeModules, DeviceEventEmitter, EventSubscription, Platform } from 'react-native';
import api from './api';

export interface PlaybackStatus {
  status: 'loading' | 'playing' | 'paused' | 'completed' | 'error';
  position: number;
  duration: number;
  error?: string;
}

export interface AudioEvidenceUploadResult {
  success: boolean;
  audio_path?: string;
  status?: string;
  error?: string;
}

export interface SignedUrlResult {
  success: boolean;
  signed_url?: string;
  duration?: number;
  expires_in?: number;
  error?: string;
}

class AudioEvidenceService {
  private subscription: EventSubscription | null = null;
  private statusCallbacks: Set<(status: PlaybackStatus) => void> = new Set();

  constructor() {
    this.setupEventListener();
  }

  private setupEventListener() {
    if (this.subscription) {
      this.subscription.remove();
    }
    this.subscription = DeviceEventEmitter.addListener('onAudioPlaybackStatus', (event: any) => {
      const playbackStatus: PlaybackStatus = {
        status: event.status || 'paused',
        position: event.position || 0,
        duration: event.duration || 0,
        error: event.error,
      };
      this.statusCallbacks.forEach((cb) => {
        try {
          cb(playbackStatus);
        } catch (e) {
          console.warn('[AUDIO_PLAYER] Error in status callback:', e);
        }
      });
    });
  }

  /**
   * Triggers native 15-second emergency audio clip capture via EmergencyAudioModule.
   */
  async triggerCapture(tag: string = ''): Promise<boolean> {
    try {
      console.log(`[AUDIO_EVIDENCE] Requesting emergency audio capture for tag: ${tag}...`);
      const EmergencyAudio = NativeModules.EmergencyAudioModule;
      if (EmergencyAudio && typeof EmergencyAudio.triggerEmergencyCapture === 'function') {
        const result = await EmergencyAudio.triggerEmergencyCapture(tag);
        console.log(`[AUDIO_EVIDENCE] Native EmergencyAudioModule.triggerEmergencyCapture started successfully:`, result);
        return true;
      }

      console.warn(
        `[AUDIO_EVIDENCE] EmergencyAudioModule.triggerEmergencyCapture is not available on NativeModules. ` +
        `Available modules: ${Object.keys(NativeModules).filter(k => !k.startsWith('RCT')).join(', ')}`
      );
      return false;
    } catch (e: any) {
      console.error('[AUDIO_EVIDENCE] Failed triggering emergency audio capture:', e?.message || e);
      return false;
    }
  }

  /**
   * Uploads captured WAV audio clip to backend-mediated Supabase Storage endpoint.
   */
  async uploadEmergencyAudio(
    emergencyId: number | string,
    filePath: string,
    duration: number = 15.0
  ): Promise<AudioEvidenceUploadResult> {
    try {
      console.log(`[AUDIO_UPLOAD] Preparing to upload audio: emergencyId=${emergencyId}, path=${filePath}, duration=${duration}s`);
      if (!emergencyId) {
        console.warn('[AUDIO_UPLOAD] Aborted: emergencyId is missing');
        return { success: false, error: 'Missing emergency ID' };
      }
      if (!filePath) {
        console.warn('[AUDIO_UPLOAD] Aborted: filePath is empty');
        return { success: false, error: 'Empty file path' };
      }

      const cleanPath = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
      const filename = filePath.split('/').pop() || `emergency_${emergencyId}.wav`;

      const formData = new FormData();
      formData.append('audio', {
        uri: cleanPath,
        type: 'audio/wav',
        name: filename,
      } as any);
      formData.append('duration', String(duration));

      console.log(`[AUDIO_UPLOAD] Sending POST /history/${emergencyId}/audio/ with file: ${filename}, duration: ${duration}s`);
      const response = await api.post(`/history/${emergencyId}/audio/`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 45000,
      });

      console.log(`[AUDIO_UPLOAD] HTTP response status: ${response.status}`, response.data);
      const isSuccess = response.status === 200 && (response.data?.status === 'uploaded' || response.data?.status === 'uploaded_local');

      if (isSuccess) {
        console.log(`[AUDIO_UPLOAD] Upload SUCCESS: storage=${response.data?.storage}, bucket=${response.data?.audio_bucket}, path=${response.data?.audio_path}`);
        return {
          success: true,
          audio_path: response.data?.audio_path,
          status: response.data?.status,
        };
      } else {
        const err = response.data?.error || `Upload failed with status: ${response.data?.status}`;
        console.warn(`[AUDIO_UPLOAD] Backend rejected audio upload or reported non-success: ${err}`);
        return {
          success: false,
          error: err,
          status: response.data?.status,
        };
      }
    } catch (error: any) {
      const errMsg = error.response?.data?.error || error.response?.data?.message || error.message || 'Audio upload request failed';
      console.error(`[AUDIO_UPLOAD] Upload error for emergency ${emergencyId}:`, errMsg);
      return {
        success: false,
        error: errMsg,
      };
    }
  }

  /**
   * Requests a temporary 300-second signed URL for authorized emergency playback.
   */
  async fetchSignedAudioUrl(emergencyId: number | string): Promise<SignedUrlResult> {
    try {
      console.log(`[AUDIO_PLAYBACK] Requesting short-lived signed URL for emergency ${emergencyId}...`);
      const response = await api.get(`/history/${emergencyId}/audio_url/`);
      if (response.data && response.data.signed_url) {
        return {
          success: true,
          signed_url: response.data.signed_url,
          duration: response.data.duration || 15.0,
          expires_in: response.data.expires_in || 300,
        };
      }
      return {
        success: false,
        error: response.data?.error || 'Signed URL not available',
      };
    } catch (error: any) {
      console.error('[AUDIO_PLAYBACK] Failed to obtain signed URL:', error);
      const errMsg = error.response?.data?.error || error.message || 'Failed to fetch audio playback link';
      return {
        success: false,
        error: errMsg,
      };
    }
  }

  // --- Audio Player Controls ---

  subscribePlaybackStatus(callback: (status: PlaybackStatus) => void): () => void {
    this.statusCallbacks.add(callback);
    return () => {
      this.statusCallbacks.delete(callback);
    };
  }

  async play(url: string): Promise<void> {
    const Player = NativeModules.AudioPlayerModule;
    if (Player && Player.play) {
      await Player.play(url);
    } else {
      console.warn('[AUDIO_PLAYER] AudioPlayerModule not available');
    }
  }

  async pause(): Promise<void> {
    const Player = NativeModules.AudioPlayerModule;
    if (Player && Player.pause) {
      await Player.pause();
    }
  }

  async resume(): Promise<void> {
    const Player = NativeModules.AudioPlayerModule;
    if (Player && Player.resume) {
      await Player.resume();
    }
  }

  async stop(): Promise<void> {
    const Player = NativeModules.AudioPlayerModule;
    if (Player && Player.stop) {
      await Player.stop();
    }
  }

  async seekTo(positionMs: number): Promise<void> {
    const Player = NativeModules.AudioPlayerModule;
    if (Player && Player.seekTo) {
      await Player.seekTo(positionMs);
    }
  }
}

export const audioEvidenceService = new AudioEvidenceService();
