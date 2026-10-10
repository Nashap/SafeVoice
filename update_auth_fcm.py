import sys

path = r'C:\Projects\SafeVoice\mobile\src\context\AuthContext.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old_use_effect = '''  useEffect(() => {
    const checkToken = async () => {
      try {
        const credentials = await Keychain.getGenericPassword();
        if (credentials) {
          setIsAuthenticated(true);
        }
      } catch (e) {
        console.error('Failed to restore auth state', e);
      } finally {
        setIsLoading(false);
      }
    };
    checkToken();
  }, []);'''

new_use_effect = '''  useEffect(() => {
    const checkToken = async () => {
      try {
        const credentials = await Keychain.getGenericPassword();
        if (credentials) {
          setIsAuthenticated(true);
          // Register FCM token on app load if already authenticated
          try {
            const fcmToken = await getFCMToken();
            if (fcmToken) {
              const tokens = JSON.parse(credentials.password);
              await api.post('/devices/', { token: fcmToken }, {
                headers: { Authorization: `Bearer ${tokens.access}` }
              });
              console.log('[FCM] Token registered with backend on app load');
            }
          } catch (e) {
            console.error('[FCM] Failed to register device token on app load', e);
          }
        }
      } catch (e) {
        console.error('Failed to restore auth state', e);
      } finally {
        setIsLoading(false);
      }
    };
    checkToken();
  }, []);'''

content = content.replace(old_use_effect, new_use_effect)
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated AuthContext.tsx")
