// Cliente HTTP do Horun Core — mesmo padrão do RE7S
// (Rock Eval Horun Dev/frontend/src/api/client.ts).
export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

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
  full_name: string
  email: string
  phone: string
  position: string
  qualification: string
  has_photo: boolean
  is_super_admin: boolean
  is_protected: boolean
  setup_code: string | null
}

// Mesmas listas de app/db/models.py (POSITIONS/QUALIFICATIONS) — a
// validação de verdade é sempre no backend, isto é só pra montar os
// <select> do formulário sem uma chamada de API extra.
export const POSITIONS = ['Pesquisador(a)', 'Coordenador(a)', 'Técnico(a)', 'Iniciação Científica']
export const QUALIFICATIONS = [
  'Professor(a)',
  'Doutor(a)',
  'Doutorando(a)',
  'Mestre(a)',
  'Mestrando(a)',
  'Graduado(a)',
  'Graduando(a)',
  'Técnico(a)',
]

export interface ModuleStatus {
  id: string
  display_name: string
  codename: string
  description: string
  icon: string
  status: 'online' | 'offline'
  has_access: boolean
  embeddable: boolean
}

export interface ModuleFull {
  id: string
  display_name: string
  codename: string
  description: string
  icon: string
  internal_base_url: string
  health_path: string
  internal_frontend_url: string
}

export interface ModuleAccessEntry {
  user_id: number
  username: string
}

export interface PostReply {
  id: number
  post_id: number
  content: string
  created_at: string
  author_id: number
  author_username: string
  author_display_name: string
}

export interface Post {
  id: number
  content: string
  pinned: boolean
  created_at: string
  author_id: number
  author_username: string
  author_display_name: string
  replies: PostReply[]
}

export interface MentionableUser {
  id: number
  username: string
  display_name: string
}

export interface Notification {
  id: number
  kind: 'mention' | 'reply' | string
  text: string
  link: string
  actor_id: number | null
  actor_display_name: string
  read: boolean
  created_at: string
}

export interface Equipment {
  id: string
  display_name: string
  color: string
}

export interface Reservation {
  id: number
  equipment_id: string
  title: string
  start_at: string
  end_at: string
  user_id: number
  user_display_name: string
}

export const api = {
  login: (username: string, password: string) =>
    request<CurrentUser>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => request<CurrentUser>('/auth/me'),
  setPassword: (username: string, setupCode: string, newPassword: string) =>
    request<CurrentUser>('/auth/set-password', {
      method: 'POST',
      body: JSON.stringify({ username, setup_code: setupCode, new_password: newPassword }),
    }),
  updateProfile: (payload: { display_name?: string; full_name?: string; email?: string; phone?: string }) =>
    request<CurrentUser>('/auth/me', { method: 'PATCH', body: JSON.stringify(payload) }),
  uploadMyPhoto: async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${API_BASE}/auth/me/photo`, { method: 'POST', credentials: 'include', body: form })
    if (!res.ok) {
      let message = res.statusText
      try {
        message = (await res.json()).detail ?? message
      } catch {
        // corpo sem JSON — mantém statusText
      }
      throw new ApiError(res.status, message)
    }
    return res.json() as Promise<CurrentUser>
  },
  deleteMyPhoto: () => request<CurrentUser>('/auth/me/photo', { method: 'DELETE' }),

  listUsers: () => request<CurrentUser[]>('/users'),
  createUser: (payload: {
    username: string
    password?: string
    display_name?: string
    full_name?: string
    email?: string
    phone?: string
    position?: string
    qualification?: string
    is_super_admin?: boolean
  }) => request<CurrentUser>('/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateUser: (
    userId: number,
    payload: { display_name?: string; password?: string; is_super_admin?: boolean; position?: string; qualification?: string },
  ) => request<CurrentUser>(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  regenerateSetupCode: (userId: number) =>
    request<CurrentUser>(`/users/${userId}/regenerate-setup-code`, { method: 'POST' }),
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

  listPosts: () => request<Post[]>('/posts'),
  createPost: (content: string) => request<Post>('/posts', { method: 'POST', body: JSON.stringify({ content }) }),
  pinPost: (postId: number, pinned: boolean) =>
    request<Post>(`/posts/${postId}`, { method: 'PATCH', body: JSON.stringify({ pinned }) }),
  deletePost: (postId: number) => request<{ ok: boolean }>(`/posts/${postId}`, { method: 'DELETE' }),

  createReply: (postId: number, content: string) =>
    request<PostReply>(`/posts/${postId}/replies`, { method: 'POST', body: JSON.stringify({ content }) }),
  deleteReply: (postId: number, replyId: number) =>
    request<{ ok: boolean }>(`/posts/${postId}/replies/${replyId}`, { method: 'DELETE' }),

  listMentionableUsers: () => request<MentionableUser[]>('/users/mentionable'),

  listNotifications: () => request<Notification[]>('/notifications'),
  unreadNotificationCount: () => request<{ count: number }>('/notifications/unread-count'),
  markNotificationsRead: () => request<{ ok: boolean }>('/notifications/mark-read', { method: 'POST' }),

  listEquipment: () => request<Equipment[]>('/equipment'),
  createEquipment: (payload: Equipment) =>
    request<Equipment>('/equipment', { method: 'POST', body: JSON.stringify(payload) }),
  deleteEquipment: (equipmentId: string) =>
    request<{ ok: boolean }>(`/equipment/${equipmentId}`, { method: 'DELETE' }),

  listReservations: (range?: { start: string; end: string }) =>
    request<Reservation[]>(`/reservations${range ? `?start=${range.start}&end=${range.end}` : ''}`),
  createReservation: (payload: { equipment_id: string; title?: string; start_at: string; end_at: string }) =>
    request<Reservation>('/reservations', { method: 'POST', body: JSON.stringify(payload) }),
  moveReservation: (reservationId: number, payload: { equipment_id: string; start_at: string; end_at: string }) =>
    request<Reservation>(`/reservations/${reservationId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteReservation: (reservationId: number) =>
    request<{ ok: boolean }>(`/reservations/${reservationId}`, { method: 'DELETE' }),
}
