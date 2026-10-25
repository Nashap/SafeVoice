import os

path = r'C:\Projects\SafeVoice\mobile\src\services\api.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old_catch = '''      } catch (refreshError) {
        processQueue(refreshError, null);'''

new_catch = '''      } catch (refreshError) {
        console.error('[API] Refresh token failed or expired. Logging out.');
        processQueue(refreshError, null);'''

if old_catch in content:
    content = content.replace(old_catch, new_catch)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Added logs to api.ts")
else:
    print("old_catch not found")
