import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, ScrollView } from 'react-native';
import Header from '../components/Header';
import Button from '../components/Button';
import Card from '../components/Card';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { useSafeVoice } from '../context/SafeVoiceContext';
import { useAuth } from '../context/AuthContext';

export default function ProfileScreen() {
  const { logout, username, isAuthenticated } = useAuth();
  const { profile, setProfile, isLoaded, customTrigger, setCustomTrigger } = useSafeVoice();

  // Profile Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);

  // Custom Trigger Edit State
  const [isEditingTrigger, setIsEditingTrigger] = useState(false);
  const [triggerInput, setTriggerInput] = useState(customTrigger || 'help me');

  useEffect(() => {
    if (!isEditing) {
      setName(profile.name);
      setPhone(profile.phone);
    }
  }, [profile, isEditing]);

  useEffect(() => {
    if (!isEditingTrigger) {
      setTriggerInput(customTrigger || 'help me');
    }
  }, [customTrigger, isEditingTrigger]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Name is required.');
      return;
    }
    if (!phone.trim()) {
      Alert.alert('Validation Error', 'Phone number is required.');
      return;
    }
    if (phone.trim().length < 5) {
      Alert.alert('Validation Error', 'Please enter a valid phone number.');
      return;
    }

    await setProfile({ name: name.trim(), phone: phone.trim() });
    setIsEditing(false);
    Alert.alert('Success', 'Profile and phone number saved successfully. Emergency contacts can now link with you.');
  };

  const handleSaveTrigger = async () => {
    const trimmed = triggerInput.trim();
    if (!trimmed) {
      Alert.alert('Validation Error', 'Emergency trigger phrase cannot be empty.');
      return;
    }
    if (trimmed.length < 2) {
      Alert.alert('Validation Error', 'Trigger phrase must be at least 2 characters long.');
      return;
    }
    if (trimmed.length > 40) {
      Alert.alert('Validation Error', 'Trigger phrase cannot exceed 40 characters.');
      return;
    }
    if (!/[a-zA-Z]/.test(trimmed)) {
      Alert.alert('Validation Error', 'Trigger phrase must contain letters.');
      return;
    }

    const success = await setCustomTrigger(trimmed);
    if (success) {
      setIsEditingTrigger(false);
      Alert.alert(
        'Trigger Phrase Saved',
        `Your emergency trigger phrase is set to "${trimmed}".\n\nWhen Protection Mode is active, speaking this phrase will immediately initiate an SOS alert.`
      );
    } else {
      Alert.alert('Error', 'Failed to save trigger phrase. Please check input and try again.');
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            await logout();
          },
        },
      ]
    );
  };

  if (isAuthenticated && !username) {
    return (
      <View style={styles.container}>
        <Header title="My Profile" />
        <View style={styles.content}>
          <Text style={{ color: 'red', textAlign: 'center', marginBottom: 20 }}>
            Failed to load account details from the server. Please check your connection and log in again.
          </Text>
          <Button title="Log Out" onPress={handleLogout} />
        </View>
      </View>
    );
  }

  if (!isLoaded) {
    return (
      <View style={styles.container}>
        <Header title="My Profile" />
        <View style={styles.content}>
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </View>
    );
  }

  const isProfileComplete = profile.name && profile.phone;

  return (
    <View style={styles.container}>
      <Header title="My Profile" />
      <ScrollView contentContainerStyle={styles.content}>
        
        {/* Profile Card */}
        <Card style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>👤</Text>
          </View>
          
          {isEditing ? (
            <View style={styles.form}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput 
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Your Name"
              />
              
              <Text style={styles.label}>Your Phone Number</Text>
              <TextInput 
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="Your Phone Number (e.g. 9847401916)"
                keyboardType="phone-pad"
              />
              <Text style={styles.fieldHint}>
                Contacts who add this number will automatically receive push notifications when you or they trigger an emergency.
              </Text>
              
              <View style={styles.formActions}>
                <Button title="Cancel" onPress={() => setIsEditing(false)} variant="secondary" style={styles.flexBtn} />
                <View style={styles.btnSpacer} />
                <Button title="Save" onPress={handleSave} style={styles.flexBtn} />
              </View>
            </View>
          ) : (
            <View style={styles.info}>
              {!isProfileComplete && (
                <Text style={styles.emptyStateText}>Complete your profile phone number to enable contact linking.</Text>
              )}
              <Text style={styles.name}>{profile.name || username || 'Name not set'}</Text>
              <Text style={styles.phone}>{profile.phone || 'Phone not set'}</Text>

              <View style={styles.statusBox}>
                <Text style={styles.statusBoxTitle}>🔔 Firebase Notifications</Text>
                <Text style={styles.statusBoxText}>
                  Your device is registered automatically. When emergency contacts trigger an SOS, you will receive alerts instantly.
                </Text>
              </View>
              
              <Button 
                title="Edit Profile"
                onPress={() => setIsEditing(true)}
                style={styles.editBtn}
              />
            </View>
          )}
        </Card>

        {/* Custom Voice Trigger Card */}
        <Card style={styles.triggerCard}>
          <View style={styles.triggerHeader}>
            <Text style={styles.triggerIcon}>🎙️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.triggerCardTitle}>Custom Emergency Trigger</Text>
              <Text style={styles.triggerCardSubtitle}>Voice activation keyword for Protection Mode</Text>
            </View>
          </View>

          {isEditingTrigger ? (
            <View style={styles.form}>
              <Text style={styles.label}>Emergency Trigger Phrase</Text>
              <TextInput 
                style={styles.input}
                value={triggerInput}
                onChangeText={setTriggerInput}
                placeholder="e.g. HelpNow, SafeAlert, Emergency"
                autoCapitalize="words"
                autoCorrect={false}
              />
              <Text style={styles.fieldHint}>
                Choose a distinctive word or phrase (e.g. "HelpNow", "SafeAlert", or "Emergency"). Speak this word during Protection Mode to activate emergency response.
              </Text>

              <View style={styles.formActions}>
                <Button 
                  title="Cancel" 
                  onPress={() => {
                    setIsEditingTrigger(false);
                    setTriggerInput(customTrigger);
                  }} 
                  variant="secondary" 
                  style={styles.flexBtn} 
                />
                <View style={styles.btnSpacer} />
                <Button title="Save Trigger" onPress={handleSaveTrigger} style={styles.flexBtn} />
              </View>
            </View>
          ) : (
            <View style={styles.triggerDisplay}>
              <View style={styles.triggerBadge}>
                <Text style={styles.triggerBadgeLabel}>CURRENT TRIGGER PHRASE</Text>
                <Text style={styles.triggerBadgeText}>"{customTrigger || 'help me'}"</Text>
              </View>

              <Text style={styles.triggerExplanation}>
                Speak this phrase aloud when Protection Mode is active to automatically initiate an emergency SOS alert and notify your registered contacts.
              </Text>

              <Button 
                title="Change Trigger Phrase" 
                onPress={() => setIsEditingTrigger(true)}
                variant="secondary"
                style={styles.editBtn}
              />
            </View>
          )}
        </Card>

        {/* Logout Section */}
        <View style={styles.logoutContainer}>
          <Button 
            title="Log Out"
            onPress={handleLogout}
            variant="secondary"
            style={styles.logoutBtn}
          />
        </View>

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
    padding: 16,
  },
  card: {
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    backgroundColor: Colors.border,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  avatarText: {
    fontSize: 40,
  },
  info: {
    width: '100%',
    alignItems: 'center',
  },
  name: {
    ...Typography.h2,
    color: Colors.text,
    marginBottom: 8,
  },
  phone: {
    ...Typography.body1,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  statusBox: {
    width: '100%',
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  statusBoxTitle: {
    fontWeight: 'bold',
    color: '#065f46',
    fontSize: 13,
    marginBottom: 4,
  },
  statusBoxText: {
    color: '#047857',
    fontSize: 12,
    lineHeight: 16,
  },
  editBtn: {
    width: '100%',
  },
  triggerCard: {
    padding: 20,
    marginBottom: 16,
  },
  triggerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  triggerIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  triggerCardTitle: {
    ...Typography.h3,
    color: Colors.text,
    fontWeight: 'bold',
  },
  triggerCardSubtitle: {
    ...Typography.body2,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  triggerDisplay: {
    width: '100%',
  },
  triggerBadge: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  triggerBadgeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  triggerBadgeText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  triggerExplanation: {
    ...Typography.body2,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 16,
  },
  logoutContainer: {
    marginBottom: 32,
  },
  logoutBtn: {
    width: '100%',
  },
  form: {
    width: '100%',
  },
  label: {
    ...Typography.body2,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    ...Typography.body1,
  },
  fieldHint: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 16,
    lineHeight: 16,
  },
  formActions: {
    flexDirection: 'row',
    marginTop: 8,
  },
  flexBtn: {
    flex: 1,
  },
  btnSpacer: {
    width: 16,
  },
  emptyStateText: {
    ...Typography.body2,
    color: Colors.warning,
    marginBottom: 16,
    textAlign: 'center',
  },
  loadingText: {
    ...Typography.body1,
    textAlign: 'center',
    marginTop: 32,
    color: Colors.textSecondary,
  }
});
