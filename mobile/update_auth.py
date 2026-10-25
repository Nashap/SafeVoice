import os
import re

path = r'C:\Projects\SafeVoice\mobile\src\context\AuthContext.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

new_func = """const checkToken = async () => {
      console.log('[AuthContext] checkToken started');
      try {
        const credentials = await Keychain.getGenericPassword();
        console.log(`[AuthContext] credentials found: ${!!credentials}`);
        if (credentials) {
          const tokens = JSON.parse(credentials.password);
          let currentUsername = tokens.username;
          
          if (!currentUsername) {
            console.log('[AuthContext] Missing username in keychain. Fetching from /users/');
            try {
              const userResponse = await api.get('/users/', {
                headers: { Authorization: `Bearer ${tokens.access}` }
              });
              if (userResponse.data && userResponse.data.length > 0) {
                currentUsername = userResponse.data[0].username;
                console.log(`[AuthContext] Fetched username from API: ${currentUsername}`);
                await Keychain.setGenericPassword('auth', JSON.stringify({ ...tokens, username: currentUsername }));
              }
            } catch (e) {
              console.error("[AuthContext] Failed to fetch username for backward compatibility", e);
            }
          }
          
          console.log(`[AuthContext] setUsername called with: ${currentUsername}`);
          setUsername(currentUsername || null);
          setIsAuthenticated(true);"""

content = re.sub(r'(?s)const checkToken = async \(\) => \{.*?setIsAuthenticated\(true\);', new_func, content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed")
