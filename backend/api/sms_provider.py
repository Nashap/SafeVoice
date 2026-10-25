import os
import requests
import logging

logger = logging.getLogger(__name__)

class SMSProvider:
    def __init__(self):
        self.provider = os.environ.get('SMS_PROVIDER', 'dummy').lower()
        self.api_key = os.environ.get('SMS_API_KEY')
        self.sender_id = os.environ.get('SMS_SENDER_ID', 'SVOICE')
        self.template_id = os.environ.get('SMS_TEMPLATE_ID')
        self.base_url = os.environ.get('SMS_BASE_URL')

    def send_sms(self, phone_number, message, lat=None, lng=None):
        if not phone_number:
            return False, "No phone number provided"

        # Format message if GPS available
        if lat and lng:
            message += f" Loc: http://maps.google.com/?q={lat},{lng}"

        if self.provider == 'dummy':
            print(f"[SMS Dummy] Would send to {phone_number}: {message}")
            return True, "Simulated"
            
        elif self.provider == 'twilio':
            return self._send_twilio(phone_number, message)
            
        elif self.provider == 'msg91':
            # MSG91 is popular in India and complies with DLT
            return self._send_msg91(phone_number, message)

        else:
            logger.error(f"[SMS Error] Unknown provider: {self.provider}")
            return False, f"Unknown provider: {self.provider}"

    def _send_twilio(self, phone_number, message):
        # Implementation for Twilio
        if not self.api_key or not self.base_url: # base_url as Account SID for twilio
            return False, "Twilio configuration missing (Requires Account SID in SMS_BASE_URL and Auth Token in SMS_API_KEY)"
        
        url = f"https://api.twilio.com/2010-04-01/Accounts/{self.base_url}/Messages.json"
        data = {
            "To": phone_number,
            "From": self.sender_id,
            "Body": message
        }
        try:
            # base_url is used as Account SID, api_key as Auth Token
            response = requests.post(url, data=data, auth=(self.base_url, self.api_key), timeout=10)
            if response.status_code in [200, 201]:
                return True, response.json().get('sid', 'Success')
            return False, f"Twilio API Error {response.status_code}: {response.text}"
        except Exception as e:
            logger.error(f"[Twilio Error] {e}")
            return False, str(e)

    def _send_msg91(self, phone_number, message):
        # Implementation for MSG91 (India DLT Compliant)
        if not self.api_key or not self.template_id:
            return False, "MSG91 configuration missing (Requires SMS_API_KEY and SMS_TEMPLATE_ID)"
            
        url = "https://control.msg91.com/api/v5/flow/"
        headers = {
            "authkey": self.api_key,
            "Content-Type": "application/json"
        }
        
        # Strip '+' if present for MSG91 which prefers numeric only with country code
        phone_numeric = "".join(filter(str.isdigit, phone_number))
        
        payload = {
            "template_id": self.template_id,
            "sender": self.sender_id,
            "short_url": "1", # Optional feature to shorten URLs
            "mobiles": phone_numeric,
            "message": message # MSG91 flows usually map variables, but we pass full message if configured as such
        }
        
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=10)
            data = response.json()
            if data.get("type") == "success":
                return True, data.get("message", "Success")
            return False, f"MSG91 API Error: {response.text}"
        except Exception as e:
            logger.error(f"[MSG91 Error] {e}")
            return False, str(e)

def send_emergency_sms(contact, message, lat=None, lng=None):
    provider = SMSProvider()
    return provider.send_sms(contact.phone, message, lat, lng)
