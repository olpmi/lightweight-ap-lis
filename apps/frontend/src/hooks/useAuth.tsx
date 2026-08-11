import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi } from '../api';
import { EMPLOYEE_ROLES, type AppLanguageCode, type EmployeeRoleName } from '@lis/shared';

interface AuthContextValue {
  user: { employeeId: number; userName: string; role: EmployeeRoleName; defaultLanguage: AppLanguageCode } | null;
  loading: boolean;
  /**
   * Whether the signed-in user holds one of `roles`.
   *
   * Convenience for hiding controls the server would reject anyway — the guards
   * in the API are the enforcement. Returns false when signed out, so callers
   * need no separate null check.
   */
  hasRole: (...roles: EmployeeRoleName[]) => boolean;
  isPathologist: boolean;
  isAdministrator: boolean;
  login: (payload: object) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthContextValue['user']>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (payload: object) => {
    const emp = await authApi.login(payload as Parameters<typeof authApi.login>[0]);
    const session = await authApi.me();
    setUser(session);
  };

  const logout = async () => {
    await authApi.logout();
    setUser(null);
  };

  const hasRole = (...roles: EmployeeRoleName[]) => (user ? roles.includes(user.role) : false);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        hasRole,
        isPathologist: hasRole(EMPLOYEE_ROLES.PATHOLOGIST),
        isAdministrator: hasRole(EMPLOYEE_ROLES.ADMINISTRATOR),
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
