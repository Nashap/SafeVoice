import os

path = r'C:\Projects\SafeVoice\mobile\src\screens\LoginScreen.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('await login(response.data);', 'await login(response.data, username);')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated LoginScreen.tsx")
