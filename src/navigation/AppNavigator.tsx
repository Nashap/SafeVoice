import React from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { useAuth } from '../context/AuthContext';
import { ActivityIndicator, View, Text } from 'react-native';

import SplashScreen from '../screens/SplashScreen';
import HomeScreen from '../screens/HomeScreen';
import ProtectionModeScreen from '../screens/ProtectionModeScreen';
import EmergencyAlertScreen from '../screens/EmergencyAlertScreen';
import EmergencyContactsScreen from '../screens/EmergencyContactsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import EmergencyDetailScreen from '../screens/EmergencyDetailScreen';
import AlertHistoryScreen from '../screens/AlertHistoryScreen';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#dc2626' }}>
        <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: '#ffffff', justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
          <Text style={{ fontSize: 48 }}>🛡️</Text>
        </View>
        <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#ffffff', marginBottom: 12 }}>SafeVoice</Text>
        <ActivityIndicator size="small" color="#ffffff" />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Splash" component={SplashScreen} />
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="ProtectionMode" component={ProtectionModeScreen} />
            <Stack.Screen name="EmergencyAlert" component={EmergencyAlertScreen} />
            <Stack.Screen name="EmergencyContacts" component={EmergencyContactsScreen} />
            <Stack.Screen name="AlertHistory" component={AlertHistoryScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="EmergencyDetail" component={EmergencyDetailScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
