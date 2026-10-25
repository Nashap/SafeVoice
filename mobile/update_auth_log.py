import os

path = r'C:\Projects\SafeVoice\mobile\src\context\AuthContext.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old_check = """      const checkToken = async () => {
      try {
        const credentials = await Keychain.getGenericPassword();"""

new_check = """      const checkToken = async () => {
      console.log('[AuthContext] checkToken started');
      try {
        const credentials = await Keychain.getGenericPassword();
        console.log(`[AuthContext] credentials found: ${!!credentials}`);"""
content = content.replace(old_check, new_check)

old_missing_username = """          if (!currentUsername) {
            try {
              const userResponse = await api.get('/users/', {"""

new_missing_username = """          if (!currentUsername) {
            console.log('[AuthContext] Missing username in keychain. Fetching from /users/');
            try {
              const userResponse = await api.get('/users/', {"""
content = content.replace(old_missing_username, new_missing_username)

old_set_username = """          setUsername(currentUsername || null);
          setIsAuthenticated(true);"""

new_set_username = """          console.log(`[AuthContext] setUsername called with: ${!!currentUsername}`);
          setUsername(currentUsername || null);
          setIsAuthenticated(true);"""
content = content.replace(old_set_username, new_set_username)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated AuthContext.tsx with logs")
