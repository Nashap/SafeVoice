/**
 * SafeVoice Mobile Environment Configuration
 *
 * Separates Development and Production API configurations.
 * In React Native, __DEV__ is true in development/debug builds and false in release builds.
 */

/**
 * Production API Base URL
 *
 * Replace this placeholder with your deployed Render service URL once Render deployment completes:
 * Example: 'https://safevoice-backend.onrender.com/api'
 */
export const PRODUCTION_API_URL = 'https://YOUR_RENDER_SERVICE_NAME.onrender.com/api';

/**
 * Development API Base URL
 * Android emulator connects to host localhost via 10.0.2.2.
 */
export const DEVELOPMENT_API_URL = 'http://10.0.2.2:8000/api';

/**
 * Checks if the production backend URL has been configured with an actual domain.
 */
export const isProductionBackendConfigured = (): boolean => {
  return (
    !PRODUCTION_API_URL.includes('YOUR_RENDER_SERVICE_NAME') &&
    PRODUCTION_API_URL.startsWith('https://')
  );
};

/**
 * Active API Base URL depending on build mode.
 * - In Development (__DEV__ === true): returns DEVELOPMENT_API_URL.
 * - In Production (__DEV__ === false): returns PRODUCTION_API_URL (or warns if unconfigured).
 */
export const getActiveApiUrl = (): string => {
  if (__DEV__) {
    return DEVELOPMENT_API_URL;
  }

  if (!isProductionBackendConfigured()) {
    console.warn(
      '[SafeVoice Config] WARNING: Production API URL is not yet configured!\n' +
      'Please update PRODUCTION_API_URL in src/config/env.ts with your deployed Render HTTPS URL.'
    );
  }

  return PRODUCTION_API_URL;
};

export const API_URL = getActiveApiUrl();
export default {
  API_URL,
  PRODUCTION_API_URL,
  DEVELOPMENT_API_URL,
  isProductionBackendConfigured,
};
