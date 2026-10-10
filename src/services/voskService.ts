import Vosk from 'react-native-vosk';
import { loadModel, start, stop, unload, onPartialResult, onResult, onError } from 'react-native-vosk';
import { detectKeywords, KeywordDetectionResult } from './keywordDetector';
import { Alert, EventSubscription, DeviceEventEmitter } from 'react-native';

class VoskService {
  private isLoaded: boolean = false;
  private isListening: boolean = false;
  
  // Callbacks for UI updates
  public onPartialText?: (text: string) => void;
  public onFinalText?: (text: string, detectionResult: KeywordDetectionResult) => void;
  public onVoskError?: (error: string) => void;
  public onRmsValue?: (rms: number) => void;
  public onStateChange?: (state: 'loading' | 'ready' | 'listening' | 'error' | 'stopped') => void;

  private currentK: number = 0;
  
  private partialSub?: EventSubscription;
  private resultSub?: EventSubscription;
  private errorSub?: EventSubscription;
  private rmsSub?: EventSubscription;
  
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
    this.errorSub?.remove();
    this.rmsSub?.remove();

    this.rmsSub = DeviceEventEmitter.addListener('onRms', (rmsStr: string) => {
      const rms = parseFloat(rmsStr);
      if (!isNaN(rms)) {
        console.log(`[RMS] value: ${rms.toFixed(2)}`);
        this.onRmsValue?.(rms);
      }
    });

    this.partialSub = onPartialResult((res: string) => {
      console.log('[VOSK_RAW_PARTIAL]', res);
      try {
        const parsed = typeof res === 'string' ? JSON.parse(res) : res;
        const text = parsed.partial !== undefined ? parsed.partial : (parsed as string);
        this.onPartialText?.(text || "<silence>");
      } catch (e) {
        if (typeof res === 'string') {
           this.onPartialText?.(res || "<silence>");
        }
      }
    });

    this.resultSub = onResult((res: string) => {
      // console.log('[VOSK_RESULT]', res);
      try {
        const parsed = typeof res === 'string' ? JSON.parse(res) : res;
        const text = parsed.text !== undefined ? parsed.text : (parsed as string);
        if (text) {
          // Prevent exact duplicate events fired by the bridge within 500ms
          const now = Date.now();
          if (text === this.lastProcessedResultText && now - this.lastProcessedResultTime < 500) {
            return;
          }
          this.lastProcessedResultText = text;
          this.lastProcessedResultTime = now;

          console.log(`[KEYWORD_DEBUG] final utterance: "${text}"`);
          const detection = detectKeywords(text);
          if (detection.count > 0) {
            this.currentK += detection.count;
            console.log(`[KEYWORD_DEBUG] incrementing K: ${detection.count} (Total K = ${this.currentK})`);
          }
          this.onFinalText?.(text, detection);
        }
      } catch (e) {
        if (typeof res === 'string' && res.trim()) {
          const now = Date.now();
          if (res === this.lastProcessedResultText && now - this.lastProcessedResultTime < 500) {
            return;
          }
          this.lastProcessedResultText = res;
          this.lastProcessedResultTime = now;
          
          console.log(`[KEYWORD_DEBUG] final utterance: "${res}"`);
          const detection = detectKeywords(res);
          if (detection.count > 0) {
            this.currentK += detection.count;
            console.log(`[KEYWORD_DEBUG] incrementing K: ${detection.count} (Total K = ${this.currentK})`);
          }
          this.onFinalText?.(res, detection);
        }
      }
    });

    this.errorSub = onError((e: any) => {
      console.error('Vosk Error:', e);
      this.onVoskError?.(String(e));
      this.isListening = false;
      this.onStateChange?.('error');
    });
  }

  async startListening() {
    console.log('[MIC_LIFECYCLE] voskService.startListening() called');
    if (!this.isLoaded) {
      await this.initialize();
    }
    
    if (this.isListening) return;

    try {
      this.currentK = 0;
      await start();
      this.isListening = true;
      this.onStateChange?.('listening');
    } catch (e) {
      console.error('Failed to start listening', e);
      this.onVoskError?.('Could not start microphone stream.');
      this.onStateChange?.('error');
    }
  }

  async stopListening() {
    console.log('[MIC_LIFECYCLE] voskService.stopListening() called');
    if (!this.isListening) return;

    try {
      stop();
      this.isListening = false;
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
      this.errorSub?.remove();
      this.rmsSub?.remove();
      unload();
      this.isLoaded = false;
      this.isListening = false;
    } catch (e) {
      console.error('Failed to unload Vosk model', e);
    }
  }
}

export const voskService = new VoskService();
