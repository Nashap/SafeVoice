import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Alert } from 'react-native';
import Header from '../components/Header';
import Button from '../components/Button';
import Card from '../components/Card';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { useSafeVoice, Contact } from '../context/SafeVoiceContext';

export default function EmergencyContactsScreen() {
  const { contacts, addContact, editContact, deleteContact, isLoaded } = useSafeVoice();
  
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

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

  const renderItem = ({ item }: { item: Contact }) => (
    <Card style={styles.contactCard}>
      <View style={styles.contactInfo}>
        <Text style={styles.contactName}>{item.name}</Text>
        <Text style={styles.contactPhone}>{item.phone}</Text>
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
              placeholder="Phone Number"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
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
  addBtn: {
    marginBottom: 16,
  },
  list: {
    paddingBottom: 24,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
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
    marginTop: 4,
  },
  actionButtons: {
    flexDirection: 'row',
  },
  iconBtn: {
    padding: 8,
    marginLeft: 8,
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
    marginBottom: 16,
    ...Typography.body1,
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
