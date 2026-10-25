import os

path = r'C:\Projects\SafeVoice\mobile\src\context\SafeVoiceContext.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old_use_effect = """  useEffect(() => {
    if (!isAuthenticated || !username) {
      setProfileState({ name: '', phone: '' });
      setContacts([]);
      setIsLoaded(false);
      return;
    }"""

new_use_effect = """  useEffect(() => {
    console.log(`[SafeVoiceContext] useEffect triggered. isAuthenticated: ${isAuthenticated}, username available: ${!!username}`);
    
    if (!isAuthenticated || !username) {
      console.log('[SafeVoiceContext] Early return due to missing auth or username. Setting isLoaded=false');
      setProfileState({ name: '', phone: '' });
      setContacts([]);
      setIsLoaded(false);
      return;
    }"""

content = content.replace(old_use_effect, new_use_effect)

old_load_data = """    const loadData = async () => {
      try {
        const storedProfile = await StorageService.loadProfile(username);"""

new_load_data = """    const loadData = async () => {
      console.log('[SafeVoiceContext] loadData started for user');
      try {
        console.log('[SafeVoiceContext] Loading local profile');
        const storedProfile = await StorageService.loadProfile(username);"""

content = content.replace(old_load_data, new_load_data)

old_finally = """      } catch (e) {
        console.error('Failed to load local storage data', e);
      } finally {
        setIsLoaded(true);
      }"""

new_finally = """      } catch (e) {
        console.error('[SafeVoiceContext] Failed to load local storage data', e);
      } finally {
        console.log('[SafeVoiceContext] Setting isLoaded to true');
        setIsLoaded(true);
      }"""

content = content.replace(old_finally, new_finally)

old_api_profile = """      try {
        const profileResponse = await api.get('/users/');"""

new_api_profile = """      try {
        console.log('[SafeVoiceContext] Fetching backend profile (/users/)');
        const profileResponse = await api.get('/users/');
        console.log(`[SafeVoiceContext] /users/ response status: ${profileResponse.status}`);"""

content = content.replace(old_api_profile, new_api_profile)

old_api_contacts = """      try {
        const response = await api.get('/contacts/');"""

new_api_contacts = """      try {
        console.log('[SafeVoiceContext] Fetching backend contacts (/contacts/)');
        const response = await api.get('/contacts/');
        console.log(`[SafeVoiceContext] /contacts/ response status: ${response.status}`);"""

content = content.replace(old_api_contacts, new_api_contacts)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated SafeVoiceContext.tsx with logs")
