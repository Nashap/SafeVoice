import axios from 'axios';
import { DeviceEventEmitter } from 'react-native';
import * as Keychain from 'react-native-keychain';

export const API_URL = 'http://10.0.2.2:8000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.request.use(
  async (config) => {
    const credentials = await Keychain.getGenericPassword();
    if (credentials) {
      try {
        const tokens = JSON.parse(credentials.password);
        if (tokens.access && config.headers) {
          config.headers.Authorization = `Bearer ${tokens.access}`;
        }
      } catch (e) {
        // Error parsing tokens
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry && originalRequest.url !== '/auth/login/') {
      if (isRefreshing) {
        return new Promise(function (resolve, reject) {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = 'Bearer ' + token;
            return api(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const credentials = await Keychain.getGenericPassword();
        if (!credentials) {
          throw new Error('No credentials available');
        }

        const tokens = JSON.parse(credentials.password);
        if (!tokens.refresh) {
          throw new Error('No refresh token available');
        }

        const response = await axios.post(`${API_URL}/auth/token/refresh/`, {
          refresh: tokens.refresh,
        });

        const newAccessToken = response.data.access;
        // Keep the old refresh token
        await Keychain.setGenericPassword('auth', JSON.stringify({ access: newAccessToken, refresh: tokens.refresh, username: tokens.username }));
        
        api.defaults.headers.common['Authorization'] = 'Bearer ' + newAccessToken;
        originalRequest.headers.Authorization = 'Bearer ' + newAccessToken;
        
        processQueue(null, newAccessToken);
        return api(originalRequest);
      } catch (refreshError) {
        console.error('[API] Refresh token failed or expired. Logging out.');
        processQueue(refreshError, null);
        await Keychain.resetGenericPassword();
        DeviceEventEmitter.emit('auth_error');
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export default api;
