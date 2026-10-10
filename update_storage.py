import os

path = r'C:\Projects\SafeVoice\mobile\src\services\storage.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace static keys with functions
content = content.replace(
    "const PROFILE_KEY = '@safevoice/profile';",
    "const getProfileKey = (username: string) => `@safevoice/profile_${username}`;"
)
content = content.replace(
    "const CONTACTS_KEY = '@safevoice/emergency_contacts';",
    "const getContactsKey = (username: string) => `@safevoice/emergency_contacts_${username}`;"
)

# Update saveProfile
content = content.replace('async saveProfile(profile: Profile): Promise<void> {', 'async saveProfile(username: string, profile: Profile): Promise<void> {')
content = content.replace('await AsyncStorage.setItem(PROFILE_KEY, jsonValue);', 'await AsyncStorage.setItem(getProfileKey(username), jsonValue);')

# Update loadProfile
content = content.replace('async loadProfile(): Promise<Profile | null> {', 'async loadProfile(username: string): Promise<Profile | null> {')
content = content.replace('const jsonValue = await AsyncStorage.getItem(PROFILE_KEY);', 'const jsonValue = await AsyncStorage.getItem(getProfileKey(username));')

# Update saveContacts
content = content.replace('async saveContacts(contacts: Contact[]): Promise<void> {', 'async saveContacts(username: string, contacts: Contact[]): Promise<void> {')
content = content.replace('await AsyncStorage.setItem(CONTACTS_KEY, jsonValue);', 'await AsyncStorage.setItem(getContactsKey(username), jsonValue);')

# Update loadContacts
content = content.replace('async loadContacts(): Promise<Contact[] | null> {', 'async loadContacts(username: string): Promise<Contact[] | null> {')
content = content.replace('const jsonValue = await AsyncStorage.getItem(CONTACTS_KEY);', 'const jsonValue = await AsyncStorage.getItem(getContactsKey(username));')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated storage.ts")
