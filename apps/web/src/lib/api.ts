import type {
  AcceptInviteInput,
  AuthResponse,
  AuthSession,
  ClassificationAnswers,
  ClassificationCatalog,
  ClassificationRun,
  ClassificationRunSummary,
  DocumentApprovalInput,
  DocumentCatalog,
  DocumentDetail,
  DocumentRestoreInput,
  DocumentRevisionDetail,
  DocumentRevisionSummary,
  DocumentSaveInput,
  DocumentVersion,
  DocumentVersionInput,
  CreateBundleExportInput,
  CreateConnectionInput,
  CreateDeviceInput,
  CreateDocumentExportInput,
  CreateNetworkAuditInput,
  CreateSummaryExportInput,
  CreateZoneInput,
  DeviceImportFormat,
  DeviceImportResult,
  DuplicateDeviceGroup,
  ExportJobSummary,
  MergeDevicesInput,
  NetworkAuditSummary,
  NetworkConnection,
  NetworkDevice,
  NetworkMap,
  NetworkZone,
  SaveDeviceAssessmentInput,
  SaveMapLayoutInput,
  UpdateConnectionInput,
  UpdateDeviceInput,
  UpdateNetworkAuditInput,
  UpdateZoneInput,
  LoginInput,
  LoginResponse,
  MfaSetupResponse,
  OrganizationDetail,
  OrganizationLogoUploadInput,
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

async function rawRequestBlob(path: string): Promise<Blob> {
  const headers = new Headers();
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers,
    credentials: 'include',
  });
  if (!response.ok) {
    type ErrorEnvelope = { error?: { code?: string; message?: string; details?: unknown } };
    let body: ErrorEnvelope | null = null;
    try {
      body = (await response.json()) as ErrorEnvelope;
    } catch {
      body = null;
    }
    throw new ApiClientError(
      response.status,
      body?.error?.code ?? `HTTP_${response.status}`,
      body?.error?.message ?? response.statusText,
      body?.error?.details,
    );
  }
  return response.blob();
}

async function requestBlob(path: string): Promise<Blob> {
  try {
    return await rawRequestBlob(path);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) return rawRequestBlob(path);
    }
    throw error;
  }
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
  uploadLogo: (organizationId: string, input: OrganizationLogoUploadInput) =>
    request<OrganizationDetail>(`/organizations/${organizationId}/logo`, {
      method: 'POST',
      ...jsonBody(input),
    }),
  logo: (organizationId: string) => requestBlob(`/organizations/${organizationId}/logo`),
};

export const usersApi = {
  me: () => request<unknown>('/users/me'),
  updateProfile: (input: Record<string, unknown>) =>
    request<unknown>('/users/me', { method: 'PATCH', ...jsonBody(input) }),
  exportData: () => request<Record<string, unknown>>('/users/me/export'),
  deleteAccount: () => request<void>('/users/me', { method: 'DELETE' }),
};

export const classificationApi = {
  catalog: () => request<ClassificationCatalog>('/classification/catalog'),
  current: () => request<ClassificationRun | null>('/classification/current'),
  runs: () => request<ClassificationRunSummary[]>('/classification/runs'),
  run: (runId: string) => request<ClassificationRun>(`/classification/runs/${runId}`),
  create: (input: ClassificationAnswers) =>
    request<ClassificationRun>('/classification/runs', { method: 'POST', ...jsonBody(input) }),
  downloadPdf: (runId: string) => requestBlob(`/classification/runs/${runId}/summary.pdf`),
};

export const documentsApi = {
  catalog: () => request<DocumentCatalog>('/documents'),
  open: (templateKey: string) =>
    request<DocumentDetail>('/documents', { method: 'POST', ...jsonBody({ templateKey }) }),
  detail: (documentId: string) => request<DocumentDetail>(`/documents/${documentId}`),
  save: (documentId: string, input: DocumentSaveInput) =>
    request<DocumentDetail>(`/documents/${documentId}`, { method: 'PATCH', ...jsonBody(input) }),
  lock: (documentId: string) =>
    request<DocumentDetail>(`/documents/${documentId}/lock`, { method: 'POST' }),
  unlock: (documentId: string) =>
    request<DocumentDetail>(`/documents/${documentId}/lock`, { method: 'DELETE' }),
  revisions: (documentId: string) =>
    request<DocumentRevisionSummary[]>(`/documents/${documentId}/revisions`),
  revision: (documentId: string, revisionNo: number) =>
    request<DocumentRevisionDetail>(`/documents/${documentId}/revisions/${revisionNo}`),
  restore: (documentId: string, revisionNo: number, input: DocumentRestoreInput) =>
    request<DocumentDetail>(`/documents/${documentId}/revisions/${revisionNo}/restore`, {
      method: 'POST',
      ...jsonBody(input),
    }),
  versions: (documentId: string) => request<DocumentVersion[]>(`/documents/${documentId}/versions`),
  publish: (documentId: string, input: DocumentVersionInput) =>
    request<DocumentDetail>(`/documents/${documentId}/versions`, {
      method: 'POST',
      ...jsonBody(input),
    }),
  approve: (documentId: string, versionId: string, input: DocumentApprovalInput) =>
    request<DocumentDetail>(`/documents/${documentId}/versions/${versionId}/approve`, {
      method: 'POST',
      ...jsonBody(input),
    }),
};

export const networkApi = {
  list: () => request<NetworkAuditSummary[]>('/audits'),
  create: (input: CreateNetworkAuditInput) =>
    request<NetworkAuditSummary>('/audits', { method: 'POST', ...jsonBody(input) }),
  update: (auditId: string, input: UpdateNetworkAuditInput) =>
    request<NetworkAuditSummary>(`/audits/${auditId}`, {
      method: 'PATCH',
      ...jsonBody(input),
    }),
  map: (auditId: string) => request<NetworkMap>(`/audits/${auditId}`),
  createDevice: (auditId: string, input: CreateDeviceInput) =>
    request<NetworkDevice>(`/audits/${auditId}/devices`, {
      method: 'POST',
      ...jsonBody(input),
    }),
  updateDevice: (auditId: string, deviceId: string, input: UpdateDeviceInput) =>
    request<NetworkDevice>(`/audits/${auditId}/devices/${deviceId}`, {
      method: 'PATCH',
      ...jsonBody(input),
    }),
  deleteDevice: (auditId: string, deviceId: string) =>
    request<void>(`/audits/${auditId}/devices/${deviceId}`, { method: 'DELETE' }),
  saveAssessment: (auditId: string, deviceId: string, input: SaveDeviceAssessmentInput) =>
    request<NetworkDevice>(`/audits/${auditId}/devices/${deviceId}/assessment`, {
      method: 'PUT',
      ...jsonBody(input),
    }),
  importDevices: (auditId: string, format: DeviceImportFormat, content: string) =>
    request<DeviceImportResult>(`/audits/${auditId}/import`, {
      method: 'POST',
      ...jsonBody({ format, content }),
    }),
  importTemplate: () => requestBlob('/audits/import-template.csv'),
  duplicates: (auditId: string) => request<DuplicateDeviceGroup[]>(`/audits/${auditId}/duplicates`),
  merge: (auditId: string, input: MergeDevicesInput) =>
    request<NetworkDevice>(`/audits/${auditId}/merge`, {
      method: 'POST',
      ...jsonBody(input),
    }),
  saveLayout: (auditId: string, input: SaveMapLayoutInput) =>
    request<void>(`/audits/${auditId}/layout`, { method: 'PUT', ...jsonBody(input) }),
  createZone: (auditId: string, input: CreateZoneInput) =>
    request<NetworkZone>(`/audits/${auditId}/zones`, {
      method: 'POST',
      ...jsonBody(input),
    }),
  updateZone: (auditId: string, zoneId: string, input: UpdateZoneInput) =>
    request<NetworkZone>(`/audits/${auditId}/zones/${zoneId}`, {
      method: 'PATCH',
      ...jsonBody(input),
    }),
  deleteZone: (auditId: string, zoneId: string) =>
    request<void>(`/audits/${auditId}/zones/${zoneId}`, { method: 'DELETE' }),
  createConnection: (auditId: string, input: CreateConnectionInput) =>
    request<NetworkConnection>(`/audits/${auditId}/connections`, {
      method: 'POST',
      ...jsonBody(input),
    }),
  updateConnection: (auditId: string, connectionId: string, input: UpdateConnectionInput) =>
    request<NetworkConnection>(`/audits/${auditId}/connections/${connectionId}`, {
      method: 'PATCH',
      ...jsonBody(input),
    }),
  deleteConnection: (auditId: string, connectionId: string) =>
    request<void>(`/audits/${auditId}/connections/${connectionId}`, { method: 'DELETE' }),
};

export const exportsApi = {
  list: () => request<ExportJobSummary[]>('/exports'),
  get: (jobId: string) => request<ExportJobSummary>(`/exports/${jobId}`),
  createDocument: (documentId: string, input: CreateDocumentExportInput) =>
    request<ExportJobSummary>(`/exports/documents/${documentId}`, {
      method: 'POST',
      ...jsonBody(input),
    }),
  createBundle: (input: CreateBundleExportInput) =>
    request<ExportJobSummary>('/exports/all', { method: 'POST', ...jsonBody(input) }),
  createSummary: (input: CreateSummaryExportInput) =>
    request<ExportJobSummary>('/exports/compliance-summary', {
      method: 'POST',
      ...jsonBody(input),
    }),
  download: (jobId: string) => requestBlob(`/exports/${jobId}/download`),
};
