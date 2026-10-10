import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { DeviceEventEmitter } from 'react-native';
import * as Keychain from 'react-native-keychain';
import api from '../services/api';
import { getFCMToken } from '../services/notificationService';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  username: string | null;
  login: (tokens: { access: string; refresh: string }, username: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('auth_error', () => {
      console.log('[Auth] Intercepted auth_error, logging out');
      setIsAuthenticated(false);
    setUsername(null);
      setUsername(null);
    });

    const checkToken = async () => {
      console.log('[AuthContext] checkToken started');
      try {
        const credentials = await Keychain.getGenericPassword();
        console.log(`[AuthContext] credentials found: ${!!credentials}`);
        if (credentials) {
          const tokens = JSON.parse(credentials.password);
          let currentUsername = tokens.username;
          
          if (!currentUsername) {
            console.log('[AuthContext] Missing username in keychain. Fetching from /users/');
            try {
              const userResponse = await api.get('/users/', {
                headers: { Authorization: `Bearer ${tokens.access}` }
              });
              if (userResponse.data && userResponse.data.length > 0) {
                currentUsername = userResponse.data[0].username;
                console.log(`[AuthContext] Fetched username from API: ${currentUsername}`);
                await Keychain.setGenericPassword('auth', JSON.stringify({ ...tokens, username: currentUsername }));
              }
            } catch (e) {
              console.error("[AuthContext] Failed to fetch username for backward compatibility", e);
            }
          }
          
          console.log(`[AuthContext] setUsername called with: ${currentUsername}`);
          setUsername(currentUsername || null);
          setIsAuthenticated(true);
          // Register FCM token on app load if already authenticated
          try {
            const fcmToken = await getFCMToken();
            if (fcmToken) {
              await api.post('/devices/', { token: fcmToken }, {
                headers: { Authorization: `Bearer ${tokens.access}` }
              });
              console.log('[FCM] Token registered with backend on app load');
            }
          } catch (e) {
            console.error('[FCM] Failed to register device token on app load', e);
          }
        }
      } catch (e) {
        console.error('Failed to restore auth state', e);
      } finally {
        setIsLoading(false);
      }
    };
    checkToken();
    return () => sub.remove();
  }, []);

  const login = async (tokens: { access: string; refresh: string }, usernameStr: string) => {
    await Keychain.setGenericPassword('auth', JSON.stringify({ ...tokens, username: usernameStr }));
    setIsAuthenticated(true);
    setUsername(usernameStr);
    
    // Register FCM token
    try {
      const fcmToken = await getFCMToken();
      if (fcmToken) {
        await api.post('/devices/', { token: fcmToken }, {
          headers: { Authorization: `Bearer ${tokens.access}` }
        });
        console.log('[FCM] Token registered with backend');
      }
    } catch (e) {
      console.error('[FCM] Failed to register device token with backend', e);
    }
  };

  const logout = async () => {
    try {
      const fcmToken = await getFCMToken();
      if (fcmToken) {
        await api.delete(`/devices/${fcmToken}/`);
        console.log('[FCM] Token unregistered from backend');
      }
    } catch (e) {
      console.error('[FCM] Failed to unregister device token', e);
    }
    await Keychain.resetGenericPassword();
    setIsAuthenticated(false);
    setUsername(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, username, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
