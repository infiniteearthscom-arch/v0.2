import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { checkServerHealth } from '@/utils/api';

// Google "G" logo as inline SVG
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>
);

export const AuthScreen = () => {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [serverOnline, setServerOnline] = useState(null);
  const [formError, setFormError] = useState(null);

  const { login, register, loginWithGoogle, error, isLoading, clearError } = useAuthStore();

  // Check server connection
  useEffect(() => {
    checkServerHealth().then(setServerOnline);
    const interval = setInterval(() => {
      checkServerHealth().then(setServerOnline);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Clear errors when switching modes
  useEffect(() => {
    clearError();
    setFormError(null);
  }, [mode, clearError]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    if (mode === 'register') {
      if (username.length < 3) {
        setFormError('Username must be at least 3 characters');
        return;
      }
      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        setFormError('Username can only contain letters, numbers, and underscores');
        return;
      }
      if (password.length < 8) {
        setFormError('Password must be at least 8 characters');
        return;
      }
      if (password !== confirmPassword) {
        setFormError('Passwords do not match');
        return;
      }
      await register(username, email, password);
    } else {
      await login(email, password);
    }
  };

  const displayError = formError || error;

  return (
    <div className="relative z-10 flex items-center justify-center h-full">
      <div className="w-full max-w-md mx-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1
            className="text-5xl font-bold tracking-wider mb-2"
            style={{
              background: 'linear-gradient(135deg, #00d4ff 0%, #0080ff 50%, #8040ff 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            STAR SHIPPER
          </h1>
          <p className="text-cyan-400/60 text-sm tracking-widest uppercase">
            {mode === 'login' ? 'Welcome Back, Commander' : 'New Commander Registration'}
          </p>
        </div>

        {/* Server status */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div
            className={`w-2 h-2 rounded-full ${
              serverOnline === null
                ? 'bg-yellow-400 animate-pulse'
                : serverOnline
                  ? 'bg-green-400'
                  : 'bg-red-400'
            }`}
          />
          <span className="text-xs text-slate-400">
            {serverOnline === null
              ? 'Connecting to server...'
              : serverOnline
                ? 'Server online'
                : 'Server offline — start the backend first'}
          </span>
        </div>

        {/* Auth card */}
        <div
          className="rounded-xl p-6 border border-cyan-500/20"
          style={{
            background: 'linear-gradient(180deg, rgba(10,25,50,0.9) 0%, rgba(5,15,35,0.95) 100%)',
            boxShadow: '0 0 40px rgba(0,100,150,0.15), inset 0 1px 0 rgba(0,180,220,0.1)',
          }}
        >
          {/* Google Sign In Button */}
          <button
            onClick={loginWithGoogle}
            disabled={!serverOnline}
            className={`w-full flex items-center justify-center gap-3 py-3 rounded-lg mb-5 font-medium transition-all ${
              serverOnline
                ? 'bg-white text-gray-700 hover:bg-gray-100 hover:shadow-lg'
                : 'bg-gray-600 text-gray-400 cursor-not-allowed'
            }`}
          >
            <GoogleIcon />
            <span>Sign in with Google</span>
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-slate-600/50" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">or use email</span>
            <div className="flex-1 h-px bg-slate-600/50" />
          </div>

          {/* Tab switcher */}
          <div className="flex mb-5 rounded-lg overflow-hidden border border-slate-700/50">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 py-2.5 text-sm font-medium transition-all ${
                mode === 'login'
                  ? 'bg-cyan-500/20 text-cyan-100 border-b-2 border-cyan-400'
                  : 'bg-slate-800/30 text-slate-400 hover:text-slate-300'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setMode('register')}
              className={`flex-1 py-2.5 text-sm font-medium transition-all ${
                mode === 'register'
                  ? 'bg-cyan-500/20 text-cyan-100 border-b-2 border-cyan-400'
                  : 'bg-slate-800/30 text-slate-400 hover:text-slate-300'
              }`}
            >
              Register
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Username (register only) */}
            {mode === 'register' && (
              <div>
                <label className="block text-xs text-cyan-400/70 uppercase tracking-wider mb-1.5">
                  Call Sign
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Commander_Name"
                  maxLength={32}
                  className="w-full px-4 py-3 rounded-lg bg-slate-900/80 border border-slate-600/40 text-cyan-100 placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all"
                  required
                />
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-xs text-cyan-400/70 uppercase tracking-wider mb-1.5">
                {mode === 'register' ? 'Comm Channel (Email)' : 'Email'}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="commander@starfleet.com"
                className="w-full px-4 py-3 rounded-lg bg-slate-900/80 border border-slate-600/40 text-cyan-100 placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all"
                required
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs text-cyan-400/70 uppercase tracking-wider mb-1.5">
                {mode === 'register' ? 'Security Code (8+ chars)' : 'Password'}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-lg bg-slate-900/80 border border-slate-600/40 text-cyan-100 placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all"
                required
              />
            </div>

            {/* Confirm Password (register only) */}
            {mode === 'register' && (
              <div>
                <label className="block text-xs text-cyan-400/70 uppercase tracking-wider mb-1.5">
                  Confirm Security Code
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-lg bg-slate-900/80 border border-slate-600/40 text-cyan-100 placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all"
                  required
                />
              </div>
            )}

            {/* Error display */}
            {displayError && (
              <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                ⚠ {displayError}
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading || !serverOnline}
              className={`w-full py-3.5 rounded-lg text-base font-semibold tracking-wide transition-all ${
                isLoading || !serverOnline
                  ? 'bg-slate-700/30 border border-slate-600/20 text-slate-500 cursor-not-allowed'
                  : 'bg-cyan-500/20 border border-cyan-400/40 text-cyan-100 hover:bg-cyan-500/30 hover:border-cyan-400/60 hover:shadow-lg hover:shadow-cyan-500/10'
              }`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {mode === 'login' ? 'Authenticating...' : 'Creating Account...'}
                </span>
              ) : (
                mode === 'login' ? 'Launch' : 'Enlist'
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-600 mt-6">
          Star Shipper v0.2.0 — Multiplayer Preview
        </p>
      </div>
    </div>
  );
};

export default AuthScreen;
