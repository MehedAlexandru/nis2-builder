import type {
  AcceptInviteInput,
  AuthResponse,
  AuthSession,
  LoginInput,
  LoginResponse,
  MfaSetupResponse,
  OrganizationDetail,
  OrganizationSummary,
  RegisterInput,
  SelectOrganizationInput,
} from '@nis2/shared';

const API_BASE = '/api';
export const CSRF_COOKIE = 'nis2_csrf';

let accessToken: string | null = null;
let refreshInFlight: Promise<AuthResponse | null> | null = null;

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const entry = document.cookie.split('; ').find((candidate) => candidate.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}

async function rawRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) headers.set('x-csrf-token', csrf);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    method,
    headers,
    credentials: 'include',
  });

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const envelope = body as { error?: { code?: string; message?: string; details?: unknown } };
    throw new ApiClientError(
      response.status,
      envelope?.error?.code ?? `HTTP_${response.status}`,
      envelope?.error?.message ?? response.statusText,
      envelope?.error?.details,
    );
  }
  return body as T;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await rawRequest<T>(path, init);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) return rawRequest<T>(path, init);
    }
    throw error;
  }
}

/**
 * Silent refresh with a single in-flight request so concurrent 401s do not
 * rotate the refresh token family multiple times.
 */
export function refreshAccessToken(): Promise<AuthResponse | null> {
  refreshInFlight ??= (async () => {
    try {
      const response = await rawRequest<AuthResponse>('/auth/refresh', { method: 'POST' });
      setAccessToken(response.accessToken);
      return response;
    } catch {
      setAccessToken(null);
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

function jsonBody(value: unknown): RequestInit {
  return { body: JSON.stringify(value) };
}

export const authApi = {
  register: (input: RegisterInput) =>
    request<{ message: string }>('/auth/register', { method: 'POST', ...jsonBody(input) }),
  verifyEmail: (token: string) =>
    request<{ message: string }>('/auth/verify-email', { method: 'POST', ...jsonBody({ token }) }),
  resendVerification: (email: string) =>
    request<{ message: string }>('/auth/resend-verification', {
      method: 'POST',
      ...jsonBody({ email }),
    }),
  login: (input: LoginInput) =>
    request<LoginResponse>('/auth/login', { method: 'POST', ...jsonBody(input) }),
  refresh: refreshAccessToken,
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  forgotPassword: (email: string) =>
    request<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      ...jsonBody({ email }),
    }),
  resetPassword: (token: string, password: string) =>
    request<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      ...jsonBody({ token, password }),
    }),
  acceptInvite: (input: AcceptInviteInput) =>
    request<{ message: string }>('/auth/accept-invite', { method: 'POST', ...jsonBody(input) }),
  mfaChallenge: (token: string, code: string) =>
    request<AuthResponse>('/auth/mfa/challenge', { method: 'POST', ...jsonBody({ token, code }) }),
  mfaSetup: (token: string) =>
    request<MfaSetupResponse>('/auth/mfa/setup', { method: 'POST', ...jsonBody({ token }) }),
  mfaActivate: (token: string, code: string) =>
    request<AuthResponse>('/auth/mfa/activate', { method: 'POST', ...jsonBody({ token, code }) }),
  mfaDisable: (password: string, code: string) =>
    request<void>('/auth/mfa/disable', { method: 'POST', ...jsonBody({ password, code }) }),
  selectOrganization: (input: SelectOrganizationInput) =>
    request<AuthResponse>('/auth/select-organization', { method: 'POST', ...jsonBody(input) }),
  sessions: () => request<AuthSession[]>('/auth/sessions'),
  revokeSession: (id: string) => request<void>(`/auth/sessions/${id}`, { method: 'DELETE' }),
};

export const organizationsApi = {
  list: () => request<OrganizationSummary[]>('/organizations'),
  create: (input: { name: string; countryCode?: string }) =>
    request<OrganizationDetail>('/organizations', { method: 'POST', ...jsonBody(input) }),
};

export const usersApi = {
  me: () => request<unknown>('/users/me'),
  updateProfile: (input: Record<string, unknown>) =>
    request<unknown>('/users/me', { method: 'PATCH', ...jsonBody(input) }),
  exportData: () => request<Record<string, unknown>>('/users/me/export'),
  deleteAccount: () => request<void>('/users/me', { method: 'DELETE' }),
};
