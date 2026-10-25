import os

path = r'C:\Projects\SafeVoice\backend\api\views.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

target = """        # Generate Google Maps link if coordinates available and not already provided
        if not history.google_maps_url and history.location_lat and history.location_lng:
            history.google_maps_url = f"https://www.google.com/maps/search/?api=1&query={history.location_lat},{history.location_lng}"
            history.save(update_fields=['google_maps_url'])"""

replacement = """        # Generate Google Maps link if coordinates available and not already provided
        if not history.google_maps_url and history.location_lat and history.location_lng and not (history.location_lat == 0 and history.location_lng == 0):
            history.google_maps_url = f"https://www.google.com/maps/search/?api=1&query={history.location_lat},{history.location_lng}"
            history.save(update_fields=['google_maps_url'])"""

if target in content:
    content = content.replace(target, replacement)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("SUCCESS")
else:
    print("Target not found")
