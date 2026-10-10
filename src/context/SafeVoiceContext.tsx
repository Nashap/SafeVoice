import React, { createContext, useState, useContext, ReactNode, useEffect, useRef } from 'react';
import api from '../services/api';
import { Alert } from 'react-native';
import { useAuth } from './AuthContext';
import { StorageService } from '../services/storage';
import { voskService } from '../services/voskService';
import { requestLocationPermission, getCurrentLocation, LocationData } from '../services/locationService';

export interface Contact {
  id: string;
  name: string;
  phone: string;
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
  isLoaded: boolean;

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
  isLoaded: false,

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

  const lastKeywordTimeRef = useRef<number>(0);
  const lastLogTimeRef = useRef<number>(0);
  const idempotencyKeyRef = useRef<string | null>(null);

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
          phone: c.phone
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
      stopProtectionMode();
    };

    return () => {
      // Clean up listeners on unmount (only happens if the entire app closes)
      voskService.onStateChange = undefined;
      voskService.onPartialText = undefined;
      voskService.onFinalText = undefined;
      voskService.onRmsValue = undefined;
      voskService.onVoskError = undefined;
    };
  }, []);

  // Update onFinalText listener so it always uses latest state via setState functions
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
      }
    };
  }, []);

  // Emergency Decision Engine calculation
  useEffect(() => {
    if (!isProtectionActive) return;

    const kScore = Math.min(keywordCount / 3, 1) * 100;
    const mScore = Math.min(repetitionFactor / 3, 1) * 100;
    const RMS_REFERENCE = 10000;
    const rmsScore = Math.min(Math.max((rms / RMS_REFERENCE) * 100, 0), 100);
    
    const score = (0.50 * kScore) + (0.30 * mScore) + (0.20 * rmsScore);
    setEmergencyScore(score);
    
    const now = Date.now();
    if (now - lastLogTimeRef.current > 2000) {
      console.log(`[DECISION_DEBUG] K = ${keywordCount}, M = ${repetitionFactor}, RMS = ${rms.toFixed(2)}`);
      console.log(`[DECISION_DEBUG] Emergency Score = ${score.toFixed(1)}, Decision = ${decision}`);
      lastLogTimeRef.current = now;
    }
    
    if (score >= 70 && decision === 'Normal' && countdown === null) {
      setDecision('Potential Emergency');
      setCountdown(10);
      idempotencyKeyRef.current = new Date().getTime().toString() + '-' + Math.random().toString(36).substring(7);
      console.log(`[DECISION_DEBUG] Decision changed to Potential Emergency! Starting countdown.`);
    }
  }, [keywordCount, repetitionFactor, rms, decision, countdown, isProtectionActive]);

  // Countdown Timer and Confirmation Reset
  useEffect(() => {
    if (!isProtectionActive) return;

    let timer: ReturnType<typeof setTimeout>;
    if (countdown !== null && countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    } else if (countdown === 0 && decision === 'Potential Emergency') {
      setDecision('Confirmed');
      setCountdown(null);
      console.log(`[DECISION_DEBUG] Emergency Confirmed!`);
      
      const fetchLocationAndAlert = async () => {
        let currentLoc: LocationData | 'error' | null = null;
        const hasPermission = await requestLocationPermission();
        if (hasPermission) {
          try {
            currentLoc = await getCurrentLocation();
            setLocation(currentLoc);
            console.log(`[GPS_DEBUG] location state updated`);
          } catch (e) {
            console.error('[LOCATION_DEBUG] Failed to get location:', e);
            currentLoc = 'error';
            setLocation('error');
            console.log(`[GPS_DEBUG] location state updated`);
          }
        } else {
          console.log('[LOCATION_DEBUG] Location permission denied.');
          currentLoc = 'error';
          setLocation('error');
          console.log(`[GPS_DEBUG] location state updated`);
        }

        try {
          const payload = {
            trigger_type: 'keyword',
            score: Math.round(emergencyScore),
            location_lat: currentLoc !== 'error' && currentLoc ? currentLoc.latitude : null,
            location_lng: currentLoc !== 'error' && currentLoc ? currentLoc.longitude : null,
            idempotency_key: idempotencyKeyRef.current
          };
          const response = await api.post('/history/', payload);
          if (response.data.status === 'dispatched') {
            console.log('[SOS_DEBUG] Backend confirmed SOS alert delivery!');
            Alert.alert('SOS Dispatched', response.data.message || 'Your emergency alert was successfully dispatched.');
          } else {
            console.log('[SOS_DEBUG] Backend recorded SOS but dispatch failed.');
            Alert.alert('SOS Recorded', response.data.message || 'SOS recorded, but push notifications failed. Please call for help.');
          }
        } catch (e) {
          console.error('[SOS_DEBUG] Backend failed to record SOS.', e);
          Alert.alert('Dispatch Error', 'Failed to dispatch SOS alert. Please try calling emergency services manually.');
        }
      };
      fetchLocationAndAlert();
    } else if (decision === 'Confirmed') {
      // Hold the Confirmed display for 3 seconds then reset monitoring state
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
      }, 3000);
    }
    return () => clearTimeout(timer);
  }, [countdown, decision, isProtectionActive]);

  const startProtectionMode = async (): Promise<boolean> => {
    if (isProtectionActive) return true;
    
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
    
    setIsProtectionActive(true);
    await voskService.startListening();
    return true;
  };

  const stopProtectionMode = async () => {
    if (!isProtectionActive) return;
    setIsProtectionActive(false);
    await voskService.stopListening();
  };

  const cancelEmergency = () => {
    setCountdown(null);
    setDecision('Normal');
    setLocation(null);
    setKeywordCount(0);
    setRepetitionFactor(0);
    setEmergencyScore(0);
    lastKeywordTimeRef.current = 0;
    idempotencyKeyRef.current = null;
  };

  const setProfile = (newProfile: Profile) => {
    setProfileState(newProfile);
    if (username) {
      StorageService.saveProfile(username, newProfile);
    }
  };
  
  const addContact = async (contact: Contact) => {
    try {
      const response = await api.post('/contacts/', {
        name: contact.name,
        phone: contact.phone
      });
      const newContact = { ...contact, id: response.data.id.toString() };
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
      await api.put(`/contacts/${updatedContact.id}/`, {
        name: updatedContact.name,
        phone: updatedContact.phone
      });
      const updated = contacts.map(c => c.id === updatedContact.id ? updatedContact : c);
      setContacts(updated);
      if (username) StorageService.saveContacts(username, updated);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to update contact on the server.');
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
        isLoaded,
        
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
