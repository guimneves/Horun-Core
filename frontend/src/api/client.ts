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
  birth_day: number | null
  birth_month: number | null
  birth_year: number | null
  email_notifications: boolean
  has_photo: boolean
  is_super_admin: boolean
  is_protected: boolean
  onboarded: boolean
  setup_code: string | null
}

export const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

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
  description: string
  icon: string
  status: 'online' | 'offline'
  has_access: boolean
  embeddable: boolean
}

export interface ModuleFull {
  id: string
  display_name: string
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
  can_delete: boolean
}

export interface Post {
  id: number
  content: string
  pinned: boolean
  group_id: number | null
  created_at: string
  author_id: number
  author_username: string
  author_display_name: string
  has_attachment: boolean
  attachment_filename: string
  attachment_content_type: string
  can_delete: boolean
  can_pin: boolean
  replies: PostReply[]
}

export interface MentionableUser {
  id: number
  username: string
  display_name: string
}

export interface SearchHit {
  kind: 'post' | 'equipment' | 'module' | 'person' | string
  title: string
  subtitle: string
  link: string
}

export interface DirectoryEntry {
  id: number
  name: string
  position: string
  qualification: string
  email: string
  has_photo: boolean
  phone: string // "" para quem não é administrador máximo
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

export interface CalendarEvent {
  id: number
  title: string
  description: string
  location: string
  start_at: string
  end_at: string
  all_day: boolean
  group_id: number | null
  created_by_id: number
  created_by_name: string
  can_manage: boolean
}

export interface Birthday {
  user_id: number
  name: string
  has_photo: boolean
  date: string // "YYYY-MM-DD" — a ocorrência dentro do intervalo pedido
  day: number
  month: number
}

export interface Group {
  id: number
  name: string
  description: string
  color: string
  internal_admin_id: number
  internal_admin_name: string
  member_count: number
  is_member: boolean
  can_manage: boolean
}

export interface GroupMember {
  user_id: number
  name: string
  has_photo: boolean
  is_internal_admin: boolean
  added_at: string
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
  updateProfile: (payload: {
    display_name?: string
    full_name?: string
    email?: string
    phone?: string
    onboarded?: boolean
    email_notifications?: boolean
    birth_set?: boolean
    birth_day?: number | null
    birth_month?: number | null
    birth_year?: number | null
  }) => request<CurrentUser>('/auth/me', { method: 'PATCH', body: JSON.stringify(payload) }),
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
  usersDirectory: () => request<DirectoryEntry[]>('/users/directory'),
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
    payload: {
      username?: string
      display_name?: string
      password?: string
      is_super_admin?: boolean
      position?: string
      qualification?: string
    },
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

  listPosts: (groupId?: number | null) =>
    request<Post[]>(`/posts${groupId ? `?group_id=${groupId}` : ''}`),
  createPost: async (content: string, file?: File | null, groupId?: number | null) => {
    // multipart — o backend aceita um anexo opcional (imagem ou PDF).
    const form = new FormData()
    form.append('content', content)
    if (file) form.append('file', file)
    if (groupId) form.append('group_id', String(groupId))
    const res = await fetch(`${API_BASE}/posts`, { method: 'POST', credentials: 'include', body: form })
    if (!res.ok) {
      let message = res.statusText
      try {
        message = (await res.json()).detail ?? message
      } catch {
        // corpo sem JSON — mantém statusText
      }
      throw new ApiError(res.status, message)
    }
    return res.json() as Promise<Post>
  },
  pinPost: (postId: number, pinned: boolean) =>
    request<Post>(`/posts/${postId}`, { method: 'PATCH', body: JSON.stringify({ pinned }) }),
  deletePost: (postId: number) => request<{ ok: boolean }>(`/posts/${postId}`, { method: 'DELETE' }),

  createReply: (postId: number, content: string) =>
    request<PostReply>(`/posts/${postId}/replies`, { method: 'POST', body: JSON.stringify({ content }) }),
  deleteReply: (postId: number, replyId: number) =>
    request<{ ok: boolean }>(`/posts/${postId}/replies/${replyId}`, { method: 'DELETE' }),

  listMentionableUsers: () => request<MentionableUser[]>('/users/mentionable'),

  search: (q: string) => request<SearchHit[]>(`/search?q=${encodeURIComponent(q)}`),

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
  moveReservation: (
    reservationId: number,
    payload: { equipment_id: string; start_at: string; end_at: string; title?: string },
  ) => request<Reservation>(`/reservations/${reservationId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteReservation: (reservationId: number) =>
    request<{ ok: boolean }>(`/reservations/${reservationId}`, { method: 'DELETE' }),

  listEvents: (range?: { start: string; end: string }) =>
    request<CalendarEvent[]>(`/events${range ? `?start=${range.start}&end=${range.end}` : ''}`),
  createEvent: (payload: {
    title: string
    description?: string
    location?: string
    start_at: string
    end_at: string
    all_day?: boolean
    group_id?: number | null
  }) => request<CalendarEvent>('/events', { method: 'POST', body: JSON.stringify(payload) }),
  updateEvent: (
    eventId: number,
    payload: {
      title: string
      description?: string
      location?: string
      start_at: string
      end_at: string
      all_day?: boolean
      group_id?: number | null
    },
  ) => request<CalendarEvent>(`/events/${eventId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteEvent: (eventId: number) => request<{ ok: boolean }>(`/events/${eventId}`, { method: 'DELETE' }),

  listBirthdays: (range: { start: string; end: string }) =>
    request<Birthday[]>(`/users/birthdays?start=${range.start}&end=${range.end}`),

  listGroups: () => request<Group[]>('/groups'),
  createGroup: (payload: { name: string; description?: string; color?: string; internal_admin_id: number }) =>
    request<Group>('/groups', { method: 'POST', body: JSON.stringify(payload) }),
  updateGroup: (
    groupId: number,
    payload: { name?: string; description?: string; color?: string; internal_admin_id?: number },
  ) => request<Group>(`/groups/${groupId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteGroup: (groupId: number) => request<{ ok: boolean }>(`/groups/${groupId}`, { method: 'DELETE' }),
  listGroupMembers: (groupId: number) => request<GroupMember[]>(`/groups/${groupId}/members`),
  addGroupMember: (groupId: number, userId: number) =>
    request<{ ok: boolean }>(`/groups/${groupId}/members`, { method: 'POST', body: JSON.stringify({ user_id: userId }) }),
  removeGroupMember: (groupId: number, userId: number) =>
    request<{ ok: boolean }>(`/groups/${groupId}/members/${userId}`, { method: 'DELETE' }),
}
