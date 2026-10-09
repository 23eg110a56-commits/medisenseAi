import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  language: string;
  age?: number;
  gender?: string;
  weight?: number;
  height?: number;
  systolic_bp?: number;
  diastolic_bp?: number;
  fasting_sugar?: number;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, language?: string) => Promise<void>;
  logout: () => void;
  updateProfile: (profileData: Partial<User>) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');
      
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        
        // Refresh profile from backend to ensure data is fresh
        try {
          const res = await api.get('/auth/profile');
          setUser(res.data);
          localStorage.setItem('user', JSON.stringify(res.data));
        } catch (err) {
          console.error("Failed to sync profile on startup:", err);
          // If token was invalid, Axios interceptor will clear it
        }
      }
      setIsLoading(false);
    };
    initializeAuth();
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const { access_token } = res.data;
      
      localStorage.setItem('token', access_token);
      setToken(access_token);
      
      // Fetch full profile info
      const profileRes = await api.get('/auth/profile', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      
      setUser(profileRes.data);
      localStorage.setItem('user', JSON.stringify(profileRes.data));
    } catch (err) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (name: string, email: string, password: string, language = "en") => {
    setIsLoading(true);
    try {
      const res = await api.post('/auth/register', { name, email, password, language });
      const { access_token } = res.data;
      
      localStorage.setItem('token', access_token);
      setToken(access_token);
      
      const profileRes = await api.get('/auth/profile', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      
      setUser(profileRes.data);
      localStorage.setItem('user', JSON.stringify(profileRes.data));
    } catch (err) {
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    window.location.href = '/login';
  };

  const updateProfile = async (profileData: Partial<User>) => {
    try {
      const res = await api.put('/auth/profile/update', profileData);
      setUser(res.data);
      localStorage.setItem('user', JSON.stringify(res.data));
    } catch (err) {
      console.error("Failed to update profile:", err);
      throw err;
    }
  };

  const refreshProfile = async () => {
    try {
      const res = await api.get('/auth/profile');
      setUser(res.data);
      localStorage.setItem('user', JSON.stringify(res.data));
    } catch (err) {
      console.error("Failed to refresh profile:", err);
    }
  };

  const value = {
    user,
    token,
    isAuthenticated: !!token,
    isLoading,
    login,
    register,
    logout,
    updateProfile,
    refreshProfile
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
