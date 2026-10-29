import { Platform, PermissionsAndroid } from 'react-native';
import { voskService } from './voskService';
import { protectionService } from './protectionService';
import { requestNotificationPermission } from './notificationService';
import { StorageService } from './storage';

export type ListeningLifecycleState =
  | 'disabled'
  | 'starting'
  | 'listening'
  | 'recovering'
  | 'error'
  | 'stopping';

export interface ListeningLifecycleStatus {
  state: ListeningLifecycleState;
  isProtectionActive: boolean;
  error: string | null;
  lastAudioTime: number;
  retryCount: number;
}

type StatusListener = (status: ListeningLifecycleStatus) => void;

class ListeningLifecycleManager {
  private state: ListeningLifecycleState = 'disabled';
  private lastError: string | null = null;
  private lastAudioTime: number = 0;
  private retryCount: number = 0;
  private readonly MAX_RETRIES = 3;

  private listeners: Set<StatusListener> = new Set();
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;

  // Operation queue / transition mutex to make start/stop strictly serialized and idempotent
  private operationQueue: Promise<any> = Promise.resolve();
  private currentUsername: string = '';
  private isEmergencyActive: boolean = false;

  constructor() {
    // Hook into voskService audio frames
    voskService.onAudioFrame = () => {
      this.handleAudioFrame();
    };

    voskService.onVoskError = (err: string) => {
      this.handleNativeError(err);
    };
  }

  public getState(): ListeningLifecycleState {
    return this.state;
  }

  public getStatus(): ListeningLifecycleStatus {
    return {
      state: this.state,
      isProtectionActive: this.isProtectionActive(),
      error: this.lastError,
      lastAudioTime: this.lastAudioTime,
      retryCount: this.retryCount,
    };
  }

  public isProtectionActive(): boolean {
    return (
      this.state === 'starting' ||
      this.state === 'listening' ||
      this.state === 'recovering'
    );
  }

  public subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    const status = this.getStatus();
    this.listeners.forEach((cb) => {
      try {
        cb(status);
      } catch (e) {
        console.warn('[SafeVoiceProtection] Error in status callback:', e);
      }
    });
  }

  private transitionTo(newState: ListeningLifecycleState, error: string | null = null) {
    if (this.state === newState && this.lastError === error) {
      return;
    }
    const oldState = this.state;
    this.state = newState;
    if (error !== null) {
      this.lastError = error;
    } else if (newState === 'listening' || newState === 'disabled') {
      this.lastError = null;
    }

    console.log(`[SafeVoiceProtection] Lifecycle state: ${oldState} -> ${newState}${error ? ` (error: ${error})` : ''}`);
    this.notifyListeners();
  }

  /**
   * Inform the lifecycle manager whether an emergency countdown or SOS submission is running.
   * During active emergencies, watchdog restarts are held to avoid interrupting evidence recording.
   */
  public setEmergencyActive(active: boolean) {
    this.isEmergencyActive = active;
  }

  /**
   * Called on app startup or user session change to restore persisted state.
   */
  public async initialize(username: string): Promise<void> {
    this.currentUsername = username;
    console.log(`[SafeVoiceProtection] Initializing lifecycle for user: ${username}`);

    try {
      const persistedEnabled = await StorageService.loadProtectionEnabled(username);
      const nativeStatus = await protectionService.getProtectionStatus();
      console.log(`[SafeVoiceProtection] Persisted setting: ${persistedEnabled}, Native serviceRunning: ${nativeStatus.serviceRunning}, micRecording: ${nativeStatus.micRecording}`);

      if (persistedEnabled) {
        // User previously turned Protection Mode ON.
        console.log('[SafeVoiceProtection] Restoring Protection Mode from persisted setting...');
        await this.startProtection();
      } else {
        // User previously turned Protection Mode OFF.
        if (nativeStatus.serviceRunning) {
          console.log('[SafeVoiceProtection] Cleaning up leftover native service since protection was disabled');
          await protectionService.stopForegroundService();
        }
        await voskService.stopListening();
        this.transitionTo('disabled');
      }
    } catch (e: any) {
      console.warn('[SafeVoiceProtection] Error during lifecycle initialization:', e?.message || e);
    }
  }

  /**
   * Request microphone permission explicitly with Android runtime check.
   */
  private async requestMicrophonePermission(): Promise<boolean> {
    if (Platform.OS === 'android') {
      try {
        const hasPermission = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        if (hasPermission) return true;
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission',
            message: 'SafeVoice requires microphone access for offline voice monitoring.',
            buttonPositive: 'OK',
            buttonNegative: 'Cancel',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (e) {
        console.warn('[SafeVoiceProtection] Error requesting RECORD_AUDIO permission:', e);
        return false;
      }
    }
    return true;
  }

  /**
   * Start Protection Mode idempotently.
   * Safe to call multiple times concurrently; subsequent calls join the single operation queue.
   */
  public startProtection(options?: { title?: string; message?: string }): Promise<boolean> {
    return this.enqueueOperation(async () => {
      console.log(`[SafeVoiceProtection] startProtection requested. Current state: ${this.state}`);

      if (this.state === 'listening') {
        console.log('[SafeVoiceProtection] Already in listening state. No-op.');
        return true;
      }

      this.transitionTo('starting');
      this.retryCount = 0;

      // 1. Check & request notification permission (Android 13+)
      await requestNotificationPermission();

      // 2. Check & request microphone permission
      const hasMic = await this.requestMicrophonePermission();
      if (!hasMic) {
        this.transitionTo('error', 'Microphone permission denied.');
        return false;
      }

      try {
        // 3. Start native Android Foreground Service with type microphone FIRST
        // This grants background microphone recording access under Android 14+
        console.log('[SafeVoiceProtection] Starting Android foreground service...');
        await protectionService.startForegroundService(
          options?.title || 'SafeVoice Protection Active',
          options?.message || 'Listening for emergency triggers...'
        );

        // 4. Start Vosk offline speech recognition
        console.log('[SafeVoiceListening] Starting Vosk speech recognition service...');
        const started = await voskService.startListening();
        if (!started) {
          console.error('[SafeVoiceListening] voskService.startListening() returned false');
          await protectionService.stopForegroundService();
          this.transitionTo('error', 'Failed to start microphone or speech recognition.');
          return false;
        }

        this.lastAudioTime = Date.now();
        this.transitionTo('listening');

        // 5. Persist setting for the user
        if (this.currentUsername) {
          await StorageService.saveProtectionEnabled(this.currentUsername, true);
        }

        // 6. Start health monitoring watchdog
        this.startWatchdog();
        return true;
      } catch (err: any) {
        console.error('[SafeVoiceProtection] Exception during startProtection:', err);
        await protectionService.stopForegroundService().catch(() => {});
        await voskService.stopListening().catch(() => {});
        this.transitionTo('error', err?.message || 'Unable to initialize audio capture.');
        return false;
      }
    });
  }

  /**
   * Stop Protection Mode idempotently.
   * Cancels timers, releases microphone, stops foreground service, persists disabled state.
   */
  public stopProtection(reason: string = 'user requested'): Promise<boolean> {
    return this.enqueueOperation(async () => {
      console.log(`[SafeVoiceProtection] stopProtection requested (reason: ${reason}). Current state: ${this.state}`);

      if (this.state === 'disabled') {
        console.log('[SafeVoiceProtection] Already disabled. No-op.');
        return true;
      }

      this.stopWatchdog();
      if (this.recoveryTimer) {
        clearTimeout(this.recoveryTimer);
        this.recoveryTimer = null;
      }

      this.transitionTo('stopping');

      try {
        // 1. Cancel any native emergency countdown
        await protectionService.cancelEmergencyCountdown().catch(() => {});

        // 2. Stop microphone listening and release native AudioRecord
        console.log('[SafeVoiceListening] Stopping microphone listening session...');
        await voskService.stopListening().catch((e) => {
          console.warn('[SafeVoiceListening] Error during vosk stop:', e);
        });

        // 3. Stop native Foreground Service
        console.log('[SafeVoiceProtection] Stopping Android foreground service...');
        await protectionService.stopForegroundService().catch((e) => {
          console.warn('[SafeVoiceProtection] Error stopping foreground service:', e);
        });

        // 4. Persist explicit disabled state (user explicitly turned it off)
        if (this.currentUsername) {
          await StorageService.saveProtectionEnabled(this.currentUsername, false);
        }

        this.retryCount = 0;
        this.transitionTo('disabled');
        console.log(`[SafeVoiceProtection] Protection Mode successfully disabled. Reason: ${reason}`);
        return true;
      } catch (e: any) {
        console.error('[SafeVoiceProtection] Error during stopProtection:', e);
        this.transitionTo('disabled');
        return false;
      }
    });
  }

  /**
   * Called whenever an audio frame or text recognition result is processed.
   */
  private handleAudioFrame() {
    this.lastAudioTime = Date.now();
    if (this.state === 'recovering') {
      console.log('[SafeVoiceListening] Audio frame received during recovery: Restoring to listening state');
      this.retryCount = 0;
      this.transitionTo('listening');
      protectionService.updateStatus(
        'SafeVoice Protection Active',
        'Listening for emergency triggers...'
      ).catch(() => {});
    }
  }

  /**
   * Called when a native microphone or recognizer error occurs.
   */
  private handleNativeError(err: string) {
    console.warn(`[SafeVoiceListening] Native error reported: ${err}. Current state: ${this.state}`);
    if (this.state === 'disabled' || this.state === 'stopping') {
      return;
    }
    this.triggerRecovery(`Native error: ${err}`);
  }

  /**
   * Watchdog timer: checks every 5 seconds that the audio stream is progressing.
   * If silence/deadlock lasts > 12 seconds while in 'listening' state, triggers auto-recovery.
   */
  private startWatchdog() {
    this.stopWatchdog();
    this.watchdogTimer = setInterval(() => {
      this.checkHealth();
    }, 5000);
  }

  private stopWatchdog() {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private async checkHealth() {
    if (this.state !== 'listening') return;
    if (this.isEmergencyActive) return; // Do not interrupt emergency countdown or evidence capture

    const now = Date.now();
    const elapsedSinceLastAudio = now - this.lastAudioTime;

    // Check native service status
    try {
      const nativeStatus = await protectionService.getProtectionStatus();
      if (!nativeStatus.serviceRunning) {
        console.warn('[SafeVoiceListening] Health check: Foreground service died unexpectedly. Initiating recovery...');
        this.triggerRecovery('Foreground service stopped unexpectedly');
        return;
      }

      if (!nativeStatus.micRecording && elapsedSinceLastAudio > 10000) {
        console.warn(`[SafeVoiceListening] Health check: Microphone recording is inactive (last audio ${elapsedSinceLastAudio}ms ago). Initiating recovery...`);
        this.triggerRecovery('Microphone stream inactive');
        return;
      }
    } catch (e) {
      console.warn('[SafeVoiceListening] Health check query error:', e);
    }
  }

  /**
   * Bounded recovery strategy:
   * Safely restarts the listening session with linear backoff (up to MAX_RETRIES).
   */
  public triggerRecovery(reason: string) {
    if (this.state === 'disabled' || this.state === 'stopping' || this.state === 'recovering') {
      return;
    }
    if (this.isEmergencyActive) {
      console.log('[SafeVoiceListening] Recovery delayed because emergency workflow is active.');
      return;
    }

    if (this.retryCount >= this.MAX_RETRIES) {
      console.error(`[SafeVoiceListening] Maximum recovery attempts (${this.MAX_RETRIES}) reached. Halting recovery.`);
      this.stopWatchdog();
      protectionService.updateStatus(
        'SafeVoice Protection Error',
        'Voice monitoring stopped unexpectedly. Tap to open app.'
      ).catch(() => {});
      this.transitionTo('error', `Listening stopped: ${reason}. Tap to restart.`);
      return;
    }

    this.retryCount++;
    this.transitionTo('recovering', `Recovering listening (attempt ${this.retryCount}/${this.MAX_RETRIES})...`);
    console.log(`[SafeVoiceListening] Initiating recovery attempt ${this.retryCount}/${this.MAX_RETRIES} due to: ${reason}`);

    protectionService.updateStatus(
      'SafeVoice Protection',
      `Recovering voice monitoring (attempt ${this.retryCount}/${this.MAX_RETRIES})...`
    ).catch(() => {});

    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
    }

    const backoffMs = this.retryCount * 1200;
    this.recoveryTimer = setTimeout(async () => {
      this.recoveryTimer = null;
      if (this.state !== 'recovering') return;

      try {
        console.log('[SafeVoiceListening] Executing recovery restart...');
        // 1. Cleanly stop existing Vosk instance
        await voskService.stopListening().catch(() => {});

        // 2. Restart native foreground service if needed
        const nativeStatus = await protectionService.getProtectionStatus();
        if (!nativeStatus.serviceRunning) {
          await protectionService.startForegroundService(
            'SafeVoice Protection Active',
            'Listening for emergency triggers...'
          );
        }

        // 3. Restart Vosk listening
        const restarted = await voskService.startListening();
        if (restarted) {
          console.log(`[SafeVoiceListening] Recovery attempt ${this.retryCount} succeeded!`);
          this.lastAudioTime = Date.now();
          this.transitionTo('listening');
          await protectionService.updateStatus(
            'SafeVoice Protection Active',
            'Listening for emergency triggers...'
          );
        } else {
          console.warn(`[SafeVoiceListening] Recovery attempt ${this.retryCount} failed to start listening`);
          this.triggerRecovery('Restart attempt failed');
        }
      } catch (err: any) {
        console.error(`[SafeVoiceListening] Exception during recovery attempt ${this.retryCount}:`, err);
        this.triggerRecovery(err?.message || 'Recovery restart failed');
      }
    }, backoffMs);
  }

  /**
   * Serializes operations to avoid concurrent start/stop races.
   */
  private enqueueOperation<T>(operation: () => Promise<T>): Promise<T> {
    const nextOp = this.operationQueue.then(operation, operation);
    this.operationQueue = nextOp.catch(() => {});
    return nextOp;
  }
}

export const listeningLifecycleManager = new ListeningLifecycleManager();
export default listeningLifecycleManager;
