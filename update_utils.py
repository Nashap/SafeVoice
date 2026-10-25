import os

path = r'C:\Projects\SafeVoice\backend\api\utils.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

target = """    if emergency_history.resolved_address:
        body_text += f" Near {emergency_history.resolved_address}."
    elif emergency_history.location_lat and emergency_history.location_lng:
        body_text += f" Loc: https://www.google.com/maps/search/?api=1&query={emergency_history.location_lat},{emergency_history.location_lng}\""""

replacement = """    addr = (emergency_history.resolved_address or '').strip()
    if addr and addr.lower() != 'address unavailable':
        body_text += f" Near {addr}."
    elif emergency_history.location_lat and emergency_history.location_lng and not (emergency_history.location_lat == 0 and emergency_history.location_lng == 0):
        body_text += f" Loc: https://www.google.com/maps/search/?api=1&query={emergency_history.location_lat},{emergency_history.location_lng}"
    else:
        body_text += " Location: Unavailable\""""

if target in content:
    content = content.replace(target, replacement)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("SUCCESS")
else:
    print("Target not found")
