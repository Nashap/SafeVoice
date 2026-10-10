import os

path = r'C:\Projects\SafeVoice\mobile\src\context\SafeVoiceContext.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Import useAuth
content = content.replace("import { StorageService }", "import { useAuth } from './AuthContext';\nimport { StorageService }")

# 2. Get username inside SafeVoiceProvider
content = content.replace(
    "const [isLoaded, setIsLoaded] = useState(false);",
    "const [isLoaded, setIsLoaded] = useState(false);\n  const { isAuthenticated, username } = useAuth();"
)

# 3. Modify useEffect for loadData
old_effect = """  useEffect(() => {
    const loadData = async () => {
      const storedProfile = await StorageService.loadProfile();
      if (storedProfile) setProfileState(storedProfile);
      
      const storedContacts = await StorageService.loadContacts();
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
        StorageService.saveContacts(backendContacts);
      } catch (e) {
        console.error('Failed to fetch contacts from backend', e);
      }
    };
    loadData();
  }, []);"""

new_effect = """  useEffect(() => {
    if (!isAuthenticated || !username) {
      setProfileState({ name: '', phone: '' });
      setContacts([]);
      setIsLoaded(false);
      return;
    }

    const loadData = async () => {
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
    };
    loadData();
  }, [isAuthenticated, username]);"""

content = content.replace(old_effect, new_effect)

# 4. Modify setProfile
old_set_profile = """  const setProfile = (newProfile: Profile) => {
    setProfileState(newProfile);
    StorageService.saveProfile(newProfile);
  };"""

new_set_profile = """  const setProfile = (newProfile: Profile) => {
    setProfileState(newProfile);
    if (username) {
      StorageService.saveProfile(username, newProfile);
    }
  };"""

content = content.replace(old_set_profile, new_set_profile)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated SafeVoiceContext.tsx")
