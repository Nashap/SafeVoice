import Geolocation from 'react-native-geolocation-service';
import { PermissionsAndroid, Platform } from 'react-native';

export interface LocationData {
  latitude: number;
  longitude: number;
}

export const requestLocationPermission = async (): Promise<boolean> => {
  if (Platform.OS === 'android') {
    try {
      console.log('[GPS_DEBUG] requesting location permission');
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ]);
      const isGranted = 
        granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED ||
        granted[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
      console.log(`[GPS_DEBUG] permission result: ${JSON.stringify(granted)}`);
      return isGranted;
    } catch (err) {
      console.warn(err);
      return false;
    }
  }
  return true;
};

export const getCurrentLocation = (): Promise<LocationData> => {
  return new Promise((resolve, reject) => {
    console.log('[GPS_DEBUG] requesting current position');
    Geolocation.getCurrentPosition(
      (position) => {
        console.log(`[GPS_DEBUG] latitude: ${position.coords.latitude}`);
        console.log(`[GPS_DEBUG] longitude: ${position.coords.longitude}`);
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        console.error(`[GPS_DEBUG] location retrieval failed: ${error.message}`);
        reject(error);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  });
};
