import { getMessaging, requestPermission, getToken, onMessage, onNotificationOpenedApp, getInitialNotification } from '@react-native-firebase/messaging';
import { PermissionsAndroid, Platform } from 'react-native';

const messaging = getMessaging();

export const requestNotificationPermission = async () => {
  console.log('[FCM] Checking notification permissions...');
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    try {
      console.log('[FCM] Android 13+ detected, requesting POST_NOTIFICATIONS...');
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        console.log('[FCM] Notification permission granted (Android 13+).');
      } else {
        console.log('[FCM] Notification permission denied (Android 13+).');
      }
    } catch (err) {
      console.error('[FCM] Error requesting POST_NOTIFICATIONS:', err);
    }
  } else {
    try {
      console.log('[FCM] Requesting Firebase messaging permission...');
      // For iOS or older Android versions
      const authStatus = await requestPermission(messaging);
      console.log('[FCM] Notification authorization status:', authStatus);
    } catch (err) {
      console.error('[FCM] Error requesting Firebase permission:', err);
    }
  }
};

export const getFCMToken = async () => {
  try {
    console.log('[FCM] Attempting to retrieve FCM token from Firebase...');
    const token = await getToken(messaging);
    console.log('====================================');
    console.log('[FCM] Device Token retrieved successfully!');
    if (token) {
        console.log('[FCM] Token (partial):', token.substring(0, 10) + '...');
    } else {
        console.log('[FCM] Token is null or empty.');
    }
    console.log('====================================');
        return token;
  } catch (error) {
    console.error('[FCM] Failed to get FCM token:', error);
    return null;
  }
};

export const setupNotificationListeners = () => {
  console.log('[FCM] Setting up push notification listeners...');
  
  // Handle foreground messages
  const unsubscribeForeground = onMessage(messaging, async (remoteMessage: any) => {
    console.log('[FCM] Foreground message received!', remoteMessage?.messageId);
  });

  // Handle when app is in background but opened
  const unsubscribeOpened = onNotificationOpenedApp(messaging, (remoteMessage: any) => {
    console.log('[FCM] App opened from background state:', remoteMessage?.messageId);
  });

  // Handle when app is closed and opened
  getInitialNotification(messaging)
    .then((remoteMessage: any) => {
      if (remoteMessage) {
        console.log('[FCM] App opened from quit state:', remoteMessage?.messageId);
      }
    }).catch((err: any) => {
        console.error('[FCM] Error getting initial notification:', err);
    });

  return () => {
    console.log('[FCM] Cleaning up listeners...');
    unsubscribeForeground();
    unsubscribeOpened();
  };
};


