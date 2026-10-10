import os

path = r'C:\Projects\SafeVoice\mobile\src\services\api.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    "await Keychain.setGenericPassword('auth', JSON.stringify({ access: newAccessToken, refresh: tokens.refresh }));",
    "await Keychain.setGenericPassword('auth', JSON.stringify({ access: newAccessToken, refresh: tokens.refresh, username: tokens.username }));"
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated api.ts")
