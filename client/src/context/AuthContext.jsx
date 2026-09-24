import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('inertayo_token'));
  const [savedRouteIds, setSavedRouteIds] = useState([]);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState('login'); // 'login' or 'register'
  const [loading, setLoading] = useState(true);

  // Load user profile on mount or token change
  useEffect(() => {
    if (token) {
      fetchProfile(token);
    } else {
      setUser(null);
      setSavedRouteIds([]);
      setLoading(false);
    }
  }, [token]);

  const fetchProfile = async (authToken) => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setSavedRouteIds(data.savedRoutes.map(r => r.id));
      } else {
        // Expired or invalid token
        logout();
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Login failed.');
    }

    localStorage.setItem('inertayo_token', data.token);
    setToken(data.token);
    setUser(data.user);
    setAuthModalOpen(false);
    return data.user;
  };

  const register = async (username, email, password) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Registration failed.');
    }

    localStorage.setItem('inertayo_token', data.token);
    setToken(data.token);
    setUser(data.user);
    setAuthModalOpen(false);
    return data.user;
  };

  const forgotPassword = async (identifier) => {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to request reset code.');
    }
    return data;
  };

  const resetPassword = async (email, resetCode, newPassword) => {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, resetCode, newPassword })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to reset password.');
    }
    return data;
  };

  const logout = () => {
    localStorage.removeItem('inertayo_token');
    setToken(null);
    setUser(null);
    setSavedRouteIds([]);
  };

  const toggleSaveRoute = async (routeId) => {
    if (!user || user.role !== 'COMMUTER') {
      setAuthModalMode('login');
      setAuthModalOpen(true);
      return false;
    }

    try {
      const currentlySaved = savedRouteIds.includes(routeId);
      const res = await fetch(currentlySaved ? `/api/saved-routes/${routeId}` : '/api/saved-routes', {
        method: currentlySaved ? 'DELETE' : 'POST',
        body: currentlySaved ? undefined : JSON.stringify({ routeId }),
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error('Failed to update saved route.');
      const data = await res.json();
      setSavedRouteIds(prev => data.saved
        ? (prev.includes(routeId) ? prev : [...prev, routeId])
        : prev.filter(id => id !== routeId));
      return data.saved;
    } catch (err) {
      console.error('Error toggling route bookmark:', err);
    }
    return false;
  };

  const isSaved = (routeId) => savedRouteIds.includes(routeId);

  const openAuth = (mode = 'login') => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  };

  const closeAuth = () => setAuthModalOpen(false);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAdmin: user?.role === 'ADMIN',
        isCommuter: user?.role === 'COMMUTER',
        savedRouteIds,
        loading,
        login,
        register,
        forgotPassword,
        resetPassword,
        logout,
        toggleSaveRoute,
        isSaved,
        authModalOpen,
        authModalMode,
        openAuth,
        closeAuth,
        setAuthModalMode
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
