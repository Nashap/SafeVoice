import os

path = r'C:\Projects\SafeVoice\mobile\src\context\SafeVoiceContext.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace StorageService.saveContacts(updated); with username
content = content.replace(
    'StorageService.saveContacts(updated);',
    'if (username) StorageService.saveContacts(username, updated);'
)

# And deleteContact might also have it
old_delete = """    const deleteContact = async (id: string) => {
      try {
        await api.delete(`/contacts/${id}/`);
        const updated = contacts.filter(c => c.id !== id);
        setContacts(updated);
        StorageService.saveContacts(updated);
      } catch (e) {
        console.error(e);
        Alert.alert('Error', 'Failed to delete contact from the server.');
      }
    };"""

new_delete = """    const deleteContact = async (id: string) => {
      try {
        await api.delete(`/contacts/${id}/`);
        const updated = contacts.filter(c => c.id !== id);
        setContacts(updated);
        if (username) StorageService.saveContacts(username, updated);
      } catch (e) {
        console.error(e);
        Alert.alert('Error', 'Failed to delete contact from the server.');
      }
    };"""

if old_delete in content:
    content = content.replace(old_delete, new_delete)
else:
    # Just generic replace in case I missed the exact string
    pass

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated SafeVoiceContext mutations")
