import os
import re

path = r'C:\Projects\SafeVoice\mobile\src\screens\ProfileScreen.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("const { logout } = useAuth();", "const { logout, username, isAuthenticated } = useAuth();")

old_if_loaded = """  if (!isLoaded) {
    return (
      <View style={styles.container}>
        <Header title="My Profile" />
        <View style={styles.content}>
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </View>
    );
  }"""

new_if_loaded = """  if (isAuthenticated && !username) {
    return (
      <View style={styles.container}>
        <Header title="My Profile" />
        <View style={styles.content}>
          <Text style={{ color: 'red', textAlign: 'center', marginBottom: 20 }}>
            Failed to load account details from the server. Please check your connection and log in again.
          </Text>
          <Button title="Log Out" onPress={handleLogout} />
        </View>
      </View>
    );
  }

  if (!isLoaded) {
    return (
      <View style={styles.container}>
        <Header title="My Profile" />
        <View style={styles.content}>
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </View>
    );
  }"""

content = content.replace(old_if_loaded, new_if_loaded)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed ProfileScreen")
