import os

path = r'C:\Projects\SafeVoice\mobile\src\context\SafeVoiceContext.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old_contacts_fetch = """      try {
        const response = await api.get('/contacts/');
        const backendContacts = response.data.map((c: any) => ({
          id: c.id.toString(),
          name: c.name,
          phone: c.phone
        }));
        setContacts(backendContacts);
        StorageService.saveContacts(username, backendContacts);
      } catch (e) {
        console.error('Failed to fetch contacts from backend', e);
      }"""

new_backend_fetch = """      try {
        const profileResponse = await api.get('/users/');
        if (profileResponse.data && profileResponse.data.length > 0) {
          const user = profileResponse.data[0];
          const backendProfile = {
            name: user.username || '',
            phone: user.phone_number || ''
          };
          setProfileState(backendProfile);
          StorageService.saveProfile(username, backendProfile);
        }
      } catch (e) {
        console.error('Failed to fetch profile from backend', e);
      }
      
      try {
        const response = await api.get('/contacts/');
        const backendContacts = response.data.map((c: any) => ({
          id: c.id.toString(),
          name: c.name,
          phone: c.phone
        }));
        setContacts(backendContacts);
        StorageService.saveContacts(username, backendContacts);
      } catch (e) {
        console.error('Failed to fetch contacts from backend', e);
      }"""

content = content.replace(old_contacts_fetch, new_backend_fetch)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated SafeVoiceContext.tsx with profile fetch")
