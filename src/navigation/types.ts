import { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Splash: undefined;
  Home: undefined;
  ProtectionMode: undefined;
  EmergencyAlert: undefined;
  EmergencyContacts: undefined;
  Profile: undefined;
  Login: undefined;
  Register: undefined;
};

export type NavigationProps = NativeStackNavigationProp<RootStackParamList, any>;
