import axios from 'axios';

const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true, // send session cookies
  headers: { 'Content-Type': 'application/json' },
});

// Redirect to login on 401
apiClient.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;
