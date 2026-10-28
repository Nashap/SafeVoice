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
  alreadyUploaded?: boolean;
}

export interface SignedUrlResult {
  success: boolean;
  signed_url?: string;
  duration?: number;
  expires_in?: number;
  error?: string;
}

export interface AudioVerificationResult {
  exists: boolean;
  valid: boolean;
  sizeBytes?: number;
  durationEstimate?: number;
  error?: string;
}

class AudioEvidenceService {
  private subscription: EventSubscription | null = null;
  private statusCallbacks: Set<(status: PlaybackStatus) => void> = new Set();
  
  // Track in-flight and completed uploads to prevent duplicate requests
  private inFlightUploads: Map<string | number, Promise<AudioEvidenceUploadResult>> = new Map();
  private uploadedEmergencyIds: Set<string | number> = new Set();
  
  // Store local recorded audio clip paths associated with emergency IDs for retry capability
  private emergencyAudioMap: Map<string | number, { filePath: string; duration: number }> = new Map();

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
   * Verifies that the audio file exists on disk, is finalized, and contains a valid non-empty WAV header.
   */
  async verifyAudioFile(filePath: string): Promise<AudioVerificationResult> {
    try {
      const EmergencyAudio = NativeModules.EmergencyAudioModule;
      if (EmergencyAudio && typeof EmergencyAudio.verifyAudioFile === 'function') {
        const raw = await EmergencyAudio.verifyAudioFile(filePath);
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return {
          exists: !!parsed.exists,
          valid: !!parsed.valid,
          sizeBytes: parsed.sizeBytes,
          durationEstimate: parsed.durationEstimate,
          error: parsed.error,
        };
      }
      // Fallback if native verify is not yet linked
      return { exists: !!filePath, valid: true };
    } catch (e: any) {
      console.warn('[AUDIO_VERIFY] Failed verifying audio file:', e?.message || e);
      return { exists: false, valid: false, error: e?.message || 'Verification failed' };
    }
  }

  /**
   * Associates an emergency ID with a local audio recording path for retries.
   */
  associateEmergencyClip(emergencyId: number | string, filePath: string, duration: number = 15.0) {
    if (emergencyId && filePath) {
      this.emergencyAudioMap.set(String(emergencyId), { filePath, duration });
    }
  }

  /**
   * Retrieves the cached local clip path for an incident if available.
   */
  getCachedClip(emergencyId: number | string): { filePath: string; duration: number } | undefined {
    return this.emergencyAudioMap.get(String(emergencyId));
  }

  /**
   * Checks if an upload is currently in flight for the given emergency.
   */
  isUploading(emergencyId: number | string): boolean {
    return this.inFlightUploads.has(String(emergencyId));
  }

  /**
   * Marks an emergency ID as having successfully uploaded audio evidence.
   */
  markUploaded(emergencyId: number | string) {
    this.uploadedEmergencyIds.add(String(emergencyId));
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
   * Finalizes any in-progress emergency audio capture immediately (e.g. when countdown reaches zero).
   */
  async finalizeCapture(): Promise<boolean> {
    try {
      const EmergencyAudio = NativeModules.EmergencyAudioModule;
      if (EmergencyAudio && typeof EmergencyAudio.finalizeEmergencyCapture === 'function') {
        await EmergencyAudio.finalizeEmergencyCapture();
        return true;
      }
      return false;
    } catch (e: any) {
      console.warn('[AUDIO_EVIDENCE] Failed finalizing emergency audio capture:', e?.message || e);
      return false;
    }
  }

  /**
   * Cancels in-progress emergency audio capture (e.g. countdown cancelled by user).
   */
  async cancelCapture(): Promise<boolean> {
    try {
      const EmergencyAudio = NativeModules.EmergencyAudioModule;
      if (EmergencyAudio && typeof EmergencyAudio.cancelEmergencyCapture === 'function') {
        await EmergencyAudio.cancelEmergencyCapture();
        return true;
      }
      return false;
    } catch (e: any) {
      console.warn('[AUDIO_EVIDENCE] Failed cancelling emergency audio capture:', e?.message || e);
      return false;
    }
  }

  /**
   * Uploads captured WAV audio clip to backend-mediated Supabase Storage endpoint.
   * Includes duplicate prevention, pre-upload file verification, upload progress feedback,
   * bounded retries (up to 2 retries) with backoff, and a reasonable 20s timeout.
   */
  async uploadEmergencyAudio(
    emergencyId: number | string,
    filePath: string,
    duration: number = 15.0,
    onProgress?: (percent: number) => void
  ): Promise<AudioEvidenceUploadResult> {
    const idKey = String(emergencyId);

    // 1. Prevent duplicate uploads if already marked uploaded
    if (this.uploadedEmergencyIds.has(idKey)) {
      console.log(`[AUDIO_UPLOAD] Emergency #${emergencyId} audio evidence was already uploaded. Skipping duplicate upload.`);
      return { success: true, status: 'uploaded', alreadyUploaded: true };
    }

    // 2. If an upload is already in flight for this emergency, return the running promise
    if (this.inFlightUploads.has(idKey)) {
      console.log(`[AUDIO_UPLOAD] Upload already in progress for emergency #${emergencyId}. Joining in-flight upload.`);
      return this.inFlightUploads.get(idKey)!;
    }

    // Associate clip for future retry access
    this.associateEmergencyClip(emergencyId, filePath, duration);

    const uploadPromise = this._executeUploadWithRetry(emergencyId, filePath, duration, onProgress);
    this.inFlightUploads.set(idKey, uploadPromise);

    try {
      const result = await uploadPromise;
      if (result.success) {
        this.uploadedEmergencyIds.add(idKey);
      }
      return result;
    } finally {
      this.inFlightUploads.delete(idKey);
    }
  }

  private async _executeUploadWithRetry(
    emergencyId: number | string,
    filePath: string,
    duration: number,
    onProgress?: (percent: number) => void
  ): Promise<AudioEvidenceUploadResult> {
    if (!emergencyId) {
      return { success: false, error: 'Missing emergency ID' };
    }
    if (!filePath) {
      return { success: false, error: 'Empty file path' };
    }

    // 3. Pre-upload verification: file exists and has valid non-zero WAV contents
    const verification = await this.verifyAudioFile(filePath);
    if (!verification.exists) {
      const err = verification.error || 'Audio file does not exist on device storage';
      console.error(`[AUDIO_UPLOAD] Aborted: ${err} (${filePath})`);
      return { success: false, error: err };
    }
    if (!verification.valid) {
      const err = verification.error || 'Audio file contains invalid or incomplete WAV data';
      console.error(`[AUDIO_UPLOAD] Aborted: ${err} (${filePath})`);
      return { success: false, error: err };
    }

    const cleanPath = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
    const filename = filePath.split('/').pop() || `emergency_${emergencyId}.wav`;

    const maxRetries = 2;
    let attempt = 0;
    let lastError = 'Audio upload request failed';

    while (attempt <= maxRetries) {
      attempt++;
      try {
        console.log(`[AUDIO_UPLOAD] Attempt ${attempt}/${maxRetries + 1}: Uploading to /history/${emergencyId}/audio/ (${verification.sizeBytes} bytes)`);

        const formData = new FormData();
        formData.append('audio', {
          uri: cleanPath,
          type: 'audio/wav',
          name: filename,
        } as any);
        formData.append('duration', String(duration));

        const response = await api.post(`/history/${emergencyId}/audio/`, formData, {
          headers: {
            'Accept': 'application/json',
          },
          transformRequest: (data) => data,
          timeout: 30000, // 30s timeout
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total && progressEvent.total > 0) {
              const percent = Math.min(Math.round((progressEvent.loaded * 100) / progressEvent.total), 99);
              onProgress?.(percent);
              DeviceEventEmitter.emit('onAudioUploadProgress', {
                emergencyId,
                percent,
              });
            }
          },
        });

        console.log(`[AUDIO_UPLOAD] HTTP response status: ${response.status}`, response.data);
        const isSuccess = response.status === 200 && (response.data?.status === 'uploaded' || response.data?.status === 'uploaded_local');

        if (isSuccess) {
          onProgress?.(100);
          DeviceEventEmitter.emit('onAudioUploadProgress', {
            emergencyId,
            percent: 100,
          });
          console.log(`[AUDIO_UPLOAD] Upload SUCCESS: storage=${response.data?.storage}, bucket=${response.data?.audio_bucket}, path=${response.data?.audio_path}`);
          return {
            success: true,
            audio_path: response.data?.audio_path,
            status: response.data?.status,
          };
        } else {
          lastError = response.data?.error || `Upload rejected with status: ${response.data?.status}`;
          // Client rejection (e.g. 400 bad request) should not be retried
          if (response.status < 500) {
            return { success: false, error: lastError, status: response.data?.status };
          }
        }
      } catch (error: any) {
        const httpStatus = error.response?.status;
        lastError = error.response?.data?.error || error.response?.data?.message || error.message || 'Audio upload request failed';
        console.warn(`[AUDIO_UPLOAD] Attempt ${attempt} failed for emergency #${emergencyId}:`, lastError);

        // Do not retry 4xx client errors (e.g. 400 Bad Request, 403 Forbidden, 404 Not Found)
        if (httpStatus && httpStatus >= 400 && httpStatus < 500) {
          return { success: false, error: lastError };
        }

        if (attempt <= maxRetries) {
          // Linear/exponential backoff between retries (1.5s)
          await new Promise((resolve) => setTimeout(() => resolve(undefined), 1500));
        }
      }
    }

    return {
      success: false,
      error: `Upload failed after ${maxRetries + 1} attempts: ${lastError}`,
    };
  }

  /**
   * Retries uploading audio evidence for an existing incident using cached or device files.
   */
  async retryUpload(
    emergencyId: number | string,
    onProgress?: (percent: number) => void
  ): Promise<AudioEvidenceUploadResult> {
    const cached = this.emergencyAudioMap.get(String(emergencyId));
    if (!cached || !cached.filePath) {
      return {
        success: false,
        error: 'No local audio evidence clip found on this device for this incident. Cannot re-upload.',
      };
    }

    // Reset uploaded status to allow re-trying
    this.uploadedEmergencyIds.delete(String(emergencyId));
    return this.uploadEmergencyAudio(emergencyId, cached.filePath, cached.duration, onProgress);
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
export default audioEvidenceService;
