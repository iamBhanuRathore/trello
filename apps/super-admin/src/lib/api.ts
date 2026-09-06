import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  if (
    config.url?.includes('/auth/sign-in') ||
    config.url?.includes('/auth/sign-up') ||
    config.url?.includes('/auth/refresh')
  ) {
    return config;
  }
  const token =
    localStorage.getItem('boardly_superadmin_token') ||
    localStorage.getItem('boardly_access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('boardly_superadmin_token');
    }
    return Promise.reject(error);
  }
);
