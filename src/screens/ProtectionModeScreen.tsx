import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Header from '../components/Header';
import Button from '../components/Button';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { useSafeVoice } from '../context/SafeVoiceContext';

export default function ProtectionModeScreen() {
  const navigation = useNavigation();
  const { isProtectionActive, setProtectionActive } = useSafeVoice();

  const handleToggle = () => {
    setProtectionActive(!isProtectionActive);
    // Simulate toggling mode
  };

  return (
    <View style={styles.container}>
      <Header title="Protection Mode" />
      <View style={styles.content}>
        <View style={styles.statusContainer}>
          <View style={[styles.indicator, { backgroundColor: isProtectionActive ? Colors.success : Colors.error }]} />
          <Text style={styles.statusText}>
            {isProtectionActive ? 'Monitoring Active' : 'Monitoring Disabled'}
          </Text>
        </View>
        
        <Text style={styles.description}>
          When active, SafeVoice listens for emergency keywords locally on your device without requiring an internet connection.
        </Text>

        <View style={styles.spacer} />

        <Button 
          title={isProtectionActive ? "Deactivate Protection" : "Activate Protection"}
          onPress={handleToggle}
          variant={isProtectionActive ? 'secondary' : 'primary'}
        />
        <Button 
          title="Back to Home"
          onPress={() => navigation.goBack()}
          variant="secondary"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
  },
  statusContainer: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 24,
  },
  indicator: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 24,
  },
  statusText: {
    ...Typography.h2,
    color: Colors.text,
  },
  description: {
    ...Typography.body1,
    textAlign: 'center',
    color: Colors.textSecondary,
    paddingHorizontal: 16,
  },
  spacer: {
    flex: 1,
  }
});
