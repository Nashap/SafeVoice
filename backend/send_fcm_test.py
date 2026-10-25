import sys
import firebase_admin
from firebase_admin import credentials, messaging
from firebase_admin.exceptions import FirebaseError

def main():
    service_account_path = r'C:\SafeVoiceSecrets\serviceAccountKey.json'
    
    try:
        # Initialize the Admin SDK
        cred = credentials.Certificate(service_account_path)
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred)
        print("Firebase Admin SDK initialized successfully.")
    except Exception as e:
        print(f"Failed to initialize Firebase Admin SDK. Please check the credential file at {service_account_path}")
        print(f"Error details: {str(e)}")
        sys.exit(1)

    print("-" * 50)
    device_token = input("Enter the FCM Device Token printed in your Metro console: ").strip()
    
    if not device_token:
        print("Device token cannot be empty.")
        sys.exit(1)

    message = messaging.Message(
        notification=messaging.Notification(
            title='SafeVoice Test',
            body='Test SOS notification received successfully!',
        ),
        token=device_token,
    )

    print("Sending test notification...")
    try:
        response = messaging.send(message)
        print(f"Success! Firebase accepted the request.")
        print(f"Message ID: {response}")
        print("Check your Android emulator to see if the notification arrived.")
    except messaging.UnregisteredError:
        print("Error: The provided FCM token is unregistered or expired. Please generate a new one.")
    except ValueError as e:
        print("Error: Invalid token format or configuration.")
        print(str(e))
    except FirebaseError as e:
        print("Firebase Error occurred while sending.")
        print(str(e))
    except Exception as e:
        print("An unexpected error occurred.")
        print(str(e))

if __name__ == '__main__':
    main()
