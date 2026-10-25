/**
 * @format
 */

import { AppRegistry } from 'react-native';
import '@react-native-firebase/app';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';

try {
  const messaging = getMessaging();
  setBackgroundMessageHandler(messaging, async remoteMessage => {
    console.log('Message handled in the background!', remoteMessage);
  });
} catch (e) {
  console.warn('[FCM] Background messaging initialization deferred:', e);
}

import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
