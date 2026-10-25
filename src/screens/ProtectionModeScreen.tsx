import React, { useState } from 'react';
import { View, Text, StyleSheet, PermissionsAndroid, Platform, Alert, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Header from '../components/Header';
import Button from '../components/Button';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { useSafeVoice } from '../context/SafeVoiceContext';
import { voskService } from '../services/voskService';

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
    location,
    customTrigger,
    isSubmittingAlert
  } = useSafeVoice();

  const [isToggling, setIsToggling] = useState(false);

  const requestMicrophonePermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const hasPermission = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        if (hasPermission) {
          return true;
        }
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
    if (isToggling || isSubmittingAlert) return;
    setIsToggling(true);

    try {
      if (isProtectionActive) {
        await stopProtectionMode();
      } else {
        const hasPermission = await requestMicrophonePermission();
        if (!hasPermission) {
          Alert.alert(
            'Microphone Permission Required',
            'SafeVoice requires microphone access to monitor for emergency keywords. Please grant microphone permission and try again.'
          );
          return;
        }
        await startProtectionMode();
      }
    } finally {
      setIsToggling(false);
    }
  };

  // Determine user-friendly state string
  let currentStatusDisplay = 'Inactive';
  if (isProtectionActive) {
    if (decision === 'Potential Emergency' || countdown !== null) {
      currentStatusDisplay = 'Trigger Detected!';
    } else if (isSubmittingAlert) {
      currentStatusDisplay = 'Sending Alert...';
    } else if (decision === 'Confirmed') {
      currentStatusDisplay = 'Alert Accepted';
    } else if (voskState === 'listening') {
      currentStatusDisplay = 'Listening...';
    } else {
      currentStatusDisplay = voskState;
    }
  }

  return (
    <View style={styles.container}>
      <Header title="Protection Mode" />
      <ScrollView contentContainerStyle={styles.content}>
        
        {countdown !== null && decision === 'Potential Emergency' && (
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>POTENTIAL EMERGENCY DETECTED</Text>
            <Text style={styles.alertText}>Emergency Score: {emergencyScore.toFixed(1)}</Text>
            <Text style={styles.alertText}>Emergency SOS will dispatch in:</Text>
            <Text style={styles.countdownText}>{countdown}</Text>
            <Button title="CANCEL EMERGENCY" onPress={cancelEmergency} variant="danger" />
          </View>
        )}
        
        {decision === 'Confirmed' && (
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>EMERGENCY CONFIRMED</Text>
            <Text style={styles.alertText}>Emergency Score: {emergencyScore.toFixed(1)}</Text>
            <Text style={styles.alertText}>Emergency SOS alert has been dispatched.</Text>
            {location === 'error' ? (
              <Text style={styles.alertText}>
                Location: Unable to retrieve device GPS
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
          <View 
            style={[
              styles.indicator, 
              { 
                backgroundColor: decision === 'Potential Emergency'
                  ? Colors.warning 
                  : (isProtectionActive ? Colors.success : Colors.error) 
              }
            ]} 
          />
          <Text style={styles.statusText}>
            {isProtectionActive ? 'Protection Active' : 'Protection Inactive'}
          </Text>
          <Text style={[styles.stateText, decision === 'Potential Emergency' && { color: Colors.warning }]}>
            Status: {currentStatusDisplay}
          </Text>
        </View>

        {/* Configured Custom Trigger Word Indicator */}
        <View style={styles.triggerCard}>
          <View style={styles.triggerCardRow}>
            <Text style={styles.triggerLabel}>Active Trigger Word:</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
              <Text style={styles.triggerEditLink}>Change</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.triggerValue}>"{customTrigger || 'help me'}"</Text>
          <Text style={styles.triggerHint}>
            Say "{customTrigger || 'help me'}" clearly to activate the emergency SOS response immediately.
          </Text>
        </View>

        <Text style={styles.description}>
          SafeVoice listens offline for your trigger phrase. Voice monitoring runs in the background and does not transmit audio to third parties.
        </Text>

        {isProtectionActive && (
          <View style={styles.resultsContainer}>
            <Text style={styles.sectionTitle}>Recognized Speech:</Text>
            <Text style={styles.recognizedText}>
              {recognizedText && recognizedText.trim().length > 0 ? `"${recognizedText}"` : '(Listening for speech...)'}
            </Text>
            
            <Text style={styles.sectionTitle}>Detected Words:</Text>
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

            <View style={styles.divider} />
            <TouchableOpacity 
              style={styles.testVoiceButton}
              onPress={async () => {
                try {
                  const candidatePaths = [
                    '/data/user/0/com.mobile/cache/speech_help_me.wav',
                    '/sdcard/Download/speech_help_me.wav',
                    '/data/local/tmp/speech_help_me.wav',
                  ];
                  let fed = false;
                  for (const p of candidatePaths) {
                    fed = await voskService.feedAudioFile(p);
                    if (fed) {
                      console.log('[TEST_VOICE] Successfully fed audio file:', p);
                      break;
                    }
                  }
                  if (!fed) {
                    Alert.alert('Notice', 'Audio test file not found at: /data/user/0/com.mobile/cache/speech_help_me.wav');
                  }
                } catch (e: any) {
                  console.warn('[TEST_VOICE_ERROR]', e);
                }
              }}
            >
              <Text style={styles.testVoiceButtonText}>🎤 Test Spoken Voice Trigger</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.spacer} />

        <Button 
          title={
            isToggling 
              ? "Updating..." 
              : (isProtectionActive ? "Stop Protection Mode" : "Activate Protection Mode")
          }
          onPress={handleToggle}
          variant={isProtectionActive ? 'secondary' : 'primary'}
          disabled={isToggling || isSubmittingAlert}
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
    marginTop: 12,
    marginBottom: 20,
  },
  indicator: {
    width: 90,
    height: 90,
    borderRadius: 45,
    marginBottom: 14,
  },
  statusText: {
    ...Typography.h2,
    color: Colors.text,
  },
  stateText: {
    ...Typography.body1,
    color: Colors.primary,
    marginTop: 6,
    fontWeight: 'bold',
  },
  triggerCard: {
    width: '100%',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
  },
  triggerCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  triggerLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  triggerEditLink: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.primary,
    textDecorationLine: 'underline',
  },
  triggerValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.primary,
    marginVertical: 4,
  },
  triggerHint: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  description: {
    ...Typography.body2,
    textAlign: 'center',
    color: Colors.textSecondary,
    paddingHorizontal: 16,
    marginBottom: 20,
    lineHeight: 18,
  },
  resultsContainer: {
    width: '100%',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
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
    marginBottom: 20,
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
    marginVertical: 12,
  },
  spacer: {
    flex: 1,
    minHeight: 20,
  },
  testVoiceButton: {
    backgroundColor: '#eff6ff',
    borderWidth: 1.5,
    borderColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginVertical: 4,
    width: '100%',
  },
  testVoiceButtonText: {
    ...Typography.body1,
    color: '#1d4ed8',
    fontWeight: 'bold',
  },
});
