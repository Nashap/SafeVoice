from rest_framework import serializers
from django.contrib.auth.hashers import make_password
from .models import User, EmergencyContact, EmergencyHistory, DeviceToken

class RegisterSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'password', 'phone_number']
        extra_kwargs = {
            'password': {'write_only': True}
        }

    def create(self, validated_data):
        validated_data['password'] = make_password(validated_data.get('password'))
        return super().create(validated_data)

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'phone_number']

class EmergencyContactSerializer(serializers.ModelSerializer):
    has_registered_account = serializers.SerializerMethodField()
    has_fcm_token = serializers.SerializerMethodField()
    fcm_status = serializers.SerializerMethodField()

    class Meta:
        model = EmergencyContact
        fields = [
            'id', 'user', 'name', 'phone', 'relationship', 'is_active',
            'has_registered_account', 'has_fcm_token', 'fcm_status'
        ]
        read_only_fields = ('user',)

    def _get_matched_user(self, obj):
        if not hasattr(obj, '_cached_matched_user'):
            contact_phone = "".join(filter(str.isdigit, obj.phone or ""))
            if len(contact_phone) >= 10:
                contact_phone_core = contact_phone[-10:]
                obj._cached_matched_user = User.objects.filter(phone_number__endswith=contact_phone_core).first()
            else:
                obj._cached_matched_user = None
        return obj._cached_matched_user

    def get_has_registered_account(self, obj):
        return self._get_matched_user(obj) is not None

    def get_has_fcm_token(self, obj):
        matched = self._get_matched_user(obj)
        if matched:
            return matched.devices.exists()
        return False

    def get_fcm_status(self, obj):
        matched = self._get_matched_user(obj)
        if not matched:
            return 'unregistered'
        if matched.devices.exists():
            return 'ready'
        return 'no_device'

class EmergencyHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = EmergencyHistory
        fields = '__all__'
        read_only_fields = ('user',)

class DeviceTokenSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeviceToken
        fields = '__all__'
        read_only_fields = ('user',)
