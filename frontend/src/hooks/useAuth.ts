import { useAuthContext } from '../context/AuthContext';
import { UserRole } from '../types/auth.types';

export function useAuth() {
  const auth = useAuthContext();

  return {
    ...auth,
    isAuthenticated: auth.status === 'authenticated',
    isLoading: auth.status === 'loading',
    isCustomer: auth.user?.role === 'CUSTOMER',
    isAdmin: auth.user?.role === 'ADMIN',
    hasRole: (requiredRole: UserRole) => auth.user?.role === requiredRole,
    hasAnyRole: (roles: UserRole[]) => (auth.user ? roles.includes(auth.user.role) : false)
  };
}
