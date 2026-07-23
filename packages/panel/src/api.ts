export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, details?: unknown) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function req<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network_error');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new ApiError(res.status, json?.error ?? 'error', json?.details);
  return json as T;
}

export interface SetupStatus {
  setupRequired: boolean;
  passwordRequired: boolean;
}
export interface Project {
  id: string;
  name: string;
  createdAt: string;
  newCount: number;
  totalCount: number;
}
export interface Feedback {
  id: string;
  content: string;
  status: 'new' | 'read' | 'archived';
  appVersion: string | null;
  platform: string | null;
  osVersion: string | null;
  deviceModel: string | null;
  userRef: string | null;
  createdAt: string;
}
export interface ApiKey {
  id: string;
  label: string;
  keyPrefix: string;
  createdAt: string;
  revokedAt: string | null;
}
export interface CreatedKey {
  id: string;
  label: string;
  keyPrefix: string;
  key: string;
}
export interface SetupResult {
  project: { id: string; name: string; createdAt: string } | null;
  apiKey: CreatedKey | null;
}

export const api = {
  setupStatus: () => req<SetupStatus>('GET', '/admin/setup/status'),
  setup: (token: string, body: { password?: string; project: { name: string; keyLabel: string } | null }) =>
    req<SetupResult>('POST', '/admin/setup', body, { 'X-Setup-Token': token }),
  login: (password: string) => req<void>('POST', '/admin/login', { password }),
  logout: () => req<void>('POST', '/admin/logout'),
  me: () => req<void>('GET', '/admin/me'),

  listProjects: () => req<Project[]>('GET', '/admin/projects'),
  createProject: (name: string) =>
    req<{ id: string; name: string; createdAt: string }>('POST', '/admin/projects', { name }),
  renameProject: (id: string, name: string) =>
    req<{ id: string; name: string; createdAt: string }>('PATCH', `/admin/projects/${id}`, { name }),
  deleteProject: (id: string) => req<void>('DELETE', `/admin/projects/${id}`),

  listFeedbacks: (id: string, opts: { status: 'active' | 'archived'; limit?: number; offset?: number }) => {
    const q = new URLSearchParams({ status: opts.status });
    if (opts.limit != null) q.set('limit', String(opts.limit));
    if (opts.offset != null) q.set('offset', String(opts.offset));
    return req<{ items: Feedback[]; total: number }>('GET', `/admin/projects/${id}/feedbacks?${q}`);
  },
  patchFeedback: (id: string, status: 'read' | 'archived') =>
    req<Feedback>('PATCH', `/admin/feedbacks/${id}`, { status }),
  markAllRead: (id: string) =>
    req<{ updated: number }>('POST', `/admin/projects/${id}/feedbacks/mark-all-read`),
  deleteFeedback: (id: string) => req<void>('DELETE', `/admin/feedbacks/${id}`),

  listKeys: (id: string) => req<ApiKey[]>('GET', `/admin/projects/${id}/keys`),
  createKey: (id: string, label: string) =>
    req<CreatedKey>('POST', `/admin/projects/${id}/keys`, { label }),
  revokeKey: (id: string) => req<void>('POST', `/admin/keys/${id}/revoke`),
};
