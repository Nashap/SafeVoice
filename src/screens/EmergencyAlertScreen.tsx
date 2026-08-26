import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Header from '../components/Header';
import Button from '../components/Button';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';

export default function EmergencyAlertScreen() {
  const navigation = useNavigation();
  const [isAlertActive, setIsAlertActive] = useState(false);

  const handleSendAlert = () => {
    setIsAlertActive(true);
    Alert.alert(
      "Alert Triggered",
      "In Phase 1, network and SMS alerts are simulated.",
      [{ text: "OK" }]
    );
  };

  const handleShareLocation = () => {
    Alert.alert(
      "Location Shared",
      "Your GPS location would be sent to emergency contacts.",
      [{ text: "OK" }]
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Emergency" />
      <View style={styles.content}>
        <View style={styles.warningContainer}>
          <Text style={styles.warningIcon}>⚠️</Text>
          <Text style={styles.warningTitle}>Emergency Alert</Text>
          <Text style={styles.warningText}>
            Triggering an alert will notify your emergency contacts and share your current location.
          </Text>
        </View>

        <View style={styles.spacer} />

        {isAlertActive ? (
          <View style={styles.activeContainer}>
            <Text style={styles.activeText}>ALERT IS ACTIVE</Text>
            <Button 
              title="Cancel Alert"
              onPress={() => setIsAlertActive(false)}
              variant="secondary"
            />
          </View>
        ) : (
          <>
            <Button 
              title="SEND EMERGENCY ALERT"
              onPress={handleSendAlert}
              variant="danger"
              style={styles.mainAlertBtn}
              textStyle={styles.mainAlertBtnText}
            />
            <Button 
              title="Share GPS Location"
              onPress={handleShareLocation}
              variant="primary"
            />
          </>
        )}
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
  },
  warningContainer: {
    alignItems: 'center',
    marginTop: 32,
  },
  warningIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  warningTitle: {
    ...Typography.h1,
    color: Colors.error,
    marginBottom: 16,
  },
  warningText: {
    ...Typography.body1,
    textAlign: 'center',
    color: Colors.text,
  },
  spacer: {
    flex: 1,
  },
  mainAlertBtn: {
    paddingVertical: 32,
    marginBottom: 16,
  },
  mainAlertBtnText: {
    fontSize: 24,
  },
  activeContainer: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: Colors.error + '20',
    borderRadius: 16,
  },
  activeText: {
    ...Typography.h2,
    color: Colors.error,
    marginBottom: 24,
  }
});
