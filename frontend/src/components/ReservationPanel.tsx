import { useState } from 'react'
import { api, ApiError, type Equipment, type Reservation } from '../api/client'

const field = 'w-full rounded-lg px-3 py-2 text-sm outline-none'
const fieldStyle = { background: 'var(--color-surface)', color: 'var(--color-text)' } as const
const labelCls = 'mb-1 block text-xs font-medium'
const labelStyle = { color: 'var(--color-text-muted)' } as const

function toLocalInputDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Painel de reserva (criar ou editar) — usado pela Agenda (todos os
// equipamentos) e pela página de detalhe de um equipamento (só o dele,
// `equipment` chega com um único item e a seleção fica travada).
export function ReservationPanel({
  equipment,
  initial,
  canEdit,
  onDone,
  onClose,
}: {
  equipment: Equipment[]
  initial?: Reservation
  canEdit: boolean
  onDone: () => void
  onClose: () => void
}) {
  const editing = !!initial
  const [equipmentId, setEquipmentId] = useState(initial?.equipment_id ?? equipment[0]?.id ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [date, setDate] = useState(initial ? toLocalInputDate(new Date(initial.start_at)) : toLocalInputDate(new Date()))
  const [start, setStart] = useState(initial ? new Date(initial.start_at).toTimeString().slice(0, 5) : '09:00')
  const [end, setEnd] = useState(initial ? new Date(initial.end_at).toTimeString().slice(0, 5) : '10:00')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const readOnly = editing && !canEdit

  async function save() {
    setError(null)
    if (!equipmentId) {
      setError('Cadastre um equipamento primeiro (Administração).')
      return
    }
    setBusy(true)
    try {
      const body = { equipment_id: equipmentId, title, start_at: `${date}T${start}:00`, end_at: `${date}T${end}:00` }
      if (editing) await api.moveReservation(initial!.id, body)
      else await api.createReservation(body)
      onDone()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar a reserva.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm('Cancelar esta reserva?')) return
    setBusy(true)
    try {
      await api.deleteReservation(initial!.id)
      onDone()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível cancelar.')
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}>
      <div className="mb-3 text-sm font-semibold">{editing ? 'Reserva' : 'Nova reserva'}</div>

      <label className={labelCls} style={labelStyle}>Equipamento</label>
      <select
        value={equipmentId}
        onChange={(e) => setEquipmentId(e.target.value)}
        disabled={readOnly || equipment.length <= 1}
        className={`mb-3 ${field} disabled:opacity-60`}
        style={fieldStyle}
      >
        {equipment.map((eq) => (
          <option key={eq.id} value={eq.id}>{eq.display_name}</option>
        ))}
      </select>

      <label className={labelCls} style={labelStyle}>Título (opcional)</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={readOnly} placeholder="ex.: Rotina de análise" className={`mb-3 ${field} disabled:opacity-60`} style={fieldStyle} />

      <label className={labelCls} style={labelStyle}>Data</label>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={readOnly} className={`mb-3 ${field} disabled:opacity-60`} style={fieldStyle} />

      <div className="mb-3 flex gap-2">
        <div className="flex-1">
          <label className={labelCls} style={labelStyle}>Início</label>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} disabled={readOnly} className={`${field} disabled:opacity-60`} style={fieldStyle} />
        </div>
        <div className="flex-1">
          <label className={labelCls} style={labelStyle}>Fim</label>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} disabled={readOnly} className={`${field} disabled:opacity-60`} style={fieldStyle} />
        </div>
      </div>

      {editing && <p className="mb-3 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Reservado por {initial!.user_display_name}.</p>}
      {error && <p className="mb-3 text-xs" style={{ color: '#d43b3b' }}>{error}</p>}

      {readOnly ? (
        <button onClick={onClose} className="w-full rounded-lg border py-2 text-[13px]" style={{ borderColor: 'var(--color-border)' }}>Fechar</button>
      ) : (
        <div className="flex gap-2">
          <button onClick={save} disabled={busy} className="flex-1 rounded-lg py-2 text-[13px] font-semibold disabled:opacity-50" style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}>
            {editing ? 'Salvar' : 'Reservar'}
          </button>
          {editing && (
            <button onClick={remove} disabled={busy} className="rounded-lg border px-3.5 py-2 text-[13px]" style={{ borderColor: 'var(--color-border)', color: '#d43b3b' }}>Excluir</button>
          )}
          <button onClick={onClose} className="rounded-lg border px-3.5 py-2 text-[13px]" style={{ borderColor: 'var(--color-border)' }}>Cancelar</button>
        </div>
      )}
    </div>
  )
}
