// Cliente da API comum dos PostRuns (/api/postrun). Atrás do Core o módulo
// é servido em /m/<id>/ e a API em /m/<id>/api; em desenvolvimento o Vite
// repassa /api para o backend (vite.config.ts do módulo).
// NÃO EDITE dentro de um módulo — cópia de Horun Core/postrun-core.

const BASE = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/api/postrun`

export class PostrunApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
  if (!res.ok) {
    let message = res.statusText
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') message = body.detail
      else if (Array.isArray(body.detail)) message = body.detail.map((d: { msg?: string }) => d.msg).join('; ')
    } catch {
      // sem corpo JSON
    }
    throw new PostrunApiError(res.status, message)
  }
  return (await res.json()) as T
}

const post = <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'POST', body: JSON.stringify(body) })

export type RunStatus = 'nova' | 'tratada' | 'validada' | 'publicada'

export interface Param {
  name: string
  label: string
  kind: 'number' | 'choice' | 'bool'
  default: unknown
  unit: string
  choices: string[]
  help: string
}

export interface ResultField {
  name: string
  label: string
  unit: string
  decimals: number
}

export interface Equipment {
  id: string
  name: string
  technique: string
  module_id: string
  params: Param[]
  result_fields: ResultField[]
  postrun_core: string
  source: string
  publisher: string
  outbox_pending: number
  can_validate: boolean
  can_unpublish: boolean
}

export interface ResultValue {
  name: string
  value: number | null
  unit: string
  label: string
  uncertainty: number | null
}

export interface Delivery {
  version: number
  retracted: boolean
  state: 'pendente' | 'enviado'
  answer: string
  attempts: number
  last_error: string
  sent_at: string | null
}

export interface RunSummary {
  id: number
  source_path: string
  run_key: string
  sample_label: string
  sample_code: string
  project_code: string
  acquired_at: string | null
  read_at: string | null
  status: RunStatus
  source_changed: boolean
  validated_by: string
  validated_at: string | null
  published_version: number
  values: ResultValue[]
  delivery: Delivery | null
}

export interface Signal {
  name: string
  x: number[]
  y: number[]
  x_label: string
  y_label: string
  secondary: boolean
}

export interface Treatment {
  id: number
  created_by: string
  created_at: string
  params: Record<string, unknown>
  values: ResultValue[]
  current: boolean
}

export interface RunDetail extends RunSummary {
  signals: Signal[]
  metadata: Record<string, unknown>
  file_values: ResultValue[]
  params: Record<string, unknown>
  treatments: Treatment[]
}

export interface ScanResult {
  listed: number
  new_files: number
  new_runs: number
  errors: { path: string; error: string }[]
  remaining: number
}

export interface FileError {
  id: number
  path: string
  error: string
  read_at: string
  run_count: number
}

export const postrunApi = {
  equipment: () => request<Equipment>('/equipment'),
  scan: () => post<ScanResult>('/scan'),
  runs: (status?: string, q?: string) => {
    const qs = new URLSearchParams()
    if (status) qs.set('status', status)
    if (q) qs.set('q', q)
    return request<RunSummary[]>(`/runs${qs.size ? `?${qs}` : ''}`)
  },
  run: (id: number) => request<RunDetail>(`/runs/${id}`),
  treat: (id: number, params: Record<string, unknown>) => post<RunDetail>(`/runs/${id}/treat`, { params }),
  link: (id: number, sampleCode: string, projectCode: string) =>
    post<RunSummary>(`/runs/${id}/link`, { sample_code: sampleCode, project_code: projectCode }),
  validate: (id: number) => post<RunSummary>(`/runs/${id}/validate`),
  unvalidate: (id: number, reason: string) => post<RunSummary>(`/runs/${id}/unvalidate`, { reason }),
  publish: (id: number) => post<RunSummary>(`/runs/${id}/publish`),
  reread: (id: number) => post<{ run: RunSummary }>(`/runs/${id}/reread`),
  batch: (action: 'tratar' | 'validar' | 'publicar', runIds: number[]) =>
    post<{ done: number[]; failed: { run_id: number; error: string }[] }>('/batch', { action, run_ids: runIds }),
  fileErrors: () => request<FileError[]>('/files'),
  retryFile: (id: number) => post<unknown>(`/files/${id}/retry`),
  retryOutbox: () => post<{ tried: number; sent: number; still_pending: number }>('/outbox/retry'),
}
