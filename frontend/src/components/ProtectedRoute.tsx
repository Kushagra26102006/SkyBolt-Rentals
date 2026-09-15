import React, { ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { UserRole } from '../types/auth.types';

interface ProtectedRouteProps {
  children: ReactNode;
  fallback?: ReactNode;
  requiredRole?: UserRole;
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  fallback = null,
  requiredRole,
  allowedRoles
}) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p>Loading session...</p>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return fallback ? <>{fallback}</> : <div>Please log in to view this page.</div>;
  }

  if (requiredRole && user.role !== requiredRole) {
    return <div>Access Denied. You do not have permission to view this content.</div>;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <div>Access Denied. Insufficient role permissions.</div>;
  }

  return <>{children}</>;
};
