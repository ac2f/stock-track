import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../types';

/**
 * RBAC için UI kapısı. Yalnızca belirtilen rollerdeki kullanıcı içeriği görür.
 * Örn: mali raporlar yalnızca <RoleGate roles={['owner']}> içinde.
 */
export function RoleGate({
  roles,
  children,
  fallback = null,
}: {
  roles: UserRole[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { hasRole } = useAuth();
  return <>{hasRole(...roles) ? children : fallback}</>;
}
