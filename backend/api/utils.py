import firebase_admin
from firebase_admin import credentials, messaging
from django.conf import settings

def get_firebase_app():
    if not firebase_admin._apps:
        import os
        cred_path = os.environ.get('FIREBASE_CREDENTIALS_PATH', r'C:\SafeVoiceSecrets\serviceAccountKey.json')
        try:
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
        except Exception as e:
            print(f"[FCM Init Error] Could not initialize Firebase Admin SDK. Check {cred_path}: {e}")
            return None
    return firebase_admin.get_app()

def send_sos_fcm(user, emergency_history, is_contact=False, sender=None):
    app = get_firebase_app()
    if not app:
        print("[FCM Dispatch] Skipping FCM dispatch due to missing or invalid credentials.")
        return False, "Skipped - No credentials"

    devices = user.devices.all()
    device_count = devices.count()
    print(f"[FCM Dispatch] Attempting to send SOS to {device_count} registered device(s) for user {user.username}.")
    
    if device_count == 0:
        return False, "Skipped - No devices registered"
    
    tokens = [d.token for d in devices]
    
    sender_name = sender.username if sender else emergency_history.user.username
    body_text = f"Emergency alert from {sender_name}."
    addr = (emergency_history.resolved_address or '').strip()
    if addr and addr.lower() != 'address unavailable':
        body_text += f" Near {addr}."
    elif emergency_history.location_lat and emergency_history.location_lng and not (emergency_history.location_lat == 0 and emergency_history.location_lng == 0):
        body_text += f" Loc: https://www.google.com/maps/search/?api=1&query={emergency_history.location_lat},{emergency_history.location_lng}"
    else:
        body_text += " Location: Unavailable"

    message = messaging.MulticastMessage(
        notification=messaging.Notification(
            title=f"SafeVoice SOS: {sender_name}",
            body=body_text,
        ),
        data={
            'emergency_id': str(emergency_history.id),
            'sender_name': str(sender_name),
            'trigger_type': str(emergency_history.trigger_type),
            'lat': str(emergency_history.location_lat or ''),
            'lng': str(emergency_history.location_lng or ''),
            'google_maps_url': str(emergency_history.google_maps_url or ''),
            'resolved_address': str(emergency_history.resolved_address or ''),
            'has_audio': 'true' if emergency_history.audio_status == 'uploaded' else 'false',
            'audio_status': str(emergency_history.audio_status),
            'score': str(emergency_history.score),
        },
        tokens=tokens,
    )
    
    try:
        response = messaging.send_each_for_multicast(message)
        print(f"[FCM Dispatch] Success: {response.success_count}, Failure: {response.failure_count}")
        
        for idx, resp in enumerate(response.responses):
            if not resp.success:
                print(f"[FCM Dispatch Error] Failed to send to token {idx}: {resp.exception}")
                # Remove invalid tokens
                if isinstance(resp.exception, messaging.UnregisteredError) or (hasattr(resp.exception, 'code') and resp.exception.code in ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered']):
                    bad_token = tokens[idx]
                    from .models import DeviceToken
                    DeviceToken.objects.filter(token=bad_token).delete()
                    print(f"[FCM Dispatch] Deleted unregistered token for user: {user.username}")
                
        return (True, "FCM Dispatched") if response.success_count > 0 else (False, "FCM Failed"), "FCM Dispatched"
    except Exception as e:
        print(f"[FCM Dispatch Exception] Failed to send multicast message: {e}")
        return False, f"FCM Error: {e}"
