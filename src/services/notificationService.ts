import '@react-native-firebase/app';
import { getMessaging, requestPermission, getToken, onMessage, onNotificationOpenedApp, getInitialNotification, onTokenRefresh } from '@react-native-firebase/messaging';
import { PermissionsAndroid, Platform, Alert } from 'react-native';
import { navigationRef } from '../navigation/AppNavigator';

const getMessagingInstance = () => {
  try {
    return getMessaging();
  } catch (e) {
    console.warn('[FCM] Firebase messaging not ready yet:', e);
    return null;
  }
};

export const requestNotificationPermission = async () => {
  console.log('[FCM] Checking notification permissions...');
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    try {
      console.log('[FCM] Android 13+ detected, checking POST_NOTIFICATIONS...');
      const alreadyGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      if (alreadyGranted) {
        console.log('[FCM] Notification permission already granted.');
        return;
      }
      console.log('[FCM] Requesting POST_NOTIFICATIONS with rationale...');
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        {
          title: 'Emergency Notification Permission',
          message: 'SafeVoice requires notification permission to instantly alert you when your emergency contacts trigger an SOS.',
          buttonPositive: 'Allow Alerts',
          buttonNegative: 'Not Now',
        }
      );
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
      const messaging = getMessagingInstance();
      if (messaging) {
        const authStatus = await requestPermission(messaging);
        console.log('[FCM] Notification authorization status:', authStatus);
      }
    } catch (err) {
      console.error('[FCM] Error requesting Firebase permission:', err);
    }
  }
};

export const getFCMToken = async (timeoutMs: number = 6000): Promise<string | null> => {
  try {
    console.log('[FCM] Attempting to retrieve FCM token from Firebase...');
    const messaging = getMessagingInstance();
    if (!messaging) {
      console.warn('[FCM] Messaging instance not available for token retrieval');
      return null;
    }
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => {
        console.warn(`[FCM] Token retrieval timed out after ${timeoutMs}ms.`);
        resolve(null);
      }, timeoutMs)
    );
    const token = await Promise.race([getToken(messaging), timeoutPromise]);
    if (token) {
      console.log('[FCM] Device Token retrieved successfully (prefix):', token.substring(0, 10) + '...');
    } else {
      console.log('[FCM] Token is null or empty.');
    }
    return token;
  } catch (error) {
    console.error('[FCM] Failed to get FCM token:', error);
    return null;
  }
};

export const setupTokenRefreshListener = (onRefresh: (token: string) => void) => {
  console.log('[FCM] Setting up token refresh listener...');
  const messaging = getMessagingInstance();
  if (!messaging) return () => {};
  return onTokenRefresh(messaging, (newToken: string) => {
    console.log('[FCM] Token refreshed automatically by Firebase:', newToken.substring(0, 10) + '...');
    onRefresh(newToken);
  });
};

const handleNotificationNavigation = (remoteMessage: any) => {
  if (!remoteMessage || !remoteMessage.data) return;
  const emergencyId = remoteMessage.data.emergency_id;
  if (!emergencyId) return;

  console.log(`[FCM] Navigating to EmergencyDetail for emergency ID: ${emergencyId}`);
  if (navigationRef.isReady()) {
    navigationRef.navigate('EmergencyDetail', { emergencyId });
  } else {
    // Retry once navigator is ready
    const timer = setInterval(() => {
      if (navigationRef.isReady()) {
        clearInterval(timer);
        navigationRef.navigate('EmergencyDetail', { emergencyId });
      }
    }, 200);
    setTimeout(() => clearInterval(timer), 5000);
  }
};

export const setupNotificationListeners = () => {
  console.log('[FCM] Setting up push notification listeners...');
  const messaging = getMessagingInstance();
  if (!messaging) return () => {};
  
  // Handle foreground messages
  const unsubscribeForeground = onMessage(messaging, async (remoteMessage: any) => {
    console.log('[FCM] Foreground message received!', remoteMessage?.messageId, remoteMessage?.data);
    const emergencyId = remoteMessage?.data?.emergency_id;
    const senderName = remoteMessage?.data?.sender_name || 'Emergency Contact';
    const address = remoteMessage?.data?.resolved_address;
    
    Alert.alert(
      `🚨 SafeVoice SOS: ${senderName}`,
      `An emergency alert was triggered${address ? ` near ${address}` : ''}. View details and audio evidence?`,
      [
        { text: 'Dismiss', style: 'cancel' },
        {
          text: 'View Details',
          onPress: () => {
            if (emergencyId) {
              handleNotificationNavigation(remoteMessage);
            }
          },
        },
      ]
    );
  });

  // Handle when app is in background but opened from notification
  const unsubscribeOpened = onNotificationOpenedApp(messaging, (remoteMessage: any) => {
    console.log('[FCM] App opened from background notification:', remoteMessage?.messageId);
    handleNotificationNavigation(remoteMessage);
  });

  // Handle when app is opened from closed/quit state
  getInitialNotification(messaging)
    .then((remoteMessage: any) => {
      if (remoteMessage) {
        console.log('[FCM] App opened from quit state notification:', remoteMessage?.messageId);
        handleNotificationNavigation(remoteMessage);
      }
    })
    .catch((err: any) => {
      console.error('[FCM] Error getting initial notification:', err);
    });

  return () => {
    console.log('[FCM] Cleaning up listeners...');
    unsubscribeForeground();
    unsubscribeOpened();
  };
};
