import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NavigationProps } from '../navigation/types';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';

export default function SplashScreen() {
  const navigation = useNavigation<NavigationProps>();

  useEffect(() => {
    const timer = setTimeout(() => {
      const state = navigation.getState();
      const currentRoute = state?.routes[state?.index]?.name;
      if (!currentRoute || currentRoute === 'Splash') {
        navigation.replace('Home');
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Text style={styles.iconText}>🛡️</Text>
      </View>
      <Text style={styles.title}>SafeVoice</Text>
      <Text style={styles.subtitle}>Intelligent Emergency Assistance</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 120,
    height: 120,
    backgroundColor: Colors.white,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  iconText: {
    fontSize: 60,
  },
  title: {
    ...Typography.h1,
    color: Colors.white,
    marginBottom: 8,
  },
  subtitle: {
    ...Typography.body1,
    color: Colors.white,
    opacity: 0.9,
  }
});
