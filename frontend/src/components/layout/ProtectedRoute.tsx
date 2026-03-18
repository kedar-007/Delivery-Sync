import React from 'react';
import { Navigate, Outlet, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { PageLoader } from '../ui/Spinner';
import { UserRole } from '../../types';

interface ProtectedRouteProps {
  children?: React.ReactNode;
  allowedRoles?: UserRole[];
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, loading, needsRegistration } = useAuth();
  const { tenantSlug } = useParams<{ tenantSlug: string }>();

  if (loading) return <PageLoader />;

  if (!user || needsRegistration) {
    return <Navigate to="/login" replace />;
  }

  // Super admin belongs at /super-admin, not inside any tenant
  if (user.role === 'SUPER_ADMIN') {
    return <Navigate to="/super-admin" replace />;
  }

  // If the URL tenantSlug doesn't match the user's tenant, redirect to correct slug
  if (tenantSlug && user.tenantSlug && tenantSlug !== user.tenantSlug) {
    return <Navigate to={`/${user.tenantSlug}/dashboard`} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={`/${user.tenantSlug || tenantSlug}/dashboard`} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export default ProtectedRoute;
