import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Header from '../components/Header';
import Button from '../components/Button';
import Card from '../components/Card';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { useSafeVoice } from '../context/SafeVoiceContext';

export default function EmergencyAlertScreen() {
  const navigation = useNavigation<any>();
  const { sendEmergencyAlert, shareGPSLocation, isSubmittingAlert, location } = useSafeVoice();
  const [isAlertActive, setIsAlertActive] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);

  const [lastEmergencyId, setLastEmergencyId] = useState<number | null>(null);

  const handleSendAlert = async () => {
    if (isSubmittingAlert) return;

    try {
      const result = await sendEmergencyAlert('manual', 100);
      if (result.success) {
        setIsAlertActive(true);
        setDispatchStatus(result.message);
        if (result.data?.id) {
          setLastEmergencyId(result.data.id);
        }
        Alert.alert(
          'Emergency Alert Dispatched',
          result.message || 'Your emergency alert was successfully dispatched to your registered emergency contacts.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Dispatch Error',
          result.message || 'Failed to dispatch SOS alert. Please try calling emergency services manually.',
          [{ text: 'OK' }]
        );
      }
    } catch (e: any) {
      Alert.alert(
        'Dispatch Error',
        e?.message || 'An unexpected error occurred while sending the emergency alert.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleShareLocation = async () => {
    if (isSubmittingAlert) return;

    try {
      const result = await shareGPSLocation();
      if (result.success) {
        setIsAlertActive(true);
        setDispatchStatus(result.message);
        Alert.alert(
          'Location Shared',
          result.message || 'Your actual GPS coordinates were successfully sent to your emergency contacts.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Location Notice',
          result.message || 'Could not obtain or share device GPS coordinates.',
          [{ text: 'OK' }]
        );
      }
    } catch (e: any) {
      Alert.alert(
        'Location Error',
        e?.message || 'Failed to retrieve or share location.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleResetAlert = () => {
    setIsAlertActive(false);
    setDispatchStatus(null);
    setLastEmergencyId(null);
  };

  return (
    <View style={styles.container}>
      <Header title="Emergency" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.warningContainer}>
          <Text style={styles.warningIcon}>⚠️</Text>
          <Text style={styles.warningTitle}>Emergency Alert</Text>
          <Text style={styles.warningText}>
            Triggering an alert immediately submits an SOS request, records the emergency event, and dispatches push notifications with your GPS coordinates to your registered emergency contacts.
          </Text>
        </View>

        {isSubmittingAlert && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.error} />
            <Text style={styles.loadingText}>Processing emergency request...</Text>
            <Text style={styles.loadingSubtext}>Acquiring GPS location and notifying contacts</Text>
          </View>
        )}

        {isAlertActive ? (
          <View style={styles.activeContainer}>
            <Text style={styles.activeText}>EMERGENCY ALERT SENT</Text>
            {dispatchStatus && (
              <Text style={styles.activeStatusText}>{dispatchStatus}</Text>
            )}
            {location && location !== 'error' && (
              <>
                {location.resolved_address && (
                  <Text style={[styles.activeLocationText, { fontWeight: 'bold', marginBottom: 4 }]}>
                    📍 {location.resolved_address}
                  </Text>
                )}
                <Text style={styles.activeLocationText}>
                  Coordinates: {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                </Text>
              </>
            )}
            <View style={{ height: 16 }} />
            {lastEmergencyId && (
              <Button
                title="View Incident Details & Evidence"
                onPress={() => navigation.navigate('EmergencyDetail', { emergencyId: lastEmergencyId })}
                variant="primary"
                style={{ marginBottom: 12 }}
              />
            )}
            <Button 
              title="Reset Status"
              onPress={handleResetAlert}
              variant="secondary"
            />
          </View>
        ) : (
          <View style={styles.actionSection}>
            <Button 
              title={isSubmittingAlert ? "SENDING ALERT..." : "SEND EMERGENCY ALERT"}
              onPress={handleSendAlert}
              variant="danger"
              style={styles.mainAlertBtn}
              textStyle={styles.mainAlertBtnText}
              disabled={isSubmittingAlert}
            />
            <Button 
              title={isSubmittingAlert ? "RETRIEVING GPS..." : "Share GPS Location"}
              onPress={handleShareLocation}
              variant="primary"
              disabled={isSubmittingAlert}
            />
            <Button 
              title="🎙️ View Incident History & Evidence"
              onPress={() => navigation.navigate('EmergencyDetail', {})}
              variant="secondary"
              style={{ marginTop: 12 }}
            />
          </View>
        )}

        <View style={styles.spacer} />

        <Button 
          title="Back to Home"
          onPress={() => navigation.navigate('Home')}
          variant="secondary"
          style={styles.backBtn}
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
    flexGrow: 1,
  },
  warningContainer: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  warningIcon: {
    fontSize: 56,
    marginBottom: 12,
  },
  warningTitle: {
    ...Typography.h1,
    color: Colors.error,
    marginBottom: 12,
  },
  warningText: {
    ...Typography.body1,
    textAlign: 'center',
    color: Colors.text,
    lineHeight: 22,
  },
  actionSection: {
    marginVertical: 16,
  },
  mainAlertBtn: {
    paddingVertical: 28,
    marginBottom: 16,
  },
  mainAlertBtnText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  loadingContainer: {
    alignItems: 'center',
    marginVertical: 20,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  loadingText: {
    ...Typography.body1,
    fontWeight: 'bold',
    color: Colors.error,
    marginTop: 10,
  },
  loadingSubtext: {
    ...Typography.body2,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  activeContainer: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
    borderWidth: 1,
    borderRadius: 12,
    marginVertical: 16,
  },
  activeText: {
    ...Typography.h2,
    color: Colors.error,
    marginBottom: 8,
    textAlign: 'center',
  },
  activeStatusText: {
    ...Typography.body2,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 18,
  },
  activeLocationText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
    marginBottom: 8,
  },
  spacer: {
    flex: 1,
    minHeight: 24,
  },
  backBtn: {
    marginTop: 16,
  }
});
