import React from 'react';
import { View, Text, StyleSheet, PermissionsAndroid, Platform, Alert, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Header from '../components/Header';
import Button from '../components/Button';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { useSafeVoice } from '../context/SafeVoiceContext';

export default function ProtectionModeScreen() {
  const navigation = useNavigation<any>();
  const { 
    isProtectionActive, 
    voskState,
    recognizedText,
    detectedKeywords,
    keywordCount,
    repetitionFactor,
    rms,
    emergencyScore,
    countdown,
    decision,
    startProtectionMode,
    stopProtectionMode,
    cancelEmergency,
    location
  } = useSafeVoice();

  const requestMicrophonePermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission',
            message: 'SafeVoice needs access to your microphone for emergency voice monitoring.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          },
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn(err);
        return false;
      }
    }
    return true;
  };

  const handleToggle = async () => {
    if (isProtectionActive) {
      await stopProtectionMode();
    } else {
      const hasPermission = await requestMicrophonePermission();
      if (!hasPermission) {
        Alert.alert('Permission Denied', 'Microphone permission is required.');
        return;
      }
      await startProtectionMode();
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Protection Mode" />
      <ScrollView contentContainerStyle={styles.content}>
        
        {countdown !== null && decision === 'Potential Emergency' && (
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>POTENTIAL EMERGENCY DETECTED</Text>
            <Text style={styles.alertText}>Emergency Score: {emergencyScore.toFixed(1)}</Text>
            <Text style={styles.alertText}>Emergency response will begin in:</Text>
            <Text style={styles.countdownText}>{countdown}</Text>
            <Button title="CANCEL EMERGENCY" onPress={cancelEmergency} variant="danger" />
          </View>
        )}
        
        {decision === 'Confirmed' && (
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>EMERGENCY CONFIRMED</Text>
            <Text style={styles.alertText}>Emergency Score: {emergencyScore.toFixed(1)}</Text>
            <Text style={styles.alertText}>Emergency response would now begin.</Text>
            {location === 'error' ? (
              <Text style={styles.alertText}>
                Location: Unable to retrieve location
              </Text>
            ) : location !== null ? (
              <Text style={styles.alertText}>
                Location: {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
              </Text>
            ) : null}
            <Button title="RESET" onPress={cancelEmergency} variant="secondary" />
          </View>
        )}

        <View style={styles.statusContainer}>
          <View style={[styles.indicator, { backgroundColor: isProtectionActive ? Colors.success : Colors.error }]} />
          <Text style={styles.statusText}>
            {isProtectionActive ? 'Protection Active' : 'Protection Inactive'}
          </Text>
          {isProtectionActive && (
            <Text style={styles.stateText}>
              Status: {voskState === 'listening' ? 'Listening...' : voskState}
            </Text>
          )}
        </View>
        
        <Text style={styles.description}>
          Emergency voice monitoring is running in the background. It will continue running even if you navigate away or minimize the app.
        </Text>

        {isProtectionActive && (
          <View style={styles.resultsContainer}>
            <Text style={styles.sectionTitle}>Recognized:</Text>
            <Text style={styles.recognizedText}>
              {recognizedText ? `"${recognizedText}"` : '...'}
            </Text>
            
            <Text style={styles.sectionTitle}>Detected:</Text>
            <Text style={styles.detectedKeywords}>
              {detectedKeywords.length > 0 ? detectedKeywords.join(', ') : 'None'}
            </Text>
            
            <Text style={styles.keywordCount}>
              Keyword Count: K = {keywordCount}
            </Text>
            <Text style={styles.keywordCount}>
              Repetition Factor: M = {repetitionFactor}
            </Text>
            
            <Text style={styles.sectionTitle}>Audio Energy:</Text>
            <Text style={styles.rmsText}>
              RMS: {rms.toFixed(2)}
            </Text>

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>Decision Engine:</Text>
            <Text style={styles.bodyText}>Emergency Score: {emergencyScore.toFixed(1)}</Text>
            <Text style={styles.bodyText}>Decision: {decision}</Text>
          </View>
        )}

        <View style={styles.spacer} />

        <Button 
          title={isProtectionActive ? "Stop Protection Mode" : "Activate Protection Mode"}
          onPress={handleToggle}
          variant={isProtectionActive ? 'secondary' : 'primary'}
        />
        <View style={{ height: 16 }} />
        <Button 
          title="Back to Home"
          onPress={() => navigation.navigate('Home')}
          variant="secondary"
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 24,
    alignItems: 'center',
    flexGrow: 1,
  },
  statusContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 24,
  },
  indicator: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
  },
  statusText: {
    ...Typography.h2,
    color: Colors.text,
  },
  stateText: {
    ...Typography.body1,
    color: Colors.primary,
    marginTop: 8,
    fontWeight: 'bold',
  },
  description: {
    ...Typography.body1,
    textAlign: 'center',
    color: Colors.textSecondary,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  resultsContainer: {
    width: '100%',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 24,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.text,
    marginBottom: 8,
  },
  recognizedText: {
    ...Typography.body1,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: 16,
  },
  detectedKeywords: {
    ...Typography.body1,
    color: Colors.error,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  keywordCount: {
    ...Typography.h3,
    color: Colors.primary,
    textAlign: 'center',
    marginBottom: 8,
  },
  rmsText: {
    ...Typography.h3,
    color: Colors.secondary,
    textAlign: 'center',
  },
  bodyText: {
    ...Typography.body1,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 16,
  },
  alertBox: {
    backgroundColor: '#ffebee',
    padding: 20,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#f44336',
    width: '100%',
    alignItems: 'center',
    marginBottom: 24,
  },
  alertTitle: {
    ...Typography.h2,
    color: '#d32f2f',
    marginBottom: 8,
    textAlign: 'center',
  },
  alertText: {
    ...Typography.body1,
    color: '#d32f2f',
    marginBottom: 8,
    textAlign: 'center',
  },
  countdownText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#d32f2f',
    marginVertical: 16,
  },
  spacer: {
    flex: 1,
    minHeight: 24,
  }
});
