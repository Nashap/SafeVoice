import { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Splash: undefined;
  Home: undefined;
  ProtectionMode: undefined;
  EmergencyAlert: undefined;
  EmergencyContacts: undefined;
  AlertHistory: undefined;
  Profile: undefined;
  Login: undefined;
  Register: undefined;
  EmergencyDetail: { emergencyId?: number | string; initialData?: any };
};

export type NavigationProps = NativeStackNavigationProp<RootStackParamList, any>;
