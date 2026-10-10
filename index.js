/**
 * @format
 */

import { AppRegistry } from 'react-native';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';

const messaging = getMessaging();
setBackgroundMessageHandler(messaging, async remoteMessage => {
  console.log('Message handled in the background!', remoteMessage);
});

import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
