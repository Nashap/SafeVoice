import AsyncStorage from '@react-native-async-storage/async-storage';
import { Profile, Contact } from '../context/SafeVoiceContext';

const PROFILE_KEY = '@safevoice/profile';
const CONTACTS_KEY = '@safevoice/emergency_contacts';

export const StorageService = {
  async saveProfile(profile: Profile): Promise<void> {
    try {
      const jsonValue = JSON.stringify(profile);
      await AsyncStorage.setItem(PROFILE_KEY, jsonValue);
    } catch (e) {
      console.error('Failed to save profile', e);
    }
  },

  async loadProfile(): Promise<Profile | null> {
    try {
      const jsonValue = await AsyncStorage.getItem(PROFILE_KEY);
      return jsonValue != null ? JSON.parse(jsonValue) : null;
    } catch (e) {
      console.error('Failed to load profile', e);
      return null;
    }
  },

  async saveContacts(contacts: Contact[]): Promise<void> {
    try {
      const jsonValue = JSON.stringify(contacts);
      await AsyncStorage.setItem(CONTACTS_KEY, jsonValue);
    } catch (e) {
      console.error('Failed to save contacts', e);
    }
  },

  async loadContacts(): Promise<Contact[] | null> {
    try {
      const jsonValue = await AsyncStorage.getItem(CONTACTS_KEY);
      return jsonValue != null ? JSON.parse(jsonValue) : null;
    } catch (e) {
      console.error('Failed to load contacts', e);
      return null;
    }
  },
};
