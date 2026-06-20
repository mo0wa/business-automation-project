import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

// 모든 요청에 로그인 토큰 자동 첨부
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('bp_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 토큰 만료/무효(401) 시 자동 로그아웃 → 로그인 화면으로
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url || '';
    if (err.response?.status === 401 && !url.includes('/auth/login')) {
      localStorage.removeItem('bp_token');
      localStorage.removeItem('bp_user');
      window.location.reload();
    }
    return Promise.reject(err);
  }
);

// ===== 인증 =====
export const authAPI = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  logout: () => api.post('/auth/logout'),
  getUsers: () => api.get('/auth/users'),
  createUser: (data) => api.post('/auth/users', data),
};

// ===== 견적서 =====
export const quoteAPI = {
  getAll: (params) => api.get('/quotes', { params }),
  getClients: () => api.get('/quotes/clients'),
  getById: (id) => api.get(`/quotes/${id}`),
  create: (data) => api.post('/quotes', data),
  update: (id, data) => api.put(`/quotes/${id}`, data),
  updateStatus: (id, status) => api.patch(`/quotes/${id}/status`, { status }),
  toggleComplete: (id, is_completed) => api.patch(`/quotes/${id}/complete`, { is_completed }),
  delete: (id) => api.delete(`/quotes/${id}`),
};

export const trashAPI = {
  getAll: () => api.get('/quotes/trash'),
  restore: (id) => api.post(`/quotes/${id}/restore`),
  deletePermanent: (id) => api.delete(`/quotes/${id}/permanent`),
};

// ===== 지출 =====
export const expenseAPI = {
  getAll: (params) => api.get('/expenses', { params }),
  create: (data) => api.post('/expenses', data),
  update: (id, data) => api.put(`/expenses/${id}`, data),
  delete: (id) => api.delete(`/expenses/${id}`),
};

// ===== 매출 장부 =====
export const revenueAPI = {
  getMonthly: (year) => api.get('/revenue/monthly', { params: { year } }),
  getYearly: () => api.get('/revenue/yearly'),
  getSummary: (year) => api.get('/revenue/summary', { params: { year } }),
  getMonthlyQuotes: (year, month) => api.get('/revenue/monthly-quotes', { params: { year, month } }),
  getNotes: (year) => api.get('/revenue/notes', { params: { year } }),
  saveNote: (data) => api.post('/revenue/notes', data),
};

// ===== 일정(캘린더) =====
export const calendarAPI = {
  get: (year, month) => api.get('/calendar', { params: { year, month } }),
};

// ===== 관리자 설정 =====
export const settingsAPI = {
  get: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),
};

// ===== 월별 고정 지출 체크리스트 =====
export const fixedExpenseAPI = {
  getItems: () => api.get('/fixed-expenses/items'),
  addItem: (data) => api.post('/fixed-expenses/items', typeof data === 'string' ? { name: data } : data),
  updateItem: (id, data) => api.put(`/fixed-expenses/items/${id}`, typeof data === 'string' ? { name: data } : data),
  reorderItems: (ids) => api.put('/fixed-expenses/items/reorder', { ids }),
  deleteItem: (id) => api.delete(`/fixed-expenses/items/${id}`),
  getChecks: (year, month) => api.get('/fixed-expenses/checks', { params: { year, month } }),
  upsertCheck: (data) => api.post('/fixed-expenses/checks', data),
};

export default api;
