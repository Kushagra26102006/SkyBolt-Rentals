import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  UserDTO,
  AuthState,
  LoginCredentials,
  RegisterCredentials,
  UpdateProfileInput
} from '../types/auth.types';
import { authService } from '../services/auth.service';

export interface AuthContextValue extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (fields: UpdateProfileInput) => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    user: null,
    error: null
  });

  // On application startup: authoritative backend session restoration via GET /auth/me
  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      try {
        const user = await authService.getMe();
        if (isMounted) {
          setState({
            status: 'authenticated',
            user,
            error: null
          });
        }
      } catch {
        if (isMounted) {
          setState({
            status: 'unauthenticated',
            user: null,
            error: null
          });
        }
      }
    }

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (credentials: LoginCredentials): Promise<void> => {
    setState((prev) => ({ ...prev, status: 'loading', error: null }));
    try {
      const user = await authService.login(credentials);
      setState({
        status: 'authenticated',
        user,
        error: null
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      setState({
        status: 'unauthenticated',
        user: null,
        error: message
      });
      throw err;
    }
  };

  const register = async (credentials: RegisterCredentials): Promise<void> => {
    setState((prev) => ({ ...prev, status: 'loading', error: null }));
    try {
      const user = await authService.register(credentials);
      setState({
        status: 'authenticated',
        user,
        error: null
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setState({
        status: 'unauthenticated',
        user: null,
        error: message
      });
      throw err;
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await authService.logout();
    } catch {
      // Best-effort logout cleanup
    } finally {
      setState({
        status: 'unauthenticated',
        user: null,
        error: null
      });
    }
  };

  const updateProfile = async (fields: UpdateProfileInput): Promise<void> => {
    try {
      const updatedUser = await authService.updateProfile(fields);
      setState((prev) => ({
        ...prev,
        user: updatedUser,
        error: null
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update profile';
      setState((prev) => ({ ...prev, error: message }));
      throw err;
    }
  };

  const clearError = (): void => {
    setState((prev) => ({ ...prev, error: null }));
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        logout,
        updateProfile,
        clearError
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};
