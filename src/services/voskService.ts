import Vosk from 'react-native-vosk';
import { loadModel, start, stop, unload, onPartialResult, onResult, onError } from 'react-native-vosk';
import { detectKeywords, KeywordDetectionResult } from './keywordDetector';
import { Alert, EventSubscription } from 'react-native';

class VoskService {
  private isLoaded: boolean = false;
  private isListening: boolean = false;
  
  // Callbacks for UI updates
  public onPartialText?: (text: string) => void;
  public onFinalText?: (text: string, detectionResult: KeywordDetectionResult) => void;
  public onVoskError?: (error: string) => void;
  public onStateChange?: (state: 'loading' | 'ready' | 'listening' | 'error' | 'stopped') => void;

  private currentK: number = 0;
  
  private partialSub?: EventSubscription;
  private resultSub?: EventSubscription;
  private errorSub?: EventSubscription;

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
    // Clear old subscriptions if they exist
    this.partialSub?.remove();
    this.resultSub?.remove();
    this.errorSub?.remove();

    this.partialSub = onPartialResult((res: string) => {
      try {
        const parsed = typeof res === 'string' ? JSON.parse(res) : res;
        const text = parsed.partial !== undefined ? parsed.partial : (parsed as string);
        if (text) {
          this.onPartialText?.(text);
        }
      } catch (e) {
        if (typeof res === 'string' && res.trim()) {
           this.onPartialText?.(res);
        }
      }
    });

    this.resultSub = onResult((res: string) => {
      try {
        const parsed = typeof res === 'string' ? JSON.parse(res) : res;
        const text = parsed.text !== undefined ? parsed.text : (parsed as string);
        if (text) {
          const detection = detectKeywords(text);
          if (detection.count > 0) {
            this.currentK += detection.count;
          }
          this.onFinalText?.(text, detection);
        }
      } catch (e) {
        if (typeof res === 'string' && res.trim()) {
          const detection = detectKeywords(res);
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
    try {
      this.partialSub?.remove();
      this.resultSub?.remove();
      this.errorSub?.remove();
      unload();
      this.isLoaded = false;
      this.isListening = false;
    } catch (e) {
      console.error('Failed to unload Vosk model', e);
    }
  }
}

export const voskService = new VoskService();
