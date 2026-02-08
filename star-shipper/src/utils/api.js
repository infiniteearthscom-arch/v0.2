// ============================================
// API CLIENT
// Handles all HTTP communication with the backend
// ============================================

const API_URL = 'http://localhost:3001/api';
const SERVER_URL = 'http://localhost:3001';

// Get stored auth token
const getToken = () => localStorage.getItem('star-shipper-token');

// Store auth token
export const setToken = (token) => localStorage.setItem('star-shipper-token', token);

// Make an authenticated API request
const request = async (endpoint, options = {}) => {
  const token = getToken();
  
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  };

  const response = await fetch(`${API_URL}${endpoint}`, config);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }

  return data;
};

// ============================================
// AUTH API
// ============================================

export const authAPI = {
  register: async (username, email, password) => {
    const data = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    });
    setToken(data.token);
    return data;
  },

  login: async (email, password) => {
    const data = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    return data;
  },

  getMe: async () => {
    return request('/auth/me');
  },

  logout: () => {
    localStorage.removeItem('star-shipper-token');
  },

  isLoggedIn: () => {
    return !!getToken();
  },

  // Google OAuth — redirect to server which redirects to Google
  getGoogleAuthUrl: () => {
    return `${SERVER_URL}/api/auth/google`;
  },
};

// ============================================
// OAuth URL token handler
// Call this on app load to check if we're returning from OAuth
// ============================================

export const handleOAuthCallback = () => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const authError = params.get('auth_error');
  const provider = params.get('provider');
  const isNew = params.get('isNew') === 'true';

  // Clean up URL
  if (token || authError) {
    window.history.replaceState({}, '', window.location.pathname);
  }

  if (authError) {
    return { error: `Login failed: ${authError}` };
  }

  if (token) {
    setToken(token);
    return { success: true, provider, isNew };
  }

  return null;
};

// ============================================
// SHIPS API
// ============================================

export const shipsAPI = {
  // Designs
  getDesigns: () => request('/ships/designs'),
  
  getDesign: (id) => request(`/ships/designs/${id}`),
  
  saveDesign: (design) => request('/ships/designs', {
    method: 'POST',
    body: JSON.stringify(design),
  }),
  
  deleteDesign: (id) => request(`/ships/designs/${id}`, {
    method: 'DELETE',
  }),

  // Ships
  getShips: () => request('/ships'),
  
  getShip: (id) => request(`/ships/${id}`),
  
  buildShip: (designId, name) => request('/ships/build', {
    method: 'POST',
    body: JSON.stringify({ designId, name }),
  }),
  
  renameShip: (id, name) => request(`/ships/${id}/name`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  }),
  
  scrapShip: (id) => request(`/ships/${id}`, {
    method: 'DELETE',
  }),
};

// ============================================
// HEALTH CHECK
// ============================================

export const checkServerHealth = async () => {
  try {
    const response = await fetch('http://localhost:3001/health');
    const data = await response.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
};
