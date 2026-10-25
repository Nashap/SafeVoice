import React, { useEffect } from 'react';
import { requestNotificationPermission, getFCMToken, setupNotificationListeners } from './src/services/notificationService';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SafeVoiceProvider } from './src/context/SafeVoiceContext';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  useEffect(() => {
    const initPush = async () => {
      await requestNotificationPermission();
      await getFCMToken();
    };
    initPush();
    const cleanupListeners = setupNotificationListeners();
    return () => {
      cleanupListeners();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AuthProvider>
        <SafeVoiceProvider>
          <AppNavigator />
        </SafeVoiceProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

export default App;
