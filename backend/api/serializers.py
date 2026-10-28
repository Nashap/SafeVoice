from rest_framework import serializers, exceptions
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth.hashers import make_password
from django.contrib.auth import authenticate, get_user_model
from django.db.models import Q
from .models import User, EmergencyContact, EmergencyHistory, DeviceToken

UserModel = get_user_model()

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        raw_username = attrs.get(self.username_field, '')
        password = attrs.get('password', '')

        identifier = str(raw_username).strip()
        attrs[self.username_field] = identifier

        self.user = authenticate(
            request=self.context.get('request'),
            username=identifier,
            password=password
        )

        if self.user is not None:
            from rest_framework_simplejwt.settings import api_settings
            if not api_settings.USER_AUTHENTICATION_RULE(self.user):
                raise exceptions.AuthenticationFailed(
                    "This account is inactive. Please contact support.",
                    "inactive_account"
                )

            data = {}
            refresh = self.get_token(self.user)
            data["refresh"] = str(refresh)
            data["access"] = str(refresh.access_token)
            data["username"] = self.user.username
            return data

        # Check why authentication failed without exposing security vulnerabilities
        lookup = Q(username__iexact=identifier) | Q(email__iexact=identifier)
        digits = "".join(filter(str.isdigit, identifier))
        if len(digits) >= 10:
            lookup |= Q(phone_number__endswith=digits[-10:])

        matching_user = UserModel.objects.filter(lookup).first()
        if matching_user:
            if not matching_user.is_active:
                raise exceptions.AuthenticationFailed(
                    "This account is inactive. Please contact support.",
                    "inactive_account"
                )
            raise exceptions.AuthenticationFailed(
                "Incorrect password. Please verify your password and try again.",
                "invalid_password"
            )
        else:
            raise exceptions.AuthenticationFailed(
                "No account found with the given username, email, or phone number.",
                "user_not_found"
            )

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
    sender_name = serializers.CharField(source='user.username', read_only=True)
    sender_phone = serializers.CharField(source='user.phone_number', read_only=True)

    class Meta:
        model = EmergencyHistory
        fields = '__all__'
        read_only_fields = ('user',)

class DeviceTokenSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeviceToken
        fields = '__all__'
        read_only_fields = ('user',)
