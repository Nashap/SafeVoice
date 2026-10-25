import Geolocation from 'react-native-geolocation-service';
import { PermissionsAndroid, Platform, NativeModules } from 'react-native';

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  resolved_address?: string;
  google_maps_url?: string;
  place_name?: string;
  city?: string;
  state?: string;
  timestamp?: number;
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

export const generateGoogleMapsUrl = (lat: number, lng: number): string => {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
};

export const getCurrentLocation = (): Promise<LocationData> => {
  return new Promise((resolve, reject) => {
    console.log('[GPS_DEBUG] requesting fresh current position');
    Geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        console.log(`[GPS_DEBUG] fresh GPS coordinates: lat=${latitude}, lng=${longitude}, acc=${accuracy}`);
        if (latitude === 0 && longitude === 0) {
          console.warn('[GPS_DEBUG] Rejected null-island coordinates (0, 0)');
          reject(new Error('Invalid GPS coordinates (0, 0)'));
          return;
        }
        resolve({
          latitude,
          longitude,
          accuracy,
          google_maps_url: generateGoogleMapsUrl(latitude, longitude),
          timestamp: position.timestamp,
        });
      },
      (error) => {
        console.error(`[GPS_DEBUG] location retrieval failed: ${error.message}`);
        reject(error);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
};

/**
 * Retrieves coordinates and attempts free native reverse geocoding via Android Geocoder.
 * Times out after 3500ms so reverse geocoding never blocks emergency SOS alerts.
 */
export const getReadableLocation = async (): Promise<LocationData> => {
  const baseLoc = await getCurrentLocation();
  const mapsUrl = generateGoogleMapsUrl(baseLoc.latitude, baseLoc.longitude);

  const LocationHelper = NativeModules.LocationHelperModule;
  if (!LocationHelper || !LocationHelper.reverseGeocode) {
    return {
      ...baseLoc,
      google_maps_url: mapsUrl,
      resolved_address: 'Address unavailable',
    };
  }

  try {
    const geocodePromise = LocationHelper.reverseGeocode(baseLoc.latitude, baseLoc.longitude);
    const timeoutPromise = new Promise<{ address: string }>((resolve) =>
      setTimeout(() => resolve({ address: 'Address unavailable' }), 3500)
    );

    const geoResult = await Promise.race([geocodePromise, timeoutPromise]);
    return {
      ...baseLoc,
      google_maps_url: mapsUrl,
      resolved_address: geoResult.address || 'Address unavailable',
      place_name: geoResult.placeName,
      city: geoResult.city,
      state: geoResult.state,
    };
  } catch (err) {
    console.warn('[GEOCODER] Reverse geocoding failed or timed out:', err);
    return {
      ...baseLoc,
      google_maps_url: mapsUrl,
      resolved_address: 'Address unavailable',
    };
  }
};
