import { useEffect, useState } from 'react'
import { api, ApiError, USAGE_PURPOSES, type EquipmentLog, type LogField, type LogFieldValue } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { LogFieldsManager } from './LogFieldsManager'

const field = 'w-full rounded-lg px-2.5 py-1.5 text-xs outline-none'
const fieldStyle = { border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }
const labelCls = 'mb-1 block text-[11px] font-medium'
const labelStyle = { color: 'var(--color-text-muted)' }

function purposeLabel(code: string): string {
  return USAGE_PURPOSES.find((p) => p.code === code)?.label ?? code
}

function toLocalInputDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function timeOf(iso: string): string {
  return new Date(iso).toTimeString().slice(0, 5)
}

function dateOf(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR')
}

interface Draft {
  date: string
  start: string
  end: string
  purpose: string
  experimentCode: string
  description: string
  /** colunas próprias do equipamento, pela id da coluna */
  extra: Record<string, LogFieldValue>
}

function emptyDraft(): Draft {
  return { date: toLocalInputDate(new Date()), start: new Date().toTimeString().slice(0, 5), end: '', purpose: 'AN', experimentCode: '', description: '', extra: {} }
}

/** valor de uma coluna própria para mostrar na tabela */
function showValue(f: LogField, v: LogFieldValue | undefined): string {
  if (v === undefined || v === null || v === '') return '—'
  if (f.kind === 'checkbox') return v ? 'sim' : 'não'
  if (f.kind === 'date' && typeof v === 'string') return new Date(`${v}T00:00:00`).toLocaleDateString('pt-BR')
  if (f.kind === 'number') return `${String(v).replace('.', ',')}${f.unit ? ` ${f.unit}` : ''}`
  return String(v)
}

function ExtraInput({ f, value, onChange }: { f: LogField; value: LogFieldValue | undefined; onChange: (v: LogFieldValue) => void }) {
  const str = value === undefined || value === null ? '' : String(value)
  switch (f.kind) {
    case 'checkbox':
      return (
        <label className="flex min-h-9 items-center gap-2 text-xs">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          sim
        </label>
      )
    case 'select':
      return (
        <select value={str} onChange={(e) => onChange(e.target.value)} className={field} style={fieldStyle}>
          <option value="">—</option>
          {f.options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      )
    case 'longtext':
      return <textarea value={str} onChange={(e) => onChange(e.target.value)} rows={2} className={field} style={fieldStyle} />
    case 'number':
      return <input inputMode="decimal" value={str.replace('.', ',')} onChange={(e) => onChange(e.target.value)} className={field} style={fieldStyle} />
    case 'date':
      return <input type="date" value={str} onChange={(e) => onChange(e.target.value)} className={field} style={fieldStyle} />
    case 'time':
      return <input type="time" value={str} onChange={(e) => onChange(e.target.value)} className={field} style={fieldStyle} />
    default:
      return <input value={str} onChange={(e) => onChange(e.target.value)} className={field} style={fieldStyle} />
  }
}

function EntryForm({
  draft,
  onChange,
  onSave,
  onCancel,
  busy,
  fields,
}: {
  draft: Draft
  onChange: (d: Draft) => void
  onSave: () => void
  onCancel?: () => void
  busy: boolean
  fields: LogField[]
}) {
  return (
    <div className="mb-3 rounded-lg p-3" style={{ background: 'var(--color-surface)' }}>
      <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4 [&>div]:min-w-0">
        <div>
          <label className={labelCls} style={labelStyle}>Data</label>
          <input type="date" value={draft.date} onChange={(e) => onChange({ ...draft, date: e.target.value })} className={field} style={fieldStyle} />
        </div>
        <div>
          <label className={labelCls} style={labelStyle}>Hora início</label>
          <input type="time" value={draft.start} onChange={(e) => onChange({ ...draft, start: e.target.value })} className={field} style={fieldStyle} />
        </div>
        <div>
          <label className={labelCls} style={labelStyle}>Hora fim</label>
          <input type="time" value={draft.end} onChange={(e) => onChange({ ...draft, end: e.target.value })} className={field} style={fieldStyle} />
        </div>
        <div>
          <label className={labelCls} style={labelStyle}>Objetivo do uso</label>
          <select value={draft.purpose} onChange={(e) => onChange({ ...draft, purpose: e.target.value })} className={field} style={fieldStyle}>
            {USAGE_PURPOSES.map((p) => (
              <option key={p.code} value={p.code}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="mb-2">
        <label className={labelCls} style={labelStyle}>Código do experimento (opcional)</label>
        <input value={draft.experimentCode} onChange={(e) => onChange({ ...draft, experimentCode: e.target.value })} placeholder="ex.: EXP-042" className={field} style={fieldStyle} />
      </div>
      {fields.length > 0 && (
        <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2 [&>div]:min-w-0">
          {fields.map((f) => (
            <div key={f.id} className={f.kind === 'longtext' ? 'sm:col-span-2' : undefined}>
              <label className={labelCls} style={labelStyle}>
                {f.label}
                {f.unit && ` (${f.unit})`}
                {f.required ? ' *' : ' (opcional)'}
              </label>
              <ExtraInput f={f} value={draft.extra[String(f.id)]} onChange={(v) => onChange({ ...draft, extra: { ...draft.extra, [String(f.id)]: v } })} />
              {f.help && <p className="mt-0.5 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{f.help}</p>}
            </div>
          ))}
        </div>
      )}
      <div className="mb-3">
        <label className={labelCls} style={labelStyle}>Observação (opcional)</label>
        <textarea value={draft.description} onChange={(e) => onChange({ ...draft, description: e.target.value })} rows={2} className={field} style={fieldStyle} />
      </div>
      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={busy}
          className="min-h-10 md:min-h-0 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
        >
          Registrar
        </button>
        {onCancel && (
          <button onClick={onCancel} className="min-h-10 md:min-h-0 rounded-lg border px-3 py-1.5 text-xs" style={{ borderColor: 'var(--color-border)' }}>
            cancelar
          </button>
        )}
      </div>
    </div>
  )
}

// Ficha de utilização do equipamento (RUE) — mesmo formato da ficha de
// papel do laboratório (data, objetivo do uso, hora início/fim, código
// do experimento, usuário, observação, conferência). Ainda não
// sincronizada com o histórico interno de cada módulo.
export function UsageLogSection({ equipmentId }: { equipmentId: string }) {
  const { user } = useAuth()
  const [logs, setLogs] = useState<EquipmentLog[]>([])
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // colunas próprias do equipamento (todas — as arquivadas só para o gerenciador)
  const [allFields, setAllFields] = useState<LogField[]>([])
  const fields = allFields.filter((f) => f.active)
  const canManageFields = !!user?.can.manage_log_fields

  function reloadFields() {
    api
      .listLogFields(equipmentId, canManageFields)
      .then(setAllFields)
      .catch(() => setAllFields([]))
  }
  useEffect(reloadFields, [equipmentId, canManageFields])

  function reload() {
    api
      .listEquipmentLogs(equipmentId)
      .then((l) => {
        setLoadError(null)
        setLogs(l)
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Não foi possível carregar a ficha.'))
  }
  useEffect(reload, [equipmentId])

  function toPayload(d: Draft) {
    return {
      purpose: d.purpose,
      experiment_code: d.experimentCode.trim(),
      description: d.description.trim(),
      occurred_at: `${d.date}T${d.start || '00:00'}:00`,
      ended_at: d.end ? `${d.date}T${d.end}:00` : null,
      // vazio vai como null (apaga); o backend confere tipo e obrigatórias
      extra: Object.fromEntries(
        fields.map((f) => {
          const v = d.extra[String(f.id)]
          return [String(f.id), v === undefined || v === '' ? null : v]
        }),
      ),
    }
  }

  async function handleAdd() {
    setBusy(true)
    setError(null)
    try {
      await api.createEquipmentLog(equipmentId, toPayload(draft))
      setDraft(emptyDraft())
      setAdding(false)
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível registrar.')
    } finally {
      setBusy(false)
    }
  }

  function startEdit(log: EquipmentLog) {
    setEditingId(log.id)
    setEditDraft({
      date: toLocalInputDate(new Date(log.occurred_at)),
      start: timeOf(log.occurred_at),
      end: log.ended_at ? timeOf(log.ended_at) : '',
      purpose: log.purpose,
      experimentCode: log.experiment_code,
      description: log.description,
      extra: { ...(log.extra ?? {}) },
    })
  }

  async function handleSaveEdit() {
    if (editingId === null) return
    setBusy(true)
    setError(null)
    try {
      const payload = toPayload(editDraft)
      await api.updateEquipmentLog(equipmentId, editingId, { ...payload, clear_ended_at: !editDraft.end })
      setEditingId(null)
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(logId: number) {
    if (!confirm('Remover este registro?')) return
    setError(null)
    try {
      await api.deleteEquipmentLog(equipmentId, logId)
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível remover.')
    }
  }

  async function handleVerify(logId: number) {
    setError(null)
    try {
      await api.verifyEquipmentLog(equipmentId, logId)
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível conferir.')
    }
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className={labelCls} style={{ ...labelStyle, marginBottom: 0 }}>Ficha de utilização (RUE)</label>
        {!adding && (
          <button onClick={() => setAdding(true)} className="min-h-10 md:min-h-0 text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>
            + novo registro
          </button>
        )}
      </div>
      <p className="mb-2 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
        Mesmo formato da ficha de papel do laboratório — ainda não sincronizada com o histórico interno do módulo.
      </p>

      {canManageFields && <LogFieldsManager equipmentId={equipmentId} fields={allFields} onChanged={reloadFields} />}

      {adding && <EntryForm draft={draft} onChange={setDraft} onSave={handleAdd} onCancel={() => setAdding(false)} busy={busy} fields={fields} />}
      {error && <p className="mb-2 text-xs" style={{ color: '#d43b3b' }}>{error}</p>}

      {loadError ? (
        <p className="text-xs" style={{ color: '#d43b3b' }}>{loadError}</p>
      ) : logs.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Nenhum registro ainda.</p>
      ) : (
        <>
        {/* Celular: um registro = um cartão (a tabela de 9 colunas fica para o desktop). */}
        <div className="flex flex-col gap-2 md:hidden">
          {logs.map((log) => {
            const canEdit = log.user_id === user?.id || !!user?.can.moderate
            if (editingId === log.id) {
              return <EntryForm key={log.id} draft={editDraft} onChange={setEditDraft} onSave={handleSaveEdit} onCancel={() => setEditingId(null)} busy={busy} fields={fields} />
            }
            return (
              <div key={log.id} className="rounded-lg border px-3 py-2.5 text-[13px]" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">
                    {dateOf(log.occurred_at)} · {timeOf(log.occurred_at)}–{log.ended_at ? timeOf(log.ended_at) : '…'}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{purposeLabel(log.purpose)}</span>
                </div>
                <div className="mt-0.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {log.user_display_name}
                  {log.experiment_code ? ` · ${log.experiment_code}` : ''}
                </div>
                {fields.some((f) => log.extra?.[String(f.id)] !== undefined) && (
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
                    {fields
                      .filter((f) => log.extra?.[String(f.id)] !== undefined)
                      .map((f) => (
                        <span key={f.id}>
                          <span style={{ color: 'var(--color-text-muted)' }}>{f.label}:</span> {showValue(f, log.extra[String(f.id)])}
                        </span>
                      ))}
                  </div>
                )}
                {log.description && <p className="mt-1 break-words text-[13px]">{log.description}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-x-4 text-xs">
                  {log.verified_by_name ? (
                    <span style={{ color: 'var(--color-text-muted)' }}>✓ conferido por {log.verified_by_name}</span>
                  ) : user?.can.moderate ? (
                    <button onClick={() => handleVerify(log.id)} className="min-h-10 underline" style={{ color: 'var(--color-primary)' }}>
                      conferir
                    </button>
                  ) : null}
                  {canEdit && (
                    <>
                      <button onClick={() => startEdit(log)} className="min-h-10 underline" style={{ color: 'var(--color-text-muted)' }}>
                        editar
                      </button>
                      <button onClick={() => handleDelete(log.id)} className="min-h-10 underline" style={{ color: '#d43b3b' }}>
                        remover
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-xs" style={{ minWidth: 640 + fields.length * 100 }}>
            <thead>
              <tr style={{ color: 'var(--color-text-muted)' }}>
                <th className="py-1 pr-3 font-medium">Data</th>
                <th className="py-1 pr-3 font-medium">Objetivo</th>
                <th className="py-1 pr-3 font-medium">Início</th>
                <th className="py-1 pr-3 font-medium">Fim</th>
                <th className="py-1 pr-3 font-medium">Código</th>
                <th className="py-1 pr-3 font-medium">Usuário</th>
                {fields.map((f) => (
                  <th key={f.id} className="py-1 pr-3 font-medium" title={f.help || undefined}>
                    {f.label}
                    {f.unit && <span className="font-normal"> ({f.unit})</span>}
                  </th>
                ))}
                <th className="py-1 pr-3 font-medium">Observação</th>
                <th className="py-1 pr-3 font-medium">Conferência</th>
                <th className="py-1 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const canEdit = log.user_id === user?.id || !!user?.can.moderate
                if (editingId === log.id) {
                  return (
                    <tr key={log.id}>
                      <td colSpan={9 + fields.length} className="py-2">
                        <EntryForm draft={editDraft} onChange={setEditDraft} onSave={handleSaveEdit} onCancel={() => setEditingId(null)} busy={busy} fields={fields} />
                      </td>
                    </tr>
                  )
                }
                return (
                  <tr key={log.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{dateOf(log.occurred_at)}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap" title={purposeLabel(log.purpose)}>{log.purpose}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{timeOf(log.occurred_at)}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{log.ended_at ? timeOf(log.ended_at) : '—'}</td>
                    <td className="py-1.5 pr-3">{log.experiment_code || '—'}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{log.user_display_name}</td>
                    {fields.map((f) => (
                      <td key={f.id} className="py-1.5 pr-3">
                        {showValue({ ...f, unit: '' }, log.extra?.[String(f.id)])}
                      </td>
                    ))}
                    <td className="py-1.5 pr-3">{log.description || '—'}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {log.verified_by_name ? (
                        <span style={{ color: 'var(--color-text-muted)' }}>✓ {log.verified_by_name}</span>
                      ) : user?.can.moderate ? (
                        <button onClick={() => handleVerify(log.id)} className="underline" style={{ color: 'var(--color-primary)' }}>
                          conferir
                        </button>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                      )}
                    </td>
                    <td className="py-1.5 whitespace-nowrap">
                      {canEdit && (
                        <span className="flex gap-2">
                          <button onClick={() => startEdit(log)} className="underline" style={{ color: 'var(--color-text-muted)' }}>
                            editar
                          </button>
                          <button onClick={() => handleDelete(log.id)} className="underline" style={{ color: '#d43b3b' }}>
                            remover
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  )
}
