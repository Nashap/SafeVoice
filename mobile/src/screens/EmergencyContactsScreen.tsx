import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Header from '../components/Header';
import Button from '../components/Button';
import Card from '../components/Card';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { useSafeVoice, Contact } from '../context/SafeVoiceContext';

export default function EmergencyContactsScreen() {
  const { contacts, addContact, editContact, deleteContact, refreshContacts, isLoaded } = useSafeVoice();
  
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  useFocusEffect(
    useCallback(() => {
      refreshContacts();
    }, [refreshContacts])
  );

  const onRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshContacts();
    } finally {
      setIsRefreshing(false);
    }
  };

  const openFormForAdd = () => {
    setEditingId(null);
    setName('');
    setPhone('');
    setIsFormVisible(true);
  };

  const openFormForEdit = (contact: Contact) => {
    setEditingId(contact.id);
    setName(contact.name);
    setPhone(contact.phone);
    setIsFormVisible(true);
  };

  const closeForm = () => {
    setIsFormVisible(false);
    setEditingId(null);
    setName('');
    setPhone('');
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Contact name is required.');
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

    if (editingId) {
      editContact({ id: editingId, name: name.trim(), phone: phone.trim() });
    } else {
      addContact({ id: Date.now().toString(), name: name.trim(), phone: phone.trim() });
    }
    
    closeForm();
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      "Delete emergency contact?",
      "Are you sure you want to remove this contact?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive",
          onPress: () => deleteContact(id) 
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: Contact }) => {
    const isPushReady = item.fcm_status === 'ready';
    const isNoDevice = item.fcm_status === 'no_device';
    const isUnregistered = item.fcm_status === 'unregistered' || !item.fcm_status;

    return (
      <Card style={styles.contactCard}>
        <View style={styles.contactInfo}>
          <Text style={styles.contactName}>{item.name}</Text>
          <Text style={styles.contactPhone}>{item.phone}</Text>

          <View style={styles.badgeRow}>
            {isPushReady && (
              <View style={[styles.statusBadge, styles.badgeSuccess]}>
                <Text style={styles.badgeTextSuccess}>🔔 Push Alerts Active</Text>
              </View>
            )}
            {isNoDevice && (
              <View style={[styles.statusBadge, styles.badgeWarning]}>
                <Text style={styles.badgeTextWarning}>📱 App Linked (No Device Active)</Text>
              </View>
            )}
            {isUnregistered && (
              <View style={[styles.statusBadge, styles.badgeMuted]}>
                <Text style={styles.badgeTextMuted}>✉️ SMS Fallback (Not on SafeVoice)</Text>
              </View>
            )}
          </View>

          <Text style={styles.statusDescription}>
            {isPushReady
              ? 'SafeVoice linked: Receives instant push notifications with GPS map.'
              : isNoDevice
              ? 'Recipient registered, but needs to open SafeVoice to activate notifications.'
              : 'Recipient has not registered on SafeVoice. Push notifications unavailable until they register.'}
          </Text>
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity 
            style={styles.iconBtn}
            onPress={() => openFormForEdit(item)}
          >
            <Text style={styles.iconText}>✏️</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.iconBtn}
            onPress={() => handleDelete(item.id)}
          >
            <Text style={styles.iconText}>🗑️</Text>
          </TouchableOpacity>
        </View>
      </Card>
    );
  };

  if (!isLoaded) {
    return (
      <View style={styles.container}>
        <Header title="Emergency Contacts" />
        <View style={styles.content}>
          <Text style={styles.loadingText}>Loading contacts...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Emergency Contacts" />
      <View style={styles.content}>
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerTitle}>Automatic Contact Linking</Text>
          <Text style={styles.infoBannerText}>
            When a contact installs SafeVoice with their phone number, push notifications activate automatically. No token setup required.
          </Text>
        </View>

        {isFormVisible ? (
          <Card style={styles.formCard}>
            <Text style={styles.formTitle}>
              {editingId ? "Edit Contact" : "Add New Contact"}
            </Text>
            <TextInput 
              style={styles.input}
              placeholder="Contact Name"
              value={name}
              onChangeText={setName}
            />
            <TextInput 
              style={styles.input}
              placeholder="Phone Number (e.g. 9847401916)"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <Text style={styles.fieldHint}>
              Enter the phone number the contact will use to register on SafeVoice.
            </Text>
            <View style={styles.formActions}>
              <Button title="Cancel" onPress={closeForm} variant="secondary" style={styles.flexBtn} />
              <View style={styles.btnSpacer} />
              <Button title="Save" onPress={handleSave} style={styles.flexBtn} />
            </View>
          </Card>
        ) : (
          <Button 
            title="+ Add Emergency Contact"
            onPress={openFormForAdd}
            style={styles.addBtn}
          />
        )}

        <FlatList 
          data={contacts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No emergency contacts added yet.</Text>
              <Text style={styles.emptyText}>Add a trusted contact so SafeVoice can use them during an emergency.</Text>
            </View>
          }
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
    padding: 16,
  },
  infoBanner: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  infoBannerTitle: {
    ...Typography.body2,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 4,
  },
  infoBannerText: {
    ...Typography.body2,
    color: '#1e3a8a',
    fontSize: 13,
    lineHeight: 18,
  },
  addBtn: {
    marginBottom: 16,
  },
  list: {
    paddingBottom: 24,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 16,
    marginBottom: 12,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    ...Typography.h3,
    color: Colors.text,
  },
  contactPhone: {
    ...Typography.body1,
    color: Colors.textSecondary,
    marginTop: 2,
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 6,
    marginBottom: 4,
  },
  badgeSuccess: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  badgeTextSuccess: {
    color: '#065f46',
    fontSize: 12,
    fontWeight: '600',
  },
  badgeWarning: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  badgeTextWarning: {
    color: '#92400e',
    fontSize: 12,
    fontWeight: '600',
  },
  badgeMuted: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  badgeTextMuted: {
    color: '#4b5563',
    fontSize: 12,
    fontWeight: '600',
  },
  statusDescription: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  actionButtons: {
    flexDirection: 'row',
    marginLeft: 8,
  },
  iconBtn: {
    padding: 8,
    marginLeft: 4,
  },
  iconText: {
    fontSize: 20,
  },
  formCard: {
    marginBottom: 24,
  },
  formTitle: {
    ...Typography.h3,
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    ...Typography.body1,
  },
  fieldHint: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  formActions: {
    flexDirection: 'row',
  },
  flexBtn: {
    flex: 1,
  },
  btnSpacer: {
    width: 16,
  },
  emptyContainer: {
    marginTop: 40,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyTitle: {
    ...Typography.h3,
    textAlign: 'center',
    color: Colors.text,
    marginBottom: 8,
  },
  emptyText: {
    ...Typography.body1,
    textAlign: 'center',
    color: Colors.textSecondary,
  },
  loadingText: {
    ...Typography.body1,
    textAlign: 'center',
    marginTop: 32,
    color: Colors.textSecondary,
  }
});
