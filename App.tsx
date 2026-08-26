import React from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SafeVoiceProvider } from './src/context/SafeVoiceContext';
import AppNavigator from './src/navigation/AppNavigator';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <SafeVoiceProvider>
        <AppNavigator />
      </SafeVoiceProvider>
    </SafeAreaProvider>
  );
}

export default App;
