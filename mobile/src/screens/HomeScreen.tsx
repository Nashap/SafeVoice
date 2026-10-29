import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NavigationProps } from '../navigation/types';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import Button from '../components/Button';
import Card from '../components/Card';
import { useSafeVoice } from '../context/SafeVoiceContext';

export default function HomeScreen() {
  const navigation = useNavigation<NavigationProps>();
  const { isProtectionActive, listeningState, listeningError, profile } = useSafeVoice();

  let statusLabel = 'INACTIVE';
  let statusColor = Colors.error;
  let statusDesc = 'Turn on to enable offline emergency voice detection';

  switch (listeningState) {
    case 'starting':
      statusLabel = 'STARTING...';
      statusColor = Colors.warning;
      statusDesc = 'Initializing microphone and background service...';
      break;
    case 'listening':
      statusLabel = 'ACTIVE';
      statusColor = Colors.success;
      statusDesc = 'Voice monitoring is active and listening for emergency triggers';
      break;
    case 'recovering':
      statusLabel = 'RECOVERING...';
      statusColor = Colors.warning;
      statusDesc = listeningError || 'Re-establishing microphone monitoring...';
      break;
    case 'stopping':
      statusLabel = 'STOPPING...';
      statusColor = Colors.textSecondary;
      statusDesc = 'Stopping voice monitoring and releasing audio resources...';
      break;
    case 'error':
      statusLabel = 'ERROR';
      statusColor = Colors.error;
      statusDesc = listeningError || 'Listening stopped unexpectedly. Tap to check protection.';
      break;
    case 'disabled':
    default:
      statusLabel = 'INACTIVE';
      statusColor = Colors.error;
      statusDesc = 'Turn on to enable offline emergency voice detection';
      break;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>SafeVoice</Text>
        <Text style={styles.greeting}>Hello, {profile.name || 'User'}</Text>
      </View>

      <Card style={styles.statusCard}>
        <Text style={styles.statusTitle}>Protection Status</Text>
        <Text style={[styles.statusValue, { color: statusColor }]}>
          {statusLabel}
        </Text>
        <Text style={styles.statusDesc}>
          {statusDesc}
        </Text>
        
        <Button 
          title={
            listeningState === 'starting'
              ? "Starting..."
              : listeningState === 'stopping'
              ? "Stopping..."
              : isProtectionActive
              ? "Stop Protection"
              : "Activate Protection Mode"
          } 
          onPress={() => navigation.navigate('ProtectionMode')} 
          variant={isProtectionActive ? 'secondary' : 'primary'}
          style={styles.actionBtn}
        />
      </Card>

      <View style={styles.grid}>
        <Card style={styles.gridCard}>
          <Button 
            title="🚨 Emergency Alert" 
            onPress={() => navigation.navigate('EmergencyAlert')}
            variant="danger"
            style={styles.alertBtn}
          />
        </Card>
      </View>

      <View style={styles.shortcuts}>
        <Button 
          title="👥 Emergency Contacts" 
          onPress={() => navigation.navigate('EmergencyContacts')} 
          variant="secondary"
        />
        <Button 
          title="🚨 ALERT HISTORY" 
          onPress={() => navigation.navigate('AlertHistory')} 
          variant="secondary"
        />
        <Button 
          title="👤 My Profile" 
          onPress={() => navigation.navigate('Profile')} 
          variant="secondary"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
  },
  header: {
    marginVertical: 24,
  },
  title: {
    ...Typography.h1,
    color: Colors.primary,
  },
  greeting: {
    ...Typography.body1,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  statusCard: {
    alignItems: 'center',
    paddingVertical: 32,
    marginBottom: 24,
  },
  statusTitle: {
    ...Typography.h3,
    color: Colors.text,
  },
  statusValue: {
    ...Typography.h1,
    marginVertical: 8,
  },
  statusDesc: {
    ...Typography.body2,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  actionBtn: {
    width: '100%',
  },
  grid: {
    marginBottom: 24,
  },
  gridCard: {
    padding: 8,
  },
  alertBtn: {
    paddingVertical: 24,
  },
  shortcuts: {
    marginTop: 8,
  }
});
