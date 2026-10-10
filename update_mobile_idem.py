import os
import uuid

path = r'C:\Projects\SafeVoice\mobile\src\context\SafeVoiceContext.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old_payload = '''          const payload = {
            trigger_type: 'keyword',
            score: Math.round(emergencyScore),
            location_lat: currentLoc !== 'error' && currentLoc ? currentLoc.latitude : null,
            location_lng: currentLoc !== 'error' && currentLoc ? currentLoc.longitude : null,
          };'''

new_payload = '''          const idempotencyKey = new Date().getTime().toString() + '-' + Math.random().toString(36).substring(7);
          const payload = {
            trigger_type: 'keyword',
            score: Math.round(emergencyScore),
            location_lat: currentLoc !== 'error' && currentLoc ? currentLoc.latitude : null,
            location_lng: currentLoc !== 'error' && currentLoc ? currentLoc.longitude : null,
            idempotency_key: idempotencyKey
          };'''

if old_payload in content:
    content = content.replace(old_payload, new_payload)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Updated SafeVoiceContext.tsx with idempotency_key")
else:
    print("old_payload not found in SafeVoiceContext.tsx")
