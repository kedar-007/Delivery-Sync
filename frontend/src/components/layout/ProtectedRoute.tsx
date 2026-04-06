import React from 'react';
import { Navigate, Outlet, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { PageLoader } from '../ui/Spinner';
import { UserRole } from '../../types';
import SuspendedScreen from '../ui/SuspendedScreen';

interface ProtectedRouteProps {
  children?: React.ReactNode;
  allowedRoles?: UserRole[];
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, loading, isLoggedOut, needsRegistration, suspensionInfo } = useAuth();
  const { tenantSlug } = useParams<{ tenantSlug: string }>();

  // Still initialising
  if (loading) return <PageLoader />;

  // Logged out — stop here, no further checks
  if (isLoggedOut || !user) return <Navigate to="/login" replace />;

  if (suspensionInfo) return <SuspendedScreen info={suspensionInfo} />;

  if (needsRegistration) return <Navigate to="/login" replace />;

  if (user.role === 'SUPER_ADMIN') return <Navigate to="/super-admin" replace />;

  // Tenant slug mismatch — redirect to correct tenant
  const correctSlug = user.tenantSlug;
  if (correctSlug && tenantSlug !== correctSlug) {
    return <Navigate to={`/${correctSlug}/dashboard`} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={`/${correctSlug || tenantSlug}/dashboard`} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export default ProtectedRoute;