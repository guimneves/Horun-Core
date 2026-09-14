import { useEffect, useState } from 'react'
import { api, ApiError, type EquipmentLog } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { timeAgo } from '../lib/datetime'

const field = 'w-full rounded-lg px-3 py-2 text-sm outline-none'
const fieldStyle = { border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }
const labelCls = 'mb-1 block text-xs font-medium'
const labelStyle = { color: 'var(--color-text-muted)' }

// Registro de uso (RUE) de um equipamento — Fase B, manual, ainda não
// sincronizado com o histórico interno de cada módulo. Usado na página
// de detalhe do equipamento.
export function UsageLogSection({ equipmentId }: { equipmentId: string }) {
  const { user } = useAuth()
  const [logs, setLogs] = useState<EquipmentLog[]>([])
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    api.listEquipmentLogs(equipmentId).then(setLogs).catch(() => {})
  }
  useEffect(reload, [equipmentId])

  async function handleAdd() {
    if (!draft.trim()) return
    setBusy(true)
    setError(null)
    try {
      await api.createEquipmentLog(equipmentId, draft.trim())
      setDraft('')
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível registrar.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveEdit(logId: number) {
    if (!editText.trim()) return
    try {
      await api.updateEquipmentLog(equipmentId, logId, editText.trim())
      setEditingId(null)
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar.')
    }
  }

  async function handleDelete(logId: number) {
    if (!confirm('Remover este registro?')) return
    await api.deleteEquipmentLog(equipmentId, logId)
    reload()
  }

  return (
    <div>
      <label className={labelCls} style={labelStyle}>Registro de uso</label>
      <p className="mb-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        Anote aqui o que foi feito — ainda não sincronizado com o histórico interno do módulo.
      </p>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={2}
        placeholder="ex.: rodada de pirólise, amostras 1-10…"
        className={`mb-2 ${field}`}
        style={fieldStyle}
      />
      <button
        onClick={handleAdd}
        disabled={busy || !draft.trim()}
        className="mb-3 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
      >
        Registrar
      </button>
      {error && <p className="mb-2 text-xs" style={{ color: '#d43b3b' }}>{error}</p>}

      <div className="flex flex-col gap-2.5">
        {logs.length === 0 && (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Nenhum registro ainda.</p>
        )}
        {logs.map((log) => {
          const canEdit = log.user_id === user?.id || !!user?.is_super_admin
          return (
            <div key={log.id} className="rounded-lg p-2.5 text-xs" style={{ background: 'var(--color-surface)' }}>
              <div className="mb-1 flex items-center justify-between" style={{ color: 'var(--color-text-muted)' }}>
                <span>
                  <strong>{log.user_display_name}</strong> · {timeAgo(log.occurred_at)}
                </span>
                {canEdit && editingId !== log.id && (
                  <span className="flex gap-2">
                    <button onClick={() => { setEditingId(log.id); setEditText(log.description) }} className="underline">
                      editar
                    </button>
                    <button onClick={() => handleDelete(log.id)} className="underline" style={{ color: '#d43b3b' }}>
                      remover
                    </button>
                  </span>
                )}
              </div>
              {editingId === log.id ? (
                <div>
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={2}
                    className={`mb-1.5 ${field}`}
                    style={fieldStyle}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => handleSaveEdit(log.id)} className="underline" style={{ color: 'var(--color-primary)' }}>
                      salvar
                    </button>
                    <button onClick={() => setEditingId(null)} style={{ color: 'var(--color-text-muted)' }}>
                      cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <p>{log.description}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
