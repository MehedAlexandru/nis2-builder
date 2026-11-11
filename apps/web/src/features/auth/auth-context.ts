import { createContext, useContext } from 'react';
import type {
  AuthResponse,
  AuthUser,
  LoginInput,
  LoginResponse,
  OrganizationSummary,
} from '@nis2/shared';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  organizations: OrganizationSummary[];
  activeOrganizationId: string | null;
  activeOrganization: OrganizationSummary | null;
  login: (input: LoginInput) => Promise<LoginResponse>;
  completeLogin: (response: AuthResponse) => void;
  logout: () => Promise<void>;
  selectOrganization: (organizationId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
