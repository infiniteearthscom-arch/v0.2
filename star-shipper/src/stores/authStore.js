import { create } from 'zustand';
import { authAPI, handleOAuthCallback } from '@/utils/api';

export const useAuthStore = create((set, get) => ({
  // State
  user: null,
  resources: null,
  isLoggedIn: false,
  isLoading: true,
  error: null,

  // ==========================================
  // ACTIONS
  // ==========================================

  // Check for existing session or OAuth callback on app load
  checkSession: async () => {
    // First check if we're returning from an OAuth redirect
    const oauthResult = handleOAuthCallback();
    
    if (oauthResult?.error) {
      set({ isLoading: false, error: oauthResult.error });
      return;
    }

    // Check if we have a token (either from OAuth callback or existing session)
    if (!authAPI.isLoggedIn()) {
      set({ isLoading: false });
      return;
    }

    try {
      const data = await authAPI.getMe();
      set({
        user: data.user,
        resources: data.resources,
        isLoggedIn: true,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      // Token expired or invalid
      authAPI.logout();
      set({
        user: null,
        resources: null,
        isLoggedIn: false,
        isLoading: false,
        error: null,
      });
    }
  },

  // Register with email/password
  register: async (username, email, password) => {
    set({ error: null, isLoading: true });
    try {
      const data = await authAPI.register(username, email, password);
      set({
        user: data.user,
        isLoggedIn: true,
        isLoading: false,
        error: null,
      });
      return { success: true };
    } catch (error) {
      set({ error: error.message, isLoading: false });
      return { success: false, error: error.message };
    }
  },

  // Login with email/password
  login: async (email, password) => {
    set({ error: null, isLoading: true });
    try {
      const data = await authAPI.login(email, password);
      const userData = await authAPI.getMe();
      set({
        user: userData.user,
        resources: userData.resources,
        isLoggedIn: true,
        isLoading: false,
        error: null,
      });
      return { success: true };
    } catch (error) {
      set({ error: error.message, isLoading: false });
      return { success: false, error: error.message };
    }
  },

  // Google login — redirects to server → Google → back
  loginWithGoogle: () => {
    window.location.href = authAPI.getGoogleAuthUrl();
  },

  // Logout
  logout: () => {
    authAPI.logout();
    set({
      user: null,
      resources: null,
      isLoggedIn: false,
      error: null,
    });
  },

  // Clear error
  clearError: () => set({ error: null }),

  // Update resources (called after server sync)
  updateResources: (resources) => set({ resources }),
}));
