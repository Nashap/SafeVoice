import AsyncStorage from '@react-native-async-storage/async-storage';
import { Profile, Contact } from '../context/SafeVoiceContext';

const getProfileKey = (username: string) => `@safevoice/profile_${username}`;
const getContactsKey = (username: string) => `@safevoice/emergency_contacts_${username}`;

export const StorageService = {
  async saveProfile(username: string, profile: Profile): Promise<void> {
    try {
      const jsonValue = JSON.stringify(profile);
      await AsyncStorage.setItem(getProfileKey(username), jsonValue);
    } catch (e) {
      console.error('Failed to save profile', e);
    }
  },

  async loadProfile(username: string): Promise<Profile | null> {
    try {
      const jsonValue = await AsyncStorage.getItem(getProfileKey(username));
      return jsonValue != null ? JSON.parse(jsonValue) : null;
    } catch (e) {
      console.error('Failed to load profile', e);
      return null;
    }
  },

  async saveContacts(username: string, contacts: Contact[]): Promise<void> {
    try {
      const jsonValue = JSON.stringify(contacts);
      await AsyncStorage.setItem(getContactsKey(username), jsonValue);
    } catch (e) {
      console.error('Failed to save contacts', e);
    }
  },

  async loadContacts(username: string): Promise<Contact[] | null> {
    try {
      const jsonValue = await AsyncStorage.getItem(getContactsKey(username));
      return jsonValue != null ? JSON.parse(jsonValue) : null;
    } catch (e) {
      console.error('Failed to load contacts', e);
      return null;
    }
  },

  async saveCustomTrigger(username: string, trigger: string): Promise<void> {
    try {
      await AsyncStorage.setItem(`@safevoice/custom_trigger_${username}`, trigger);
    } catch (e) {
      console.error('Failed to save custom trigger', e);
    }
  },

  async loadCustomTrigger(username: string): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(`@safevoice/custom_trigger_${username}`);
    } catch (e) {
      console.error('Failed to load custom trigger', e);
      return null;
    }
  },

  async saveProtectionEnabled(username: string, enabled: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(`@safevoice/protection_enabled_${username}`, enabled ? 'true' : 'false');
    } catch (e) {
      console.error('[SafeVoiceProtection] Failed to save protection enabled state', e);
    }
  },

  async loadProtectionEnabled(username: string): Promise<boolean> {
    try {
      const val = await AsyncStorage.getItem(`@safevoice/protection_enabled_${username}`);
      return val === 'true';
    } catch (e) {
      console.error('[SafeVoiceProtection] Failed to load protection enabled state', e);
      return false;
    }
  },
};
