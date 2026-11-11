import type {
  AuthResponse,
  AuthUser,
  LoginInput,
  LoginResponse,
  OrganizationSummary,
} from '@nis2/shared';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi, refreshAccessToken, setAccessToken } from '@/lib/api';
import { AuthContext, type AuthStatus } from './auth-context';

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  organizations: OrganizationSummary[];
  activeOrganizationId: string | null;
}

const ANONYMOUS: AuthState = {
  status: 'anonymous',
  user: null,
  organizations: [],
  activeOrganizationId: null,
};

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    user: null,
    organizations: [],
    activeOrganizationId: null,
  });

  const apply = useCallback((response: AuthResponse) => {
    setAccessToken(response.accessToken);
    setState({
      status: 'authenticated',
      user: response.user,
      organizations: response.organizations,
      activeOrganizationId: response.activeOrganizationId,
    });
  }, []);

  const clear = useCallback(() => {
    setAccessToken(null);
    setState(ANONYMOUS);
  }, []);

  const refresh = useCallback(async () => {
    const response = await refreshAccessToken();
    if (response) apply(response);
    else setState(ANONYMOUS);
  }, [apply]);

  useEffect(() => {
    // The CSRF cookie is readable by JavaScript and is issued together with the
    // HttpOnly refresh cookie. If it is absent there is no session to restore.
    if (!document.cookie.split('; ').some((entry) => entry.startsWith('nis2_csrf='))) {
      setState(ANONYMOUS);
      return undefined;
    }

    let cancelled = false;
    void (async () => {
      const response = await refreshAccessToken();
      if (cancelled) return;
      if (response) apply(response);
      else setState(ANONYMOUS);
    })();
    return () => {
      cancelled = true;
    };
  }, [apply]);

  useEffect(() => {
    if (state.status !== 'authenticated') return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [state.status, refresh]);

  const login = useCallback(
    async (input: LoginInput): Promise<LoginResponse> => {
      const response = await authApi.login(input);
      if ('accessToken' in response) apply(response);
      return response;
    },
    [apply],
  );

  const completeLogin = useCallback((response: AuthResponse) => apply(response), [apply]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Logging out locally is best-effort: clear state even if the call fails.
    }
    clear();
  }, [clear]);

  const selectOrganization = useCallback(
    async (organizationId: string) => {
      const response = await authApi.selectOrganization({ organizationId });
      apply(response);
    },
    [apply],
  );

  const value = useMemo(() => {
    const activeOrganization =
      state.organizations.find((organization) => organization.id === state.activeOrganizationId) ??
      null;
    return {
      ...state,
      activeOrganization,
      login,
      completeLogin,
      logout,
      selectOrganization,
      refresh,
    };
  }, [state, login, completeLogin, logout, selectOrganization, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
