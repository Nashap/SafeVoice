import React, { createContext, useState, useContext, ReactNode, useEffect, useRef } from 'react';
import api from '../services/api';
import { Alert, DeviceEventEmitter, AppState, PermissionsAndroid, Platform } from 'react-native';
import { useAuth } from './AuthContext';
import { StorageService } from '../services/storage';
import { voskService } from '../services/voskService';
import { requestLocationPermission, getCurrentLocation, getReadableLocation, LocationData } from '../services/locationService';
import { audioEvidenceService } from '../services/audioEvidenceService';
import { protectionService } from '../services/protectionService';
import { requestNotificationPermission } from '../services/notificationService';

export interface Contact {
  id: string;
  name: string;
  phone: string;
  has_registered_account?: boolean;
  has_fcm_token?: boolean;
  fcm_status?: 'ready' | 'no_device' | 'unregistered';
}

export interface Profile {
  name: string;
  phone: string;
}

interface SafeVoiceContextType {
  profile: Profile;
  setProfile: (profile: Profile) => void;
  contacts: Contact[];
  addContact: (contact: Contact) => void;
  editContact: (contact: Contact) => void;
  deleteContact: (id: string) => void;
  refreshContacts: () => Promise<void>;
  isLoaded: boolean;

  customTrigger: string;
  setCustomTrigger: (phrase: string) => Promise<boolean>;

  isProtectionActive: boolean;
  voskState: string;
  recognizedText: string;
  detectedKeywords: string[];
  keywordCount: number;
  repetitionFactor: number;
  rms: number;
  emergencyScore: number;
  countdown: number | null;
  decision: string;
  location: LocationData | 'error' | null;

  isSubmittingAlert: boolean;
  sendEmergencyAlert: (triggerType?: string, score?: number) => Promise<{ success: boolean; message: string; data?: any }>;
  shareGPSLocation: () => Promise<{ success: boolean; message: string; location?: LocationData }>;

  startProtectionMode: () => Promise<boolean>;
  stopProtectionMode: () => Promise<void>;
  cancelEmergency: () => void;
}

const defaultState: SafeVoiceContextType = {
  profile: { name: '', phone: '' },
  setProfile: () => {},
  contacts: [],
  addContact: () => {},
  editContact: () => {},
  deleteContact: () => {},
  refreshContacts: async () => {},
  isLoaded: false,

  customTrigger: 'help me',
  setCustomTrigger: async () => false,

  isProtectionActive: false,
  voskState: 'stopped',
  recognizedText: '',
  detectedKeywords: [],
  keywordCount: 0,
  repetitionFactor: 0,
  rms: 0,
  emergencyScore: 0,
  countdown: null,
  decision: 'Normal',
  location: null,

  isSubmittingAlert: false,
  sendEmergencyAlert: async () => ({ success: false, message: 'Not initialized' }),
  shareGPSLocation: async () => ({ success: false, message: 'Not initialized' }),

  startProtectionMode: async () => false,
  stopProtectionMode: async () => {},
  cancelEmergency: () => {},
};

const SafeVoiceContext = createContext<SafeVoiceContextType>(defaultState);

export const SafeVoiceProvider = ({ children }: { children: ReactNode }) => {
  const [profile, setProfileState] = useState<Profile>({ name: '', phone: '' });
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const { isAuthenticated, username } = useAuth();

  // Custom trigger phrase configuration (default: "help me")
  const [customTrigger, setCustomTriggerState] = useState<string>('help me');

  // Monitoring State
  const [isProtectionActive, setIsProtectionActive] = useState(false);
  const [voskState, setVoskState] = useState<string>('stopped');
  const [recognizedText, setRecognizedText] = useState<string>('');
  const [detectedKeywords, setDetectedKeywords] = useState<string[]>([]);
  
  const [keywordCount, setKeywordCount] = useState<number>(0);
  const [repetitionFactor, setRepetitionFactor] = useState<number>(0);
  const [rms, setRms] = useState<number>(0);
  const [emergencyScore, setEmergencyScore] = useState<number>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [decision, setDecision] = useState<string>('Normal');
  const [location, setLocation] = useState<LocationData | 'error' | null>(null);
  const [isSubmittingAlert, setIsSubmittingAlert] = useState<boolean>(false);

  const lastKeywordTimeRef = useRef<number>(0);
  const lastLogTimeRef = useRef<number>(0);
  const idempotencyKeyRef = useRef<string | null>(null);
  const isSubmittingAlertRef = useRef<boolean>(false);
  const decisionRef = useRef<string>('Normal');
  const countdownRef = useRef<number | null>(null);

  const activeEmergencyIdRef = useRef<number | string | null>(null);
  const latestAudioClipRef = useRef<{ filePath: string; duration: number; tag?: string } | null>(null);
  const uploadedEmergencyIdsRef = useRef<Set<number | string>>(new Set());

  const sendEmergencyAlertRef = useRef<((triggerType?: string, providedScore?: number) => Promise<any>) | null>(null);

  // Keep refs synchronized
  useEffect(() => {
    decisionRef.current = decision;
  }, [decision]);

  useEffect(() => {
    countdownRef.current = countdown;
  }, [countdown]);

  useEffect(() => {
    voskService.customTrigger = customTrigger;
  }, [customTrigger]);

  // Handle native emergency audio clip completion or failure
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('onEmergencyAudioReady', async (data: any) => {
      console.log('[AUDIO_READY] Received onEmergencyAudioReady event:', data);
      let parsed = data;
      if (typeof data === 'string') {
        try {
          parsed = JSON.parse(data);
        } catch {}
      }
      const filePath = parsed.filePath;
      const duration = parsed.duration || 15.0;
      const sizeBytes = parsed.sizeBytes;
      const rms = parsed.rms;
      console.log(`[AUDIO_READY] WAV file ready: path=${filePath}, duration=${duration}s, sizeBytes=${sizeBytes}, rms=${rms}`);
      latestAudioClipRef.current = { filePath, duration, tag: parsed.tag };

      const activeId = activeEmergencyIdRef.current;
      if (activeId) {
        audioEvidenceService.associateEmergencyClip(activeId, filePath, duration);
        if (!uploadedEmergencyIdsRef.current.has(activeId)) {
          uploadedEmergencyIdsRef.current.add(activeId);
          console.log(`[AUDIO_UPLOAD] Immediately uploading clip for active emergency ID: ${activeId}`);
          api.patch(`/history/${activeId}/`, { audio_status: 'uploading' }).catch(() => {});
          audioEvidenceService.uploadEmergencyAudio(activeId, filePath, duration).then(async (res) => {
            console.log('[AUDIO_UPLOAD] Upload result:', res);
            if (!res.success) {
              uploadedEmergencyIdsRef.current.delete(activeId);
              try {
                await api.patch(`/history/${activeId}/`, { audio_status: 'failed' });
              } catch (e) {}
            }
          });
        }
      }
    });

    const failSub = DeviceEventEmitter.addListener('onEmergencyAudioFailure', async (data: any) => {
      let parsed = data;
      if (typeof data === 'string') {
        try {
          parsed = JSON.parse(data);
        } catch {}
      }
      console.warn('[AUDIO_CAPTURE_FAILURE] Native emergency audio capture failed:', parsed);
      const activeId = activeEmergencyIdRef.current;
      if (activeId) {
        try {
          console.log(`[AUDIO_FAILURE] Updating emergency ${activeId} audio_status to 'recording_failed'`);
          await api.patch(`/history/${activeId}/`, { audio_status: 'recording_failed' });
        } catch (e) {
          console.warn('[AUDIO_FAILURE] Failed to report recording failure to backend:', e);
        }
      }
    });

    return () => {
      sub.remove();
      failSub.remove();
    };
  }, []);

  // Listen for native foreground service lifecycle events (e.g. user stopped via notification action)
  useEffect(() => {
    const unsub = protectionService.subscribeStateChanges({
      onStarted: () => {
        setIsProtectionActive(true);
      },
      onStopped: () => {
        setIsProtectionActive(false);
        setRms(0);
        setCountdown(null);
        setDecision('Normal');
      },
      onError: (err) => {
        setIsProtectionActive(false);
        setRms(0);
        setCountdown(null);
        setDecision('Normal');
        Alert.alert('Protection Mode Alert', err || 'Background voice monitoring stopped.');
      },
      onCountdownTick: (remaining: number) => {
        setCountdown(remaining);
      },
      onCountdownFinished: async () => {
        console.log('[SafeVoiceContext] Native onCountdownFinished: Auto-dispatching emergency SOS');
        setDecision('Confirmed');
        setCountdown(null);
        audioEvidenceService.finalizeCapture();
        if (sendEmergencyAlertRef.current) {
          const result = await sendEmergencyAlertRef.current('keyword');
          if (result?.success) {
            console.log('[SOS_DEBUG] Emergency alert successfully dispatched from native countdown!');
            Alert.alert('SOS Dispatched', result.message);
          } else {
            console.warn('[SOS_DEBUG] Dispatch alert encountered an issue:', result?.message);
            Alert.alert('Dispatch Alert', result?.message);
          }
        }
      },
      onCountdownCancelled: () => {
        console.log('[SafeVoiceContext] Native onCountdownCancelled');
        audioEvidenceService.cancelCapture();
        setCountdown(null);
        setDecision('Normal');
        setLocation(null);
        setKeywordCount(0);
        setRepetitionFactor(0);
        setEmergencyScore(0);
        lastKeywordTimeRef.current = 0;
        idempotencyKeyRef.current = null;
        activeEmergencyIdRef.current = null;
        latestAudioClipRef.current = null;
      },
    });

    return () => unsub();
  }, []);

  // Sync actual native service running state on mount and when app resumes from background
  useEffect(() => {
    const syncNativeState = async () => {
      try {
        const running = await protectionService.isServiceRunning();
        console.log(`[SafeVoiceContext] Syncing native service state: running=${running}, isProtectionActive=${isProtectionActive}`);
        if (!running && isProtectionActive) {
          setIsProtectionActive(false);
          setRms(0);
        } else if (running && !isProtectionActive) {
          setIsProtectionActive(true);
        }
      } catch (e) {
        console.warn('[SafeVoiceContext] Error syncing native service state:', e);
      }
    };

    syncNativeState();

    const appStateSub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        syncNativeState();
      }
    });

    return () => {
      appStateSub.remove();
    };
  }, [isProtectionActive]);

  useEffect(() => {
    console.log(`[SafeVoiceContext] useEffect triggered. isAuthenticated: ${isAuthenticated}, username available: ${!!username}`);
    
    if (!isAuthenticated || !username) {
      console.log('[SafeVoiceContext] Early return due to missing auth or username. Setting isLoaded=false');
      setProfileState({ name: '', phone: '' });
      setContacts([]);
      setIsLoaded(false);
      return;
    }

    const loadData = async () => {
      console.log('[SafeVoiceContext] loadData started for user');
      try {
        console.log('[SafeVoiceContext] Loading local profile');
        const storedProfile = await StorageService.loadProfile(username);
        if (storedProfile) setProfileState(storedProfile);
        
        const storedContacts = await StorageService.loadContacts(username);
        if (storedContacts) {
          setContacts(storedContacts);
        }

        const storedTrigger = await StorageService.loadCustomTrigger(username);
        if (storedTrigger && storedTrigger.trim().length > 0) {
          setCustomTriggerState(storedTrigger.trim());
          voskService.customTrigger = storedTrigger.trim();
        } else {
          setCustomTriggerState('help me');
          voskService.customTrigger = 'help me';
        }
      } catch (e) {
        console.error('[SafeVoiceContext] Failed to load local storage data', e);
      } finally {
        console.log('[SafeVoiceContext] Setting isLoaded to true');
        setIsLoaded(true);
      }
      
      try {
        console.log('[SafeVoiceContext] Fetching backend profile (/users/)');
        const profileResponse = await api.get('/users/');
        console.log(`[SafeVoiceContext] /users/ response status: ${profileResponse.status}`);
        if (profileResponse.data && profileResponse.data.length > 0) {
          const user = profileResponse.data[0];
          const backendProfile = {
            name: user.username || '',
            phone: user.phone_number || ''
          };
          setProfileState(backendProfile);
          StorageService.saveProfile(username, backendProfile);
        }
      } catch (e) {
        console.error('Failed to fetch profile from backend', e);
      }
      
      try {
        console.log('[SafeVoiceContext] Fetching backend contacts (/contacts/)');
        const response = await api.get('/contacts/');
        console.log(`[SafeVoiceContext] /contacts/ response status: ${response.status}`);
        const backendContacts = response.data.map((c: any) => ({
          id: c.id.toString(),
          name: c.name,
          phone: c.phone,
          has_registered_account: c.has_registered_account,
          has_fcm_token: c.has_fcm_token,
          fcm_status: c.fcm_status
        }));
        setContacts(backendContacts);
        StorageService.saveContacts(username, backendContacts);
      } catch (e) {
        console.error('Failed to fetch contacts from backend', e);
      }
    };
    loadData();
  }, [isAuthenticated, username]);

  // Set up Vosk Event Listeners ONLY ONCE on mount
  useEffect(() => {
    voskService.onStateChange = setVoskState;
    voskService.onPartialText = setRecognizedText;
    voskService.onRmsValue = setRms;
    
    voskService.onVoskError = (e) => {
      Alert.alert('Voice Recognition Error', e);
      setIsProtectionActive(false);
      setRms(0);
      voskService.stopListening();
    };

    return () => {
      voskService.onStateChange = undefined;
      voskService.onPartialText = undefined;
      voskService.onFinalText = undefined;
      voskService.onRmsValue = undefined;
      voskService.onVoskError = undefined;
    };
  }, []);

  // Update onFinalText listener
  useEffect(() => {
    voskService.onFinalText = (text, detection) => {
      setRecognizedText(text);
      if (detection.count > 0) {
        setDetectedKeywords(detection.matchedKeywords);
        setKeywordCount(prev => prev + detection.count);
        
        setRepetitionFactor(prevM => {
          const now = Date.now();
          let addedM = 0;
          if (lastKeywordTimeRef.current > 0 && (now - lastKeywordTimeRef.current < 60000)) {
            addedM = detection.count;
          } else {
            addedM = Math.max(0, detection.count - 1);
          }
          lastKeywordTimeRef.current = now;
          return prevM + addedM;
        });

        // Trigger SOS immediately if custom trigger was recognized
        if (detection.isCustomTrigger) {
          console.log(`[TRIGGER_DEBUG] Custom voice trigger detected in speech: "${text}"`);
          if (decisionRef.current === 'Normal' && countdownRef.current === null && !isSubmittingAlertRef.current) {
            setEmergencyScore(100);
            setDecision('Potential Emergency');
            setCountdown(10);
            const key = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
            idempotencyKeyRef.current = key;
            audioEvidenceService.triggerCapture(key);
            protectionService.startEmergencyCountdown(10);
            console.log(`[DECISION_DEBUG] Started emergency countdown from custom trigger.`);
          }
        }
      }
    };
  }, []);

  // Emergency Decision Engine calculation for standard keywords & RMS
  useEffect(() => {
    if (!isProtectionActive) return;

    const kScore = Math.min(keywordCount / 3, 1) * 100;
    const mScore = Math.min(repetitionFactor / 3, 1) * 100;
    const RMS_REFERENCE = 10000;
    const rmsScore = Math.min(Math.max((rms / RMS_REFERENCE) * 100, 0), 100);
    
    // Calculate composite score
    const score = (0.50 * kScore) + (0.30 * mScore) + (0.20 * rmsScore);
    
    // Only update emergencyScore if not already overridden to 100 by custom trigger
    if (decision !== 'Potential Emergency' && decision !== 'Confirmed') {
      setEmergencyScore(score);
    }
    
    const now = Date.now();
    if (now - lastLogTimeRef.current > 2000) {
      console.log(`[DECISION_DEBUG] K = ${keywordCount}, M = ${repetitionFactor}, RMS = ${rms.toFixed(2)}`);
      console.log(`[DECISION_DEBUG] Emergency Score = ${score.toFixed(1)}, Decision = ${decision}`);
      lastLogTimeRef.current = now;
    }
    
    if (score >= 70 && decision === 'Normal' && countdown === null && !isSubmittingAlertRef.current) {
      setDecision('Potential Emergency');
      setCountdown(10);
      const key = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
      idempotencyKeyRef.current = key;
      audioEvidenceService.triggerCapture(key);
      protectionService.startEmergencyCountdown(10);
      console.log(`[DECISION_DEBUG] Decision changed to Potential Emergency! Starting countdown.`);
    }
  }, [keywordCount, repetitionFactor, rms, decision, countdown, isProtectionActive]);

  // Unified Emergency Dispatch Function (used by voice countdown and manual button)
  const sendEmergencyAlert = async (
    triggerType: string = 'manual',
    providedScore?: number
  ): Promise<{ success: boolean; message: string; data?: any }> => {
    if (isSubmittingAlertRef.current) {
      return { success: false, message: 'An emergency alert is already being processed.' };
    }

    isSubmittingAlertRef.current = true;
    setIsSubmittingAlert(true);

    const key = (triggerType === 'manual' ? null : idempotencyKeyRef.current) || `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    idempotencyKeyRef.current = key;

    // Trigger audio capture for manual SOS
    if (triggerType === 'manual') {
      latestAudioClipRef.current = null;
      audioEvidenceService.triggerCapture(key);
    } else if (!latestAudioClipRef.current) {
      audioEvidenceService.triggerCapture(key);
    }

    let currentLoc: LocationData | 'error' | null = null;
    try {
      const hasPermission = await requestLocationPermission();
      if (hasPermission) {
        try {
          currentLoc = await getReadableLocation();
          setLocation(currentLoc);
          console.log(`[GPS_DEBUG] Location obtained for alert: ${currentLoc.latitude}, ${currentLoc.longitude}, address: ${currentLoc.resolved_address}`);
        } catch (e) {
          console.error('[LOCATION_DEBUG] Failed to get GPS coordinates:', e);
          currentLoc = 'error';
          setLocation('error');
        }
      } else {
        console.log('[LOCATION_DEBUG] Location permission denied.');
        currentLoc = 'error';
        setLocation('error');
      }

      const scoreToUse = providedScore !== undefined ? providedScore : (emergencyScore > 0 ? Math.round(emergencyScore) : 100);
      const validLoc = (currentLoc !== 'error' && currentLoc !== null && typeof currentLoc.latitude === 'number' && typeof currentLoc.longitude === 'number' && !(currentLoc.latitude === 0 && currentLoc.longitude === 0))
        ? currentLoc
        : null;
      const hasValidAddr = !!validLoc && !!validLoc.resolved_address && validLoc.resolved_address.trim().length > 0 && validLoc.resolved_address.toLowerCase() !== 'address unavailable';

      const isVoiceOrManual = triggerType === 'keyword' || triggerType === 'manual';
      const payload = {
        trigger_type: triggerType,
        score: scoreToUse,
        location_lat: validLoc ? validLoc.latitude : null,
        location_lng: validLoc ? validLoc.longitude : null,
        resolved_address: hasValidAddr && validLoc ? validLoc.resolved_address : null,
        google_maps_url: validLoc ? validLoc.google_maps_url : null,
        location_accuracy: validLoc ? validLoc.accuracy : null,
        idempotency_key: key,
        audio_status: isVoiceOrManual ? (latestAudioClipRef.current ? 'uploading' : 'preparing') : 'none'
      };

      console.log('[SOS_DEBUG] Dispatching emergency alert to /history/:', payload);
      const response = await api.post('/history/', payload);
      const message = response.data?.message || 'Emergency alert dispatched successfully.';
      console.log(`[SOS_DEBUG] /history/ response: status=${response.status}`, response.data);

      const emergencyId = response.data?.id;
      if (emergencyId) {
        activeEmergencyIdRef.current = emergencyId;
        if (latestAudioClipRef.current) {
          const { filePath, duration } = latestAudioClipRef.current;
          audioEvidenceService.associateEmergencyClip(emergencyId, filePath, duration);
          if (!uploadedEmergencyIdsRef.current.has(emergencyId)) {
            uploadedEmergencyIdsRef.current.add(emergencyId);
            console.log(`[AUDIO_UPLOAD] Uploading audio clip for emergency ID: ${emergencyId}`);
            api.patch(`/history/${emergencyId}/`, { audio_status: 'uploading' }).catch(() => {});
            audioEvidenceService.uploadEmergencyAudio(emergencyId, filePath, duration).then(async (res) => {
              console.log('[AUDIO_UPLOAD] Async upload completed:', res);
              if (!res.success) {
                uploadedEmergencyIdsRef.current.delete(emergencyId);
                try {
                  await api.patch(`/history/${emergencyId}/`, { audio_status: 'failed' });
                } catch (e) {}
              }
            });
          }
        }
      }

      return { success: true, message, data: response.data };
    } catch (err: any) {
      console.error('[SOS_DEBUG] Failed to dispatch emergency alert:', err);
      const errMsg = err.response?.data?.message || err.response?.data?.detail || err.message || 'Failed to dispatch emergency alert.';
      return { success: false, message: errMsg };
    } finally {
      idempotencyKeyRef.current = null;
      isSubmittingAlertRef.current = false;
      setIsSubmittingAlert(false);
    }
  };

  useEffect(() => {
    sendEmergencyAlertRef.current = sendEmergencyAlert;
  }, [sendEmergencyAlert]);

  // Unified GPS Location Share Function
  const shareGPSLocation = async (): Promise<{ success: boolean; message: string; location?: LocationData }> => {
    if (isSubmittingAlertRef.current) {
      return { success: false, message: 'A location request is already in progress.' };
    }

    isSubmittingAlertRef.current = true;
    setIsSubmittingAlert(true);

    try {
      const hasPermission = await requestLocationPermission();
      if (!hasPermission) {
        setLocation('error');
        return {
          success: false,
          message: 'Location permission was denied. Please enable location permissions in device settings to share GPS coordinates.'
        };
      }

      let currentLoc: LocationData;
      try {
        currentLoc = await getReadableLocation();
        setLocation(currentLoc);
        console.log(`[GPS_DEBUG] Location retrieved for sharing: ${currentLoc.latitude}, ${currentLoc.longitude}, address: ${currentLoc.resolved_address}`);
      } catch (e: any) {
        console.error('[LOCATION_DEBUG] Failed to get GPS coordinates for sharing:', e);
        setLocation('error');
        return {
          success: false,
          message: 'Unable to retrieve device GPS coordinates. Please ensure GPS is enabled and try again.'
        };
      }

      const key = `${Date.now()}-loc-${Math.random().toString(36).substring(7)}`;
      const payload = {
        trigger_type: 'location_share',
        score: 50,
        location_lat: currentLoc.latitude,
        location_lng: currentLoc.longitude,
        resolved_address: currentLoc.resolved_address || null,
        google_maps_url: currentLoc.google_maps_url || null,
        location_accuracy: currentLoc.accuracy || null,
        idempotency_key: key
      };

      console.log('[GPS_SHARE] Sending location share to backend:', payload);
      const response = await api.post('/history/', payload);
      const message = response.data?.message || `GPS coordinates shared: ${currentLoc.latitude.toFixed(5)}, ${currentLoc.longitude.toFixed(5)}`;
      return { success: true, message, location: currentLoc };
    } catch (err: any) {
      console.error('[GPS_SHARE] Failed to share location:', err);
      const errMsg = err.response?.data?.message || err.message || 'Failed to share location with emergency contacts.';
      return { success: false, message: errMsg };
    } finally {
      isSubmittingAlertRef.current = false;
      setIsSubmittingAlert(false);
    }
  };

  // Countdown Timer and Confirmation Reset
  useEffect(() => {
    if (!isProtectionActive) return;

    let timer: ReturnType<typeof setTimeout>;
    if (countdown !== null && countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    } else if (countdown === 0 && decision === 'Potential Emergency') {
      setDecision('Confirmed');
      setCountdown(null);
      console.log(`[DECISION_DEBUG] Emergency Confirmed! Finalizing audio evidence capture...`);
      audioEvidenceService.finalizeCapture();
      
      const executeAlert = async () => {
        const result = await sendEmergencyAlert('keyword');
        if (result.success) {
          console.log('[SOS_DEBUG] Backend confirmed SOS alert delivery!');
          protectionService.updateStatus(
            '🚨 Emergency SOS Dispatched',
            'Location and audio evidence sent to emergency contacts.'
          );
          Alert.alert('SOS Dispatched', result.message);
        } else {
          console.log('[SOS_DEBUG] Backend recorded SOS or dispatch encountered error.');
          Alert.alert('Dispatch Alert', result.message);
        }
      };
      executeAlert();
    } else if (decision === 'Confirmed') {
      // Hold the Confirmed display for 4 seconds then reset monitoring state
      timer = setTimeout(() => {
        setCountdown(null);
        setDecision('Normal');
        setLocation(null);
        setKeywordCount(0);
        setRepetitionFactor(0);
        setEmergencyScore(0);
        lastKeywordTimeRef.current = 0;
        idempotencyKeyRef.current = null;
        console.log(`[DECISION_DEBUG] Returning to Normal monitoring state.`);
      }, 4000);
    }
    return () => clearTimeout(timer);
  }, [countdown, decision, isProtectionActive]);

  const requestMicrophonePermission = async (): Promise<boolean> => {
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
        console.warn('[SafeVoiceContext] Error requesting RECORD_AUDIO permission:', e);
        return false;
      }
    }
    return true;
  };

  const startProtectionMode = async (): Promise<boolean> => {
    if (isProtectionActive) return true;

    // 1. Ensure notification permission is requested/granted (Android 13+)
    await requestNotificationPermission();

    // 2. Ensure microphone permission is granted
    const hasMicPermission = await requestMicrophonePermission();
    if (!hasMicPermission) {
      setIsProtectionActive(false);
      Alert.alert(
        'Microphone Permission Required',
        'SafeVoice requires microphone access to monitor for emergency keywords. Please grant microphone permission.'
      );
      return false;
    }
    
    setKeywordCount(0);
    setRepetitionFactor(0);
    setEmergencyScore(0);
    setCountdown(null);
    setDecision('Normal');
    setLocation(null);
    lastKeywordTimeRef.current = 0;
    setDetectedKeywords([]);
    setRecognizedText('');
    setRms(0);
    
    try {
      // 3. Start native Android Foreground Service with type microphone FIRST
      // This elevates process priority and grants background microphone recording access under Android 14+
      await protectionService.startForegroundService(
        'SafeVoice Protection Active',
        'Listening for emergency triggers...'
      );

      // 4. Start Vosk offline speech recognition
      const started = await voskService.startListening();
      if (!started) {
        await protectionService.stopForegroundService();
        setIsProtectionActive(false);
        Alert.alert('Microphone Error', 'Failed to start microphone or speech recognition service. Please check microphone permissions and try again.');
        return false;
      }
      setIsProtectionActive(true);
      return true;
    } catch (err: any) {
      console.error('Failed to start protection mode', err);
      await protectionService.stopForegroundService();
      setIsProtectionActive(false);
      Alert.alert('Microphone Error', err?.message || 'Unable to initialize audio capture. Please try again.');
      return false;
    }
  };

  const stopProtectionMode = async () => {
    protectionService.cancelEmergencyCountdown();
    setIsProtectionActive(false);
    setRms(0);
    setCountdown(null);
    setDecision('Normal');
    await voskService.stopListening();
    await protectionService.stopForegroundService();
  };

  const cancelEmergency = () => {
    protectionService.cancelEmergencyCountdown();
    audioEvidenceService.cancelCapture();
    setCountdown(null);
    setDecision('Normal');
    setLocation(null);
    setKeywordCount(0);
    setRepetitionFactor(0);
    setEmergencyScore(0);
    lastKeywordTimeRef.current = 0;
    idempotencyKeyRef.current = null;
    activeEmergencyIdRef.current = null;
    latestAudioClipRef.current = null;
    if (isProtectionActive) {
      protectionService.updateStatus(
        'SafeVoice Protection Active',
        'Listening for emergency triggers...'
      );
    }
    console.log('[DECISION_DEBUG] Emergency cancelled by user.');
  };

  const setCustomTrigger = async (phrase: string): Promise<boolean> => {
    const trimmed = (phrase || '').trim();
    if (trimmed.length < 2 || trimmed.length > 40 || !/[a-zA-Z]/.test(trimmed)) {
      return false;
    }
    setCustomTriggerState(trimmed);
    voskService.customTrigger = trimmed;
    if (username) {
      await StorageService.saveCustomTrigger(username, trimmed);
    }
    return true;
  };

  const setProfile = async (newProfile: Profile) => {
    setProfileState(newProfile);
    if (username) {
      StorageService.saveProfile(username, newProfile);
    }
    try {
      if (newProfile.phone) {
        await api.patch('/users/me/', { phone_number: newProfile.phone });
        console.log('[SafeVoiceContext] Successfully synced phone_number to backend /users/me/');
      }
    } catch (err) {
      console.error('[SafeVoiceContext] Failed to sync profile to backend:', err);
    }
  };
  
  const addContact = async (contact: Contact) => {
    try {
      const response = await api.post('/contacts/', {
        name: contact.name,
        phone: contact.phone
      });
      const newContact: Contact = {
        ...contact,
        id: response.data.id.toString(),
        has_registered_account: response.data.has_registered_account,
        has_fcm_token: response.data.has_fcm_token,
        fcm_status: response.data.fcm_status
      };
      const updated = [...contacts, newContact];
      setContacts(updated);
      if (username) StorageService.saveContacts(username, updated);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to save contact to the server.');
    }
  };
  
  const editContact = async (updatedContact: Contact) => {
    try {
      const response = await api.put(`/contacts/${updatedContact.id}/`, {
        name: updatedContact.name,
        phone: updatedContact.phone
      });
      const savedContact: Contact = {
        ...updatedContact,
        has_registered_account: response.data?.has_registered_account,
        has_fcm_token: response.data?.has_fcm_token,
        fcm_status: response.data?.fcm_status
      };
      const updated = contacts.map(c => c.id === updatedContact.id ? savedContact : c);
      setContacts(updated);
      if (username) StorageService.saveContacts(username, updated);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to update contact on the server.');
    }
  };

  const refreshContacts = async () => {
    try {
      const response = await api.get('/contacts/');
      const backendContacts = response.data.map((c: any) => ({
        id: c.id.toString(),
        name: c.name,
        phone: c.phone,
        has_registered_account: c.has_registered_account,
        has_fcm_token: c.has_fcm_token,
        fcm_status: c.fcm_status
      }));
      setContacts(backendContacts);
      if (username) StorageService.saveContacts(username, backendContacts);
    } catch (e) {
      console.error('Failed to refresh contacts from backend', e);
    }
  };
  
  const deleteContact = async (id: string) => {
    try {
      await api.delete(`/contacts/${id}/`);
      const updated = contacts.filter(c => c.id !== id);
      setContacts(updated);
      if (username) StorageService.saveContacts(username, updated);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to delete contact from the server.');
    }
  };

  return (
    <SafeVoiceContext.Provider
      value={{
        profile,
        setProfile,
        contacts,
        addContact,
        editContact,
        deleteContact,
        refreshContacts,
        isLoaded,

        customTrigger,
        setCustomTrigger,
        
        isProtectionActive,
        voskState,
        recognizedText,
        detectedKeywords,
        keywordCount,
        repetitionFactor,
        rms,
        emergencyScore,
        countdown,
        decision,
        location,

        isSubmittingAlert,
        sendEmergencyAlert,
        shareGPSLocation,

        startProtectionMode,
        stopProtectionMode,
        cancelEmergency,
      }}
    >
      {children}
    </SafeVoiceContext.Provider>
  );
};

export const useSafeVoice = () => useContext(SafeVoiceContext);
