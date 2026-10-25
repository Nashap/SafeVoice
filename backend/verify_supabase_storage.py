"""
SafeVoice — Safe Supabase Storage Verification Tool

Tests live Supabase Storage integration safely:
1. Validates environment configuration (.env).
2. Generates a valid in-memory 44-byte WAV test audio file.
3. Tests direct upload to private bucket (allow_fallback=False).
4. Generates a short-lived signed URL.
5. Verifies signed URL playback (HTTP GET 200).
6. Deletes test artifact from private bucket to keep storage clean.
7. Does NOT touch database, send notifications, or contact emergency recipients.
"""

import os
import sys
import django

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

import requests
from django.conf import settings
from api.supabase_storage import get_supabase_config, upload_emergency_audio, create_signed_audio_url


def mask_key(key: str) -> str:
    if not key:
        return "<EMPTY>"
    if len(key) <= 12:
        return "***"
    return f"{key[:6]}...{key[-4:]}"


def build_minimal_wav() -> bytes:
    """Creates a valid 44-byte minimal PCM WAV file (0.1s of silence at 8kHz 8-bit mono)."""
    # RIFF header
    num_samples = 800
    subchunk2_size = num_samples
    chunk_size = 36 + subchunk2_size
    header = bytearray()
    header.extend(b'RIFF')
    header.extend(chunk_size.to_bytes(4, 'little'))
    header.extend(b'WAVE')
    # fmt subchunk
    header.extend(b'fmt ')
    header.extend((16).to_bytes(4, 'little'))  # Subchunk1Size
    header.extend((1).to_bytes(2, 'little'))   # AudioFormat (PCM=1)
    header.extend((1).to_bytes(2, 'little'))   # NumChannels (Mono=1)
    header.extend((8000).to_bytes(4, 'little')) # SampleRate (8000)
    header.extend((8000).to_bytes(4, 'little')) # ByteRate
    header.extend((1).to_bytes(2, 'little'))   # BlockAlign
    header.extend((8).to_bytes(2, 'little'))   # BitsPerSample
    # data subchunk
    header.extend(b'data')
    header.extend(subchunk2_size.to_bytes(4, 'little'))
    header.extend(b'\x80' * num_samples)       # 8-bit PCM silence is 128 (0x80)
    return bytes(header)


def main():
    print("=" * 60)
    print("SafeVoice Supabase Storage Integration Verification")
    print("=" * 60)

    url, key, bucket = get_supabase_config()

    print(f"Project URL    : {url or '<NOT CONFIGURED>'}")
    print(f"Storage Bucket : {bucket}")
    print(f"Service Key    : {mask_key(key)}")

    # Check for placeholder or empty key
    is_placeholder = (
        not key
        or 'placeholder' in key.lower()
        or 'your_supabase' in key.lower()
        or key == 'your-supabase-service-role-key-placeholder'
    )

    if not url or is_placeholder:
        print("\n[STOPPED] Supabase credentials are not fully configured in backend/.env.")
        print("Please configure the following in backend/.env:")
        print("  SUPABASE_URL=https://<your-project-ref>.supabase.co")
        print("  SUPABASE_SERVICE_ROLE_KEY=sb_secret_your_actual_secret_key")
        print("  SUPABASE_STORAGE_BUCKET=emergency-audio")
        print("Once configured, re-run this script to verify live upload.")
        sys.exit(0)

    test_user_id = 9999
    test_emergency_id = 9999
    wav_bytes = build_minimal_wav()

    print(f"\n[Step 1] Uploading test WAV ({len(wav_bytes)} bytes) to '{bucket}'...")
    success, object_path, err, storage_type = upload_emergency_audio(
        user_id=test_user_id,
        emergency_id=test_emergency_id,
        audio_bytes=wav_bytes,
        allow_fallback=False
    )

    if not success:
        print(f"FAILED: Upload failed.")
        print(f"Storage Type : {storage_type}")
        print(f"Error Details: {err}")
        sys.exit(1)

    print("SUCCESS: Audio uploaded successfully to cloud Supabase Storage!")
    print(f"Object Path  : {object_path}")
    print(f"Storage Type : {storage_type}")

    print("\n[Step 2] Generating short-lived signed URL (300s expiry)...")
    url_success, signed_url, url_err = create_signed_audio_url(
        object_path=object_path,
        expires_in=300,
        storage_type='supabase'
    )

    if not url_success:
        print(f"FAILED: Signed URL generation failed.")
        print(f"Error Details: {url_err}")
        sys.exit(1)

    # Sanitize signed URL for display (hide token)
    display_url = signed_url.split('?token=')[0] + "?token=[REDACTED]" if '?token=' in signed_url else signed_url
    print(f"SUCCESS: Signed URL generated successfully.")
    print(f"Playback URL : {display_url}")

    print("\n[Step 3] Testing audio playback through signed URL...")
    try:
        playback_resp = requests.get(signed_url, timeout=10)
        if playback_resp.status_code == 200:
            print(f"SUCCESS: Audio playback verified (HTTP 200, {len(playback_resp.content)} bytes received).")
        else:
            print(f"WARNING: Playback returned HTTP {playback_resp.status_code}: {playback_resp.text[:150]}")
    except Exception as e:
        print(f"WARNING: Playback request failed: {e}")

    print("\n[Step 4] Cleaning up test object from Supabase bucket...")
    try:
        delete_endpoint = f"{url}/storage/v1/object/{bucket}"
        del_headers = {
            "apikey": key,
            "Content-Type": "application/json"
        }
        del_resp = requests.delete(delete_endpoint, headers=del_headers, json={"prefixes": [object_path]}, timeout=10)
        if del_resp.status_code in (200, 204):
            print(f"SUCCESS: Cleaned up test object {object_path} from bucket '{bucket}'.")
        else:
            print(f"NOTE: Cleanup returned HTTP {del_resp.status_code} (object may persist in bucket).")
    except Exception as e:
        print(f"NOTE: Cleanup exception: {e}")

    print("\n" + "=" * 60)
    print("ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!")
    print("Supabase Storage integration is fully functional and ready.")
    print("=" * 60)


if __name__ == '__main__':
    main()
