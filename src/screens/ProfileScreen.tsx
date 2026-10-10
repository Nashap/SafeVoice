import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import Header from '../components/Header';
import Button from '../components/Button';
import Card from '../components/Card';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { useSafeVoice } from '../context/SafeVoiceContext';

import { useAuth } from '../context/AuthContext';

export default function ProfileScreen() {
  const { logout, username, isAuthenticated } = useAuth();
  const { profile, setProfile, isLoaded } = useSafeVoice();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);

  // Sync state if profile loads asynchronously after component mounts
  useEffect(() => {
    if (!isEditing) {
      setName(profile.name);
      setPhone(profile.phone);
    }
  }, [profile, isEditing]);

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Name is required.');
      return;
    }
    if (!phone.trim()) {
      Alert.alert('Validation Error', 'Phone number is required.');
      return;
    }
    // Basic phone validation (at least 5 characters to allow international/short formats)
    if (phone.trim().length < 5) {
      Alert.alert('Validation Error', 'Please enter a valid phone number.');
      return;
    }

    setProfile({ name: name.trim(), phone: phone.trim() });
    setIsEditing(false);
    Alert.alert('Success', 'Profile saved successfully.');
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
      <View style={styles.content}>
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
                placeholder="Your Phone Number"
                keyboardType="phone-pad"
              />
              
              <View style={styles.formActions}>
                <Button title="Cancel" onPress={() => setIsEditing(false)} variant="secondary" style={styles.flexBtn} />
                <View style={styles.btnSpacer} />
                <Button title="Save" onPress={handleSave} style={styles.flexBtn} />
              </View>
            </View>
          ) : (
            <View style={styles.info}>
              {!isProfileComplete && (
                <Text style={styles.emptyStateText}>Complete your profile to assist emergency contacts.</Text>
              )}
              <Text style={styles.name}>{profile.name || 'Name not set'}</Text>
              <Text style={styles.phone}>{profile.phone || 'Phone not set'}</Text>
              
              <Button 
                title="Edit Profile"
                onPress={() => setIsEditing(true)}
                style={styles.editBtn}
              />
              <View style={styles.btnSpacerVertical} />
              <Button 
                title="Log Out"
                onPress={handleLogout}
                variant="secondary"
                style={styles.logoutBtn}
              />
            </View>
          )}
        </Card>
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
    padding: 16,
  },
  card: {
    padding: 24,
    alignItems: 'center',
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
    marginBottom: 24,
  },
  editBtn: {
    width: '100%',
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
    marginBottom: 16,
    ...Typography.body1,
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
  btnSpacerVertical: {
    height: 16,
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

