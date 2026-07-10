import axios from 'axios';
import { setupCache } from 'axios-cache-interceptor';
import { useAuthStore } from '../store/authStore';

const instance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Setup 5-minute cache for all GET requests
const api = setupCache(instance, {
  ttl: 1000 * 60 * 5, 
});

api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Do not cache mutations
    if (config.method?.toLowerCase() !== 'get') {
      config.cache = false;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  async (response) => {
    // Globally invalidate all cache on any successful mutation (POST, PUT, DELETE)
    // This ensures data stays perfectly fresh after creating/updating items
    if (response.config.method?.toLowerCase() !== 'get') {
      try { await (api.storage as unknown as { clear: () => Promise<void> }).clear(); } catch { /* ignore */ }
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
