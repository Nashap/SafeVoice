import firebase_admin
from firebase_admin import credentials, messaging
from django.conf import settings

def get_firebase_app():
    """
    Securely resolves and initializes the Firebase Admin SDK.
    Supports:
    1. FIREBASE_CREDENTIALS_JSON: Raw JSON string in environment variable (preferred for Render / cloud PaaS)
    2. FIREBASE_CREDENTIALS_PATH: Path to mounted secret file (e.g. /etc/secrets/serviceAccountKey.json)
    3. Local fallback path for development (if file exists)
    Never logs private keys or credentials.
    """
    if not firebase_admin._apps:
        import os
        import json

        # 1. Production: Raw JSON string in environment variable (Render environment variable)
        raw_json = os.environ.get('FIREBASE_CREDENTIALS_JSON', '').strip()
        if raw_json:
            try:
                cert_dict = json.loads(raw_json)
                cred = credentials.Certificate(cert_dict)
                firebase_admin.initialize_app(cred)
                print("[FCM] Firebase Admin SDK initialized successfully from FIREBASE_CREDENTIALS_JSON.")
                return firebase_admin.get_app()
            except Exception as e:
                print(f"[FCM Init Error] Failed to initialize Firebase Admin SDK from FIREBASE_CREDENTIALS_JSON: {e}")
                return None

        # 2. Production/Staging: File path via environment variable (e.g. Render Secret File)
        cred_path = os.environ.get('FIREBASE_CREDENTIALS_PATH', '').strip()
        if cred_path and os.path.exists(cred_path):
            try:
                cred = credentials.Certificate(cred_path)
                firebase_admin.initialize_app(cred)
                print(f"[FCM] Firebase Admin SDK initialized successfully from file: {cred_path}")
                return firebase_admin.get_app()
            except Exception as e:
                print(f"[FCM Init Error] Failed to initialize Firebase Admin SDK from {cred_path}: {e}")
                return None

        # 3. Local Windows Development Fallback
        default_local_path = r'C:\SafeVoiceSecrets\serviceAccountKey.json'
        if os.path.exists(default_local_path):
            try:
                cred = credentials.Certificate(default_local_path)
                firebase_admin.initialize_app(cred)
                print(f"[FCM] Firebase Admin SDK initialized from default local path: {default_local_path}")
                return firebase_admin.get_app()
            except Exception as e:
                print(f"[FCM Init Error] Could not initialize Firebase from default path: {e}")
                return None

        print("[FCM] Notice: Neither FIREBASE_CREDENTIALS_JSON nor valid FIREBASE_CREDENTIALS_PATH is configured. FCM push notifications will be skipped.")
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
        android=messaging.AndroidConfig(
            priority='high',
            notification=messaging.AndroidNotification(
                channel_id='fcm_fallback_notification_channel',
                priority='max',
                default_sound=True,
                default_vibrate_timings=True,
            ),
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
                
        if response.success_count > 0:
            return True, f"FCM Dispatched to {response.success_count} device(s)"
        else:
            return False, f"FCM Failed ({response.failure_count} failure(s))"
    except Exception as e:
        print(f"[FCM Dispatch Exception] Failed to send multicast message: {e}")
        return False, f"FCM Error: {e}"
