import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, PermissionsAndroid, Platform, Alert, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Header from '../components/Header';
import Button from '../components/Button';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { useSafeVoice } from '../context/SafeVoiceContext';
import { voskService } from '../services/voskService';

export default function ProtectionModeScreen() {
  const navigation = useNavigation();
  const { isProtectionActive, setProtectionActive } = useSafeVoice();
  
  const [voskState, setVoskState] = useState<string>('stopped');
  const [recognizedText, setRecognizedText] = useState<string>('');
  const [detectedKeywords, setDetectedKeywords] = useState<string[]>([]);
  const [keywordCount, setKeywordCount] = useState<number>(0);

  useEffect(() => {
    // Setup Vosk UI callbacks
    voskService.onStateChange = setVoskState;
    
    voskService.onPartialText = (text) => {
      setRecognizedText(text);
    };
    
    voskService.onFinalText = (text, detection) => {
      setRecognizedText(text);
      if (detection.count > 0) {
        setDetectedKeywords(detection.matchedKeywords);
        setKeywordCount(prev => prev + detection.count);
      }
    };
    
    voskService.onVoskError = (e) => {
      Alert.alert('Voice Recognition Error', e);
      setProtectionActive(false);
    };

    return () => {
      // If we leave the screen but protection is active, it stays active in the background context
      // but in a real app you might need a foreground service. For now, we stop it if unmounting
      // unless we want it to run globally. We'll stop it on unmount for this phase testing.
      if (isProtectionActive) {
        setProtectionActive(false);
        voskService.stopListening();
      }
    };
  }, [isProtectionActive, setProtectionActive]);

  const requestMicrophonePermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission',
            message: 'SafeVoice needs access to your microphone to listen for emergency keywords offline.',
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
      setProtectionActive(false);
      await voskService.stopListening();
    } else {
      const hasPermission = await requestMicrophonePermission();
      if (!hasPermission) {
        Alert.alert('Permission Denied', 'Microphone permission is required for offline speech recognition.');
        return;
      }
      
      // Reset state for new session
      setKeywordCount(0);
      setDetectedKeywords([]);
      setRecognizedText('');
      
      setProtectionActive(true);
      await voskService.startListening();
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Protection Mode" />
      <ScrollView contentContainerStyle={styles.content}>
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
          Voice recognition runs locally on this device. When active, SafeVoice listens for emergency keywords without requiring an internet connection.
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
          onPress={() => navigation.goBack()}
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
  },
  spacer: {
    flex: 1,
    minHeight: 24,
  }
});
