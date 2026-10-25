import os

path = r'C:\Projects\SafeVoice\mobile\src\context\AuthContext.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the extra setUsername(usernameStr) inside checkToken
content = content.replace(
"""          setUsername(tokens.username || null);
          setIsAuthenticated(true);
    setUsername(usernameStr);""",
"""          setUsername(tokens.username || null);
          setIsAuthenticated(true);"""
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed AuthContext.tsx")
