import { NativeModules, DeviceEventEmitter, EventSubscription, Platform } from 'react-native';

class ProtectionService {
  /**
   * Starts the Android foreground service with microphone type for offline voice monitoring.
   */
  async startForegroundService(
    title: string = 'SafeVoice Protection Active',
    message: string = 'Listening for emergency triggers...'
  ): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    try {
      const module = NativeModules.ProtectionServiceModule;
      if (module && typeof module.startProtectionService === 'function') {
        const res = await module.startProtectionService(title, message);
        console.log('[PROTECTION_SERVICE] startProtectionService result:', res);
        return !!res;
      }
      console.warn('[PROTECTION_SERVICE] ProtectionServiceModule.startProtectionService not available');
      return false;
    } catch (e: any) {
      console.error('[PROTECTION_SERVICE] Failed to start foreground service:', e?.message || e);
      throw e;
    }
  }

  /**
   * Stops the Android foreground service, releases wake locks, and removes ongoing notification.
   */
  async stopForegroundService(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    try {
      const module = NativeModules.ProtectionServiceModule;
      if (module && typeof module.stopProtectionService === 'function') {
        const res = await module.stopProtectionService();
        console.log('[PROTECTION_SERVICE] stopProtectionService result:', res);
        return !!res;
      }
      return false;
    } catch (e: any) {
      console.error('[PROTECTION_SERVICE] Failed to stop foreground service:', e?.message || e);
      return false;
    }
  }

  /**
   * Checks whether the native ProtectionModeService is currently running in the background.
   */
  async isServiceRunning(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;

    try {
      const module = NativeModules.ProtectionServiceModule;
      if (module && typeof module.isProtectionServiceRunning === 'function') {
        const running = await module.isProtectionServiceRunning();
        return !!running;
      }
      return false;
    } catch (e: any) {
      console.warn('[PROTECTION_SERVICE] Failed to check isProtectionServiceRunning:', e?.message || e);
      return false;
    }
  }

  /**
   * Retrieves comprehensive native status: service running, mic recording, countdown.
   */
  async getProtectionStatus(): Promise<{
    serviceRunning: boolean;
    micRecording: boolean;
    countdownSeconds: number;
  }> {
    if (Platform.OS !== 'android') {
      return { serviceRunning: false, micRecording: false, countdownSeconds: 0 };
    }

    try {
      const module = NativeModules.ProtectionServiceModule;
      if (module && typeof module.getProtectionStatus === 'function') {
        const status = await module.getProtectionStatus();
        return {
          serviceRunning: !!status?.serviceRunning,
          micRecording: !!status?.micRecording,
          countdownSeconds: status?.countdownSeconds || 0,
        };
      }
      const running = await this.isServiceRunning();
      return { serviceRunning: running, micRecording: running, countdownSeconds: 0 };
    } catch (e: any) {
      console.warn('[PROTECTION_SERVICE] Failed to get protection status:', e?.message || e);
      return { serviceRunning: false, micRecording: false, countdownSeconds: 0 };
    }
  }

  /**
   * Updates notification content (e.g. countdown or SOS dispatched alerts).
   */
  async updateStatus(title: string, message: string): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    try {
      const module = NativeModules.ProtectionServiceModule;
      if (module && typeof module.updateProtectionServiceStatus === 'function') {
        await module.updateProtectionServiceStatus(title, message);
        return true;
      }
      return false;
    } catch (e: any) {
      console.warn('[PROTECTION_SERVICE] Failed to update status:', e?.message || e);
      return false;
    }
  }

  /**
   * Starts native emergency countdown (runs reliably in background and screen off).
   */
  async startEmergencyCountdown(seconds: number = 10): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    try {
      const module = NativeModules.ProtectionServiceModule;
      if (module && typeof module.startEmergencyCountdown === 'function') {
        const res = await module.startEmergencyCountdown(seconds);
        return !!res;
      }
      return false;
    } catch (e: any) {
      console.warn('[PROTECTION_SERVICE] Failed to start emergency countdown:', e?.message || e);
      return false;
    }
  }

  /**
   * Cancels native emergency countdown and restores listening state.
   */
  async cancelEmergencyCountdown(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    try {
      const module = NativeModules.ProtectionServiceModule;
      if (module && typeof module.cancelEmergencyCountdown === 'function') {
        const res = await module.cancelEmergencyCountdown();
        return !!res;
      }
      return false;
    } catch (e: any) {
      console.warn('[PROTECTION_SERVICE] Failed to cancel emergency countdown:', e?.message || e);
      return false;
    }
  }

  /**
   * Subscribes to service state and countdown change events from the native Android service.
   */
  subscribeStateChanges(callbacks: {
    onStarted?: () => void;
    onStopped?: () => void;
    onError?: (err: string) => void;
    onCountdownTick?: (secondsRemaining: number) => void;
    onCountdownFinished?: () => void;
    onCountdownCancelled?: () => void;
  }): () => void {
    const subs: EventSubscription[] = [];

    if (callbacks.onStarted) {
      subs.push(
        DeviceEventEmitter.addListener('onProtectionServiceStarted', () => {
          callbacks.onStarted?.();
        })
      );
    }

    if (callbacks.onStopped) {
      subs.push(
        DeviceEventEmitter.addListener('onProtectionServiceStopped', () => {
          callbacks.onStopped?.();
        })
      );
    }

    if (callbacks.onError) {
      subs.push(
        DeviceEventEmitter.addListener('onProtectionServiceError', (err: string) => {
          callbacks.onError?.(err);
        })
      );
    }

    if (callbacks.onCountdownTick) {
      subs.push(
        DeviceEventEmitter.addListener('onCountdownTick', (data: any) => {
          const val = typeof data === 'number' ? data : parseInt(data, 10);
          callbacks.onCountdownTick?.(isNaN(val) ? 0 : val);
        })
      );
    }

    if (callbacks.onCountdownFinished) {
      subs.push(
        DeviceEventEmitter.addListener('onCountdownFinished', () => {
          callbacks.onCountdownFinished?.();
        })
      );
    }

    if (callbacks.onCountdownCancelled) {
      subs.push(
        DeviceEventEmitter.addListener('onCountdownCancelled', () => {
          callbacks.onCountdownCancelled?.();
        })
      );
    }

    return () => {
      subs.forEach((s) => s.remove());
    };
  }
}

export const protectionService = new ProtectionService();
export default protectionService;
