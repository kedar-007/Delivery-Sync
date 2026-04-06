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
  const { user, loading, needsRegistration, suspensionInfo } = useAuth();
  const { tenantSlug } = useParams<{ tenantSlug: string }>();

  if (loading) return <PageLoader />;

  if (suspensionInfo) return <SuspendedScreen info={suspensionInfo} />;

  if (!user || needsRegistration) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === 'SUPER_ADMIN') {
    return <Navigate to="/super-admin" replace />;
  }

  // Correct tenant slug mismatch — also handles the case where we land on /
  // with no tenantSlug param by redirecting to the user's real tenant.
  const correctSlug = user.tenantSlug || user.tenantSlug;
  console.log("Slug to be redirected--",correctSlug);
  if (correctSlug && tenantSlug !== correctSlug) {
    return <Navigate to={`/${correctSlug}/dashboard`} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={`/${user.tenantSlug || tenantSlug}/dashboard`} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export default ProtectedRoute;
