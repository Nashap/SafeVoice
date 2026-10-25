import React, { createContext, useState, useContext, ReactNode, useEffect, useRef } from 'react';
import { DeviceEventEmitter } from 'react-native';
import * as Keychain from 'react-native-keychain';
import api from '../services/api';
import { getFCMToken, requestNotificationPermission, setupTokenRefreshListener } from '../services/notificationService';

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
  const tokenRefreshUnsubRef = useRef<(() => void) | null>(null);

  const registerDeviceToken = async (accessToken?: string) => {
    try {
      await requestNotificationPermission();
      const fcmToken = await getFCMToken();
      if (fcmToken) {
        const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
        await api.post('/devices/', { token: fcmToken }, { headers });
        console.log('[FCM] Device token registered automatically with backend');
      }
    } catch (e) {
      console.error('[FCM] Automatic device token registration failed:', e);
    }
  };

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('auth_error', () => {
      console.log('[Auth] Intercepted auth_error, logging out');
      setIsAuthenticated(false);
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
            console.log('[AuthContext] Missing username in keychain. Fetching from /users/me/');
            try {
              const userResponse = await api.get('/users/me/', {
                headers: { Authorization: `Bearer ${tokens.access}` }
              });
              if (userResponse.data?.username) {
                currentUsername = userResponse.data.username;
                console.log(`[AuthContext] Fetched username from API: ${currentUsername}`);
                await Keychain.setGenericPassword('auth', JSON.stringify({ ...tokens, username: currentUsername }));
              }
            } catch (e) {
              console.error("[AuthContext] Failed to fetch username from /users/me/", e);
            }
          }
          
          console.log(`[AuthContext] setUsername called with: ${currentUsername}`);
          setUsername(currentUsername || null);
          setIsAuthenticated(true);
          setIsLoading(false);
          
          // Automatically register device token asynchronously in the background
          registerDeviceToken(tokens.access).catch((err) => {
            console.warn('[AuthContext] Background token registration on startup deferred:', err);
          });
          return;
        }
      } catch (e) {
        console.error('Failed to restore auth state', e);
      } finally {
        setIsLoading(false);
      }
    };
    checkToken();

    // Listen for FCM token refresh events and automatically sync with backend
    tokenRefreshUnsubRef.current = setupTokenRefreshListener(async (newToken) => {
      try {
        console.log('[AuthContext] Processing FCM token refresh...');
        await api.post('/devices/', { token: newToken });
        console.log('[AuthContext] Refreshed FCM token registered successfully with backend');
      } catch (err) {
        console.error('[AuthContext] Failed to sync refreshed token with backend:', err);
      }
    });

    return () => {
      sub.remove();
      if (tokenRefreshUnsubRef.current) {
        tokenRefreshUnsubRef.current();
      }
    };
  }, []);

  const login = async (tokens: { access: string; refresh: string }, usernameStr: string) => {
    await Keychain.setGenericPassword('auth', JSON.stringify({ ...tokens, username: usernameStr }));
    setIsAuthenticated(true);
    setUsername(usernameStr);
    
    // Automatically register FCM device token in background without blocking screen transition
    registerDeviceToken(tokens.access).catch((err) => {
      console.warn('[AuthContext] Background device token registration on login:', err);
    });
  };

  const logout = async () => {
    try {
      const fcmToken = await getFCMToken();
      if (fcmToken) {
        try {
          await api.post('/devices/unregister/', { token: fcmToken });
          console.log('[FCM] Token unregistered via /devices/unregister/');
        } catch {
          await api.delete(`/devices/${fcmToken}/`);
          console.log('[FCM] Token unregistered via DELETE fallback');
        }
      }
    } catch (e) {
      console.error('[FCM] Failed to unregister device token on logout:', e);
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
