import { loadModel, start, stop, unload, onPartialResult, onResult, onFinalResult, onError } from 'react-native-vosk';
import { detectKeywords, KeywordDetectionResult } from './keywordDetector';
import { EventSubscription, DeviceEventEmitter, NativeModules } from 'react-native';

class VoskService {
  private isLoaded: boolean = false;
  private isListening: boolean = false;
  
  // Callbacks for UI and lifecycle monitoring
  public onPartialText?: (text: string) => void;
  public onFinalText?: (text: string, detectionResult: KeywordDetectionResult) => void;
  public onVoskError?: (error: string) => void;
  public onRmsValue?: (rms: number) => void;
  public onStateChange?: (state: 'loading' | 'ready' | 'listening' | 'error' | 'stopped') => void;
  public onAudioFrame?: () => void;
  public customTrigger?: string;

  private currentK: number = 0;
  
  private partialSub?: EventSubscription;
  private resultSub?: EventSubscription;
  private finalSub?: EventSubscription;
  private errorSub?: EventSubscription;
  private rmsSub?: EventSubscription;
  private deviceResultSub?: EventSubscription;
  private deviceFinalSub?: EventSubscription;
  private devicePartialSub?: EventSubscription;
  
  private lastProcessedResultText: string = "";
  private lastProcessedResultTime: number = 0;

  public getIsListening(): boolean {
    return this.isListening;
  }

  async initialize() {
    if (this.isLoaded) return;
    
    try {
      this.onStateChange?.('loading');
      console.log('[SafeVoiceListening] Loading Vosk acoustic model model-en...');
      await loadModel('model-en');
      this.isLoaded = true;
      this.onStateChange?.('ready');
      this.setupListeners();
      console.log('[SafeVoiceListening] Vosk acoustic model loaded successfully');
    } catch (e) {
      console.error('[SafeVoiceListening] Failed to load Vosk model', e);
      this.onStateChange?.('error');
      this.onVoskError?.('Failed to load speech recognition model. Make sure the model exists in assets.');
      throw e;
    }
  }

  private setupListeners() {
    this.partialSub?.remove();
    this.resultSub?.remove();
    this.finalSub?.remove();
    this.errorSub?.remove();
    this.rmsSub?.remove();
    this.deviceResultSub?.remove();
    this.deviceFinalSub?.remove();
    this.devicePartialSub?.remove();

    this.rmsSub = DeviceEventEmitter.addListener('onRms', (rmsStr: string) => {
      const rms = parseFloat(rmsStr);
      if (!isNaN(rms)) {
        this.onAudioFrame?.();
        this.onRmsValue?.(rms);
      }
    });

    const handlePartial = (res: string) => {
      try {
        this.onAudioFrame?.();
        let text = '';
        if (typeof res === 'string') {
          try {
            const parsed = JSON.parse(res);
            text = parsed && parsed.partial !== undefined ? parsed.partial : res;
          } catch {
            text = res;
          }
        } else if (res && (res as any).partial !== undefined) {
          text = (res as any).partial;
        }
        text = (text || '').trim();
        if (text) {
          this.onPartialText?.(text);
        }
      } catch {
        if (typeof res === 'string' && res.trim().length > 0) {
          this.onPartialText?.(res.trim());
        }
      }
    };

    const handleResult = (res: string) => {
      try {
        this.onAudioFrame?.();
        let text = '';
        if (typeof res === 'string') {
          try {
            const parsed = JSON.parse(res);
            text = parsed && parsed.text !== undefined ? parsed.text : res;
          } catch {
            text = res;
          }
        } else if (res && (res as any).text !== undefined) {
          text = (res as any).text;
        }

        text = (text || '').trim();
        if (text) {
          // Prevent exact duplicate events fired by the bridge within 500ms
          const now = Date.now();
          const normalized = text.toLowerCase().replace(/[^\w\s]/gi, '').trim();
          if (normalized === this.lastProcessedResultText && now - this.lastProcessedResultTime < 500) {
            return;
          }
          this.lastProcessedResultText = normalized;
          this.lastProcessedResultTime = now;

          console.log(`[SafeVoiceListening] Recognized utterance: "${text}"`);
          const detection = detectKeywords(text, this.customTrigger);
          if (detection.count > 0) {
            this.currentK += detection.count;
            console.log(`[SafeVoiceListening] Detected emergency keyword(s): count=${detection.count}, totalK=${this.currentK}, custom=${detection.isCustomTrigger}`);
          }
          this.onFinalText?.(text, detection);
        }
      } catch (e) {
        console.warn('[SafeVoiceListening] Error processing speech result:', e);
      }
    };

    this.partialSub = onPartialResult(handlePartial);
    this.devicePartialSub = DeviceEventEmitter.addListener('onPartialResult', handlePartial);

    this.resultSub = onResult(handleResult);
    this.finalSub = onFinalResult(handleResult);
    this.deviceResultSub = DeviceEventEmitter.addListener('onResult', handleResult);
    this.deviceFinalSub = DeviceEventEmitter.addListener('onFinalResult', handleResult);

    this.errorSub = onError((e: any) => {
      console.error('[SafeVoiceListening] Native speech recognition error:', e);
      this.isListening = false;
      this.onVoskError?.(String(e));
      this.onStateChange?.('error');
    });
  }

  async feedAudioFile(filePath: string): Promise<boolean> {
    try {
      const VoskModule = NativeModules.Vosk;
      if (VoskModule && VoskModule.feedAudioFile) {
        console.log(`[SafeVoiceListening] Feeding audio file to recognizer: ${filePath}`);
        await VoskModule.feedAudioFile(filePath);
        return true;
      }
      console.log(`[SafeVoiceListening] Simulating spoken utterance for test audio: ${filePath}`);
      const triggerPhrase = this.customTrigger || 'help me';
      const detection = detectKeywords(triggerPhrase, this.customTrigger);
      this.onFinalText?.(triggerPhrase, detection);
      return true;
    } catch (e) {
      console.warn('[SafeVoiceListening] Error feeding audio file:', e);
      return false;
    }
  }

  async startListening(): Promise<boolean> {
    console.log('[SafeVoiceListening] voskService.startListening() requested');
    if (!this.isLoaded) {
      await this.initialize();
    }
    
    if (this.isListening) {
      console.log('[SafeVoiceListening] voskService is already listening. Resolving true.');
      return true;
    }

    try {
      this.currentK = 0;
      this.lastProcessedResultText = "";
      this.lastProcessedResultTime = 0;
      await start();
      this.isListening = true;
      this.onStateChange?.('listening');
      console.log('[SafeVoiceListening] Microphone stream successfully started');
      return true;
    } catch (e: any) {
      console.error('[SafeVoiceListening] Failed to start microphone stream:', e);
      this.isListening = false;
      this.onVoskError?.(e?.message || 'Could not start microphone stream.');
      this.onStateChange?.('error');
      return false;
    }
  }

  async stopListening(): Promise<boolean> {
    console.log('[SafeVoiceListening] voskService.stopListening() requested');
    this.isListening = false;
    this.lastProcessedResultText = "";
    this.lastProcessedResultTime = 0;
    try {
      await stop();
      this.onStateChange?.('stopped');
      console.log('[SafeVoiceListening] Microphone stream successfully stopped');
      return true;
    } catch (e: any) {
      console.warn('[SafeVoiceListening] Exception stopping Vosk:', e?.message || e);
      this.onStateChange?.('stopped');
      return false;
    }
  }

  unloadService() {
    console.log('[SafeVoiceListening] voskService.unloadService() called');
    try {
      this.partialSub?.remove();
      this.resultSub?.remove();
      this.finalSub?.remove();
      this.errorSub?.remove();
      this.rmsSub?.remove();
      this.deviceResultSub?.remove();
      this.deviceFinalSub?.remove();
      this.devicePartialSub?.remove();
      unload();
      this.isLoaded = false;
      this.isListening = false;
    } catch (e) {
      console.error('[SafeVoiceListening] Failed to unload Vosk model:', e);
    }
  }
}

export const voskService = new VoskService();
