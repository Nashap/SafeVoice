import os

path = r'C:\Projects\SafeVoice\mobile\src\context\SafeVoiceContext.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old_load_data = """    const loadData = async () => {
      const storedProfile = await StorageService.loadProfile(username);
      if (storedProfile) setProfileState(storedProfile);
      
      const storedContacts = await StorageService.loadContacts(username);
      if (storedContacts) {
        setContacts(storedContacts);
      }
      setIsLoaded(true);
      
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
      }
    };"""

new_load_data = """    const loadData = async () => {
      try {
        const storedProfile = await StorageService.loadProfile(username);
        if (storedProfile) setProfileState(storedProfile);
        
        const storedContacts = await StorageService.loadContacts(username);
        if (storedContacts) {
          setContacts(storedContacts);
        }
      } catch (e) {
        console.error('Failed to load local storage data', e);
      } finally {
        setIsLoaded(true);
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
      }
    };"""

content = content.replace(old_load_data, new_load_data)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated SafeVoiceContext.tsx loadData with finally")
