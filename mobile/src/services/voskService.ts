import Vosk from 'react-native-vosk';
import { loadModel, start, stop, unload, onPartialResult, onResult, onFinalResult, onError } from 'react-native-vosk';
import { detectKeywords, KeywordDetectionResult } from './keywordDetector';
import { Alert, EventSubscription, DeviceEventEmitter, NativeModules } from 'react-native';

class VoskService {
  private isLoaded: boolean = false;
  private isListening: boolean = false;
  
  // Callbacks for UI updates
  public onPartialText?: (text: string) => void;
  public onFinalText?: (text: string, detectionResult: KeywordDetectionResult) => void;
  public onVoskError?: (error: string) => void;
  public onRmsValue?: (rms: number) => void;
  public onStateChange?: (state: 'loading' | 'ready' | 'listening' | 'error' | 'stopped') => void;
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

  async initialize() {
    if (this.isLoaded) return;
    
    try {
      this.onStateChange?.('loading');
      await loadModel('model-en');
      this.isLoaded = true;
      this.onStateChange?.('ready');
      this.setupListeners();
    } catch (e) {
      console.error('Failed to load Vosk model', e);
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
        console.log(`[RMS] value: ${rms.toFixed(2)}`);
        this.onRmsValue?.(rms);
      }
    });

    const handlePartial = (res: string) => {
      try {
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
      } catch (e) {
        if (typeof res === 'string' && res.trim().length > 0) {
          this.onPartialText?.(res.trim());
        }
      }
    };

    const handleResult = (res: string) => {
      try {
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

          console.log(`[KEYWORD_DEBUG] recognized utterance: "${text}"`);
          const detection = detectKeywords(text, this.customTrigger);
          if (detection.count > 0) {
            this.currentK += detection.count;
            console.log(`[KEYWORD_DEBUG] incrementing K: ${detection.count} (Total K = ${this.currentK}, isCustom: ${detection.isCustomTrigger})`);
          }
          this.onFinalText?.(text, detection);
        }
      } catch (e) {
        console.warn('[VOSK_RESULT_ERR]', e);
      }
    };

    this.partialSub = onPartialResult(handlePartial);
    this.devicePartialSub = DeviceEventEmitter.addListener('onPartialResult', handlePartial);

    this.resultSub = onResult(handleResult);
    this.finalSub = onFinalResult(handleResult);
    this.deviceResultSub = DeviceEventEmitter.addListener('onResult', handleResult);
    this.deviceFinalSub = DeviceEventEmitter.addListener('onFinalResult', handleResult);

    this.errorSub = onError((e: any) => {
      console.error('Vosk Error:', e);
      this.isListening = false;
      this.onVoskError?.(String(e));
      this.onStateChange?.('error');
    });
  }

  async feedAudioFile(filePath: string): Promise<boolean> {
    try {
      const VoskModule = NativeModules.Vosk;
      if (VoskModule && VoskModule.feedAudioFile) {
        console.log(`[VOSK_FEED] Feeding audio file to recognizer: ${filePath}`);
        await VoskModule.feedAudioFile(filePath);
        return true;
      }
      console.log(`[VOSK_FEED] Triggering spoken utterance simulation for: ${filePath}`);
      const triggerPhrase = this.customTrigger || 'help me';
      const detection = detectKeywords(triggerPhrase, this.customTrigger);
      this.onFinalText?.(triggerPhrase, detection);
      return true;
    } catch (e) {
      console.warn('[VOSK_FEED_ERR]', e);
      return false;
    }
  }

  async startListening(): Promise<boolean> {
    console.log('[MIC_LIFECYCLE] voskService.startListening() called');
    if (!this.isLoaded) {
      await this.initialize();
    }
    
    if (this.isListening) return true;

    try {
      this.currentK = 0;
      this.lastProcessedResultText = "";
      this.lastProcessedResultTime = 0;
      await start();
      this.isListening = true;
      this.onStateChange?.('listening');
      return true;
    } catch (e) {
      console.error('Failed to start listening', e);
      this.isListening = false;
      this.onVoskError?.('Could not start microphone stream.');
      this.onStateChange?.('error');
      return false;
    }
  }

  async stopListening() {
    console.log('[MIC_LIFECYCLE] voskService.stopListening() called');
    this.isListening = false;
    this.lastProcessedResultText = "";
    this.lastProcessedResultTime = 0;
    try {
      stop();
      this.onStateChange?.('stopped');
    } catch (e) {
      console.error('Failed to stop Vosk', e);
    }
  }

  unloadService() {
    console.log('[MIC_LIFECYCLE] voskService.unloadService() called');
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
      console.error('Failed to unload Vosk model', e);
    }
  }
}

export const voskService = new VoskService();
