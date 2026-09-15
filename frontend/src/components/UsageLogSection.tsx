import { useEffect, useState } from 'react'
import { api, ApiError, USAGE_PURPOSES, type EquipmentLog } from '../api/client'
import { useAuth } from '../auth/AuthContext'

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
}

function emptyDraft(): Draft {
  return { date: toLocalInputDate(new Date()), start: new Date().toTimeString().slice(0, 5), end: '', purpose: 'AN', experimentCode: '', description: '' }
}

function EntryForm({
  draft,
  onChange,
  onSave,
  onCancel,
  busy,
}: {
  draft: Draft
  onChange: (d: Draft) => void
  onSave: () => void
  onCancel?: () => void
  busy: boolean
}) {
  return (
    <div className="mb-3 rounded-lg p-3" style={{ background: 'var(--color-surface)' }}>
      <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
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
      <div className="mb-3">
        <label className={labelCls} style={labelStyle}>Observação (opcional)</label>
        <textarea value={draft.description} onChange={(e) => onChange({ ...draft, description: e.target.value })} rows={2} className={field} style={fieldStyle} />
      </div>
      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={busy}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
        >
          Registrar
        </button>
        {onCancel && (
          <button onClick={onCancel} className="rounded-lg border px-3 py-1.5 text-xs" style={{ borderColor: 'var(--color-border)' }}>
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

  function reload() {
    api.listEquipmentLogs(equipmentId).then(setLogs).catch(() => {})
  }
  useEffect(reload, [equipmentId])

  function toPayload(d: Draft) {
    return {
      purpose: d.purpose,
      experiment_code: d.experimentCode.trim(),
      description: d.description.trim(),
      occurred_at: `${d.date}T${d.start || '00:00'}:00`,
      ended_at: d.end ? `${d.date}T${d.end}:00` : null,
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
    await api.deleteEquipmentLog(equipmentId, logId)
    reload()
  }

  async function handleVerify(logId: number) {
    await api.verifyEquipmentLog(equipmentId, logId)
    reload()
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className={labelCls} style={{ ...labelStyle, marginBottom: 0 }}>Ficha de utilização (RUE)</label>
        {!adding && (
          <button onClick={() => setAdding(true)} className="text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>
            + novo registro
          </button>
        )}
      </div>
      <p className="mb-2 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
        Mesmo formato da ficha de papel do laboratório — ainda não sincronizada com o histórico interno do módulo.
      </p>

      {adding && <EntryForm draft={draft} onChange={setDraft} onSave={handleAdd} onCancel={() => setAdding(false)} busy={busy} />}
      {error && <p className="mb-2 text-xs" style={{ color: '#d43b3b' }}>{error}</p>}

      {logs.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Nenhum registro ainda.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" style={{ minWidth: 640 }}>
            <thead>
              <tr style={{ color: 'var(--color-text-muted)' }}>
                <th className="py-1 pr-3 font-medium">Data</th>
                <th className="py-1 pr-3 font-medium">Objetivo</th>
                <th className="py-1 pr-3 font-medium">Início</th>
                <th className="py-1 pr-3 font-medium">Fim</th>
                <th className="py-1 pr-3 font-medium">Código</th>
                <th className="py-1 pr-3 font-medium">Usuário</th>
                <th className="py-1 pr-3 font-medium">Observação</th>
                <th className="py-1 pr-3 font-medium">Conferência</th>
                <th className="py-1 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const canEdit = log.user_id === user?.id || !!user?.is_super_admin
                if (editingId === log.id) {
                  return (
                    <tr key={log.id}>
                      <td colSpan={9} className="py-2">
                        <EntryForm draft={editDraft} onChange={setEditDraft} onSave={handleSaveEdit} onCancel={() => setEditingId(null)} busy={busy} />
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
                    <td className="py-1.5 pr-3">{log.description || '—'}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {log.verified_by_name ? (
                        <span style={{ color: 'var(--color-text-muted)' }}>✓ {log.verified_by_name}</span>
                      ) : user?.is_super_admin ? (
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
      )}
    </div>
  )
}
