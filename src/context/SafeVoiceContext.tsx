import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { StorageService } from '../services/storage';

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
  isProtectionActive: boolean;
  setProtectionActive: (active: boolean) => void;
  isLoaded: boolean;
}

const defaultState: SafeVoiceContextType = {
  profile: { name: '', phone: '' },
  setProfile: () => {},
  contacts: [],
  addContact: () => {},
  editContact: () => {},
  deleteContact: () => {},
  isProtectionActive: false,
  setProtectionActive: () => {},
  isLoaded: false,
};

const SafeVoiceContext = createContext<SafeVoiceContextType>(defaultState);

export const SafeVoiceProvider = ({ children }: { children: ReactNode }) => {
  const [profile, setProfileState] = useState<Profile>({ name: '', phone: '' });
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isProtectionActive, setProtectionActive] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      const storedProfile = await StorageService.loadProfile();
      if (storedProfile) {
        setProfileState(storedProfile);
      }
      const storedContacts = await StorageService.loadContacts();
      if (storedContacts) {
        setContacts(storedContacts);
      }
      setIsLoaded(true);
    };
    loadData();
  }, []);

  const setProfile = (newProfile: Profile) => {
    setProfileState(newProfile);
    StorageService.saveProfile(newProfile);
  };
  
  const addContact = (contact: Contact) => {
    const updated = [...contacts, contact];
    setContacts(updated);
    StorageService.saveContacts(updated);
  };
  
  const editContact = (updatedContact: Contact) => {
    const updated = contacts.map(c => c.id === updatedContact.id ? updatedContact : c);
    setContacts(updated);
    StorageService.saveContacts(updated);
  };
  
  const deleteContact = (id: string) => {
    const updated = contacts.filter(c => c.id !== id);
    setContacts(updated);
    StorageService.saveContacts(updated);
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
        isProtectionActive,
        setProtectionActive,
        isLoaded,
      }}
    >
      {children}
    </SafeVoiceContext.Provider>
  );
};

export const useSafeVoice = () => useContext(SafeVoiceContext);
