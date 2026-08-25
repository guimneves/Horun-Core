// Cliente HTTP do Horun Core — mesmo padrão do RE7S
// (Rock Eval Horun Dev/frontend/src/api/client.ts).
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!res.ok) {
    let message = res.statusText
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') message = body.detail
    } catch {
      // corpo não é JSON — mantém statusText
    }
    throw new ApiError(res.status, message)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export interface CurrentUser {
  id: number
  username: string
  display_name: string
  is_super_admin: boolean
  is_protected: boolean
}

export interface ModuleStatus {
  id: string
  display_name: string
  codename: string
  description: string
  icon: string
  status: 'online' | 'offline'
  has_access: boolean
}

export interface ModuleFull {
  id: string
  display_name: string
  codename: string
  description: string
  icon: string
  internal_base_url: string
  health_path: string
}

export interface ModuleAccessEntry {
  user_id: number
  username: string
}

export const api = {
  login: (username: string, password: string) =>
    request<CurrentUser>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => request<CurrentUser>('/auth/me'),

  listUsers: () => request<CurrentUser[]>('/users'),
  createUser: (payload: { username: string; password: string; display_name?: string; is_super_admin?: boolean }) =>
    request<CurrentUser>('/users', { method: 'POST', body: JSON.stringify(payload) }),
  deleteUser: (userId: number) => request<{ ok: boolean }>(`/users/${userId}`, { method: 'DELETE' }),

  dashboardModules: () => request<ModuleStatus[]>('/dashboard/modules'),

  listModules: () => request<ModuleFull[]>('/modules'),
  createModule: (payload: Omit<ModuleFull, never>) =>
    request<ModuleFull>('/modules', { method: 'POST', body: JSON.stringify(payload) }),
  deleteModule: (moduleId: string) => request<{ ok: boolean }>(`/modules/${moduleId}`, { method: 'DELETE' }),

  listModuleAccess: (moduleId: string) => request<ModuleAccessEntry[]>(`/modules/${moduleId}/access`),
  grantModuleAccess: (moduleId: string, userId: number) =>
    request<{ ok: boolean }>(`/modules/${moduleId}/access`, { method: 'POST', body: JSON.stringify({ user_id: userId }) }),
  revokeModuleAccess: (moduleId: string, userId: number) =>
    request<{ ok: boolean }>(`/modules/${moduleId}/access/${userId}`, { method: 'DELETE' }),
}
