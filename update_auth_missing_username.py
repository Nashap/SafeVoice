import os

path = r'C:\Projects\SafeVoice\mobile\src\context\AuthContext.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old_check = """      const checkToken = async () => {
      try {
        const credentials = await Keychain.getGenericPassword();
        if (credentials) {
          const tokens = JSON.parse(credentials.password);
          setUsername(tokens.username || null);
          setIsAuthenticated(true);"""

new_check = """      const checkToken = async () => {
      try {
        const credentials = await Keychain.getGenericPassword();
        if (credentials) {
          const tokens = JSON.parse(credentials.password);
          let currentUsername = tokens.username;
          
          if (!currentUsername) {
            try {
              const userResponse = await api.get('/users/', {
                headers: { Authorization: `Bearer ${tokens.access}` }
              });
              if (userResponse.data && userResponse.data.length > 0) {
                currentUsername = userResponse.data[0].username;
                await Keychain.setGenericPassword('auth', JSON.stringify({ ...tokens, username: currentUsername }));
              }
            } catch (e) {
              console.error("Failed to fetch username for backward compatibility", e);
            }
          }
          
          setUsername(currentUsername || null);
          setIsAuthenticated(true);"""

content = content.replace(old_check, new_check)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated AuthContext.tsx")
