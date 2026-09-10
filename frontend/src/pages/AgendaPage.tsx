import { useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError, type Equipment, type Reservation } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '../icons'
import { toLocalIso } from '../lib/datetime'

const START_HOUR = 8
const END_HOUR = 19
const ROW_HEIGHT = 56
const HEADER_HEIGHT = 38
const DAY_LABELS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM']

// Reserva sendo arrastada — posição em edição, ainda não salva. `moved`
// distingue "só cliquei" (vira exclusão, comportamento antigo) de
// "arrastei de verdade" (vira reagendamento) no pointerup.
interface DragState {
  reservationId: number
  equipmentId: string
  dayIndex: number
  startFrac: number
  durationHours: number
  moved: boolean
}

function getMonday(base: Date): Date {
  const d = new Date(base)
  const day = d.getDay() // 0 = domingo
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString()
}

function toLocalInputDate(date: Date): string {
  return toLocalIso(date).slice(0, 10)
}

function NewReservationPanel({
  equipment,
  onCreated,
  onClose,
}: {
  equipment: Equipment[]
  onCreated: () => void
  onClose: () => void
}) {
  const [equipmentId, setEquipmentId] = useState(equipment[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(toLocalInputDate(new Date()))
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('10:00')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit() {
    setError(null)
    if (!equipmentId) {
      setError('Cadastre um equipamento primeiro (Administração).')
      return
    }
    setBusy(true)
    try {
      await api.createReservation({
        equipment_id: equipmentId,
        title,
        start_at: `${date}T${start}:00`,
        end_at: `${date}T${end}:00`,
      })
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar a reserva.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}>
      <div className="mb-3 text-sm font-semibold">Nova reserva</div>

      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Equipamento</label>
      <select
        value={equipmentId}
        onChange={(e) => setEquipmentId(e.target.value)}
        className="mb-3 w-full rounded-lg px-3 py-2 text-sm outline-none"
        style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}
      >
        {equipment.map((eq) => (
          <option key={eq.id} value={eq.id}>
            {eq.display_name}
          </option>
        ))}
      </select>

      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Título (opcional)</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="ex.: Rotina de análise"
        className="mb-3 w-full rounded-lg px-3 py-2 text-sm outline-none"
        style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}
      />

      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Data</label>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="mb-3 w-full rounded-lg px-3 py-2 text-sm outline-none"
        style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}
      />

      <div className="mb-3 flex gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Início</label>
          <input
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Fim</label>
          <input
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}
          />
        </div>
      </div>

      {error && <p className="mb-3 text-xs" style={{ color: '#d43b3b' }}>{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={busy}
          className="flex-1 rounded-lg py-2 text-[13px] font-semibold disabled:opacity-50"
          style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
        >
          Reservar
        </button>
        <button
          onClick={onClose}
          className="rounded-lg border px-3.5 py-2 text-[13px]"
          style={{ borderColor: 'var(--color-border)' }}
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

export function AgendaPage() {
  const { user } = useAuth()
  const [weekOffset, setWeekOffset] = useState(0)
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [showForm, setShowForm] = useState(false)
  const [drag, setDrag] = useState<DragState | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const monday = useMemo(() => addDays(getMonday(new Date()), weekOffset * 7), [weekOffset])
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday])
  const equipmentById = useMemo(() => new Map(equipment.map((e) => [e.id, e])), [equipment])

  function reload() {
    const start = monday
    const end = addDays(monday, 7)
    Promise.all([api.listEquipment(), api.listReservations({ start: toLocalIso(start), end: toLocalIso(end) })])
      .then(([eq, res]) => {
        setEquipment(eq)
        setReservations(res)
      })
      .catch(() => {})
  }

  useEffect(reload, [weekOffset])

  async function handleDelete(reservation: Reservation) {
    if (reservation.user_id !== user?.id && !user?.is_super_admin) return
    if (!confirm(`Cancelar a reserva de ${equipmentById.get(reservation.equipment_id)?.display_name ?? reservation.equipment_id}?`)) return
    await api.deleteReservation(reservation.id)
    reload()
  }

  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
  const rangeLabel = `${days[0].getDate()} – ${days[6].getDate()} de ${days[6].toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`

  function startDrag(e: React.PointerEvent, r: Reservation, dayIndex: number, startFrac: number, durationHours: number) {
    const canMove = r.user_id === user?.id || user?.is_super_admin
    if (!canMove) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ reservationId: r.id, equipmentId: r.equipment_id, dayIndex, startFrac, durationHours, moved: false })
  }

  function onDragMove(e: React.PointerEvent, r: Reservation) {
    if (!drag || drag.reservationId !== r.id) return
    const gridEl = gridRef.current
    if (!gridEl) return
    const rect = gridEl.getBoundingClientRect()
    const dayWidth = rect.width / 7
    const newDayIndex = Math.min(6, Math.max(0, Math.floor((e.clientX - rect.left) / dayWidth)))
    const relY = e.clientY - rect.top - HEADER_HEIGHT
    const rawFrac = relY / ROW_HEIGHT
    const snapped = Math.round(rawFrac * 4) / 4 // passos de 15 min
    const maxStart = hours.length - drag.durationHours
    const clampedFrac = Math.min(Math.max(snapped, 0), Math.max(maxStart, 0))
    setDrag((d) => (d ? { ...d, dayIndex: newDayIndex, startFrac: clampedFrac, moved: true } : d))
  }

  async function onDragEnd(e: React.PointerEvent, r: Reservation) {
    if (!drag || drag.reservationId !== r.id) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    const finished = drag
    setDrag(null)

    if (!finished.moved) {
      handleDelete(r)
      return
    }

    const newStartHour = START_HOUR + finished.startFrac
    const newStart = new Date(days[finished.dayIndex])
    newStart.setHours(Math.floor(newStartHour), Math.round((newStartHour % 1) * 60), 0, 0)
    const newEnd = new Date(newStart.getTime() + finished.durationHours * 3600 * 1000)

    try {
      await api.moveReservation(r.id, {
        equipment_id: r.equipment_id,
        start_at: toLocalIso(newStart),
        end_at: toLocalIso(newEnd),
      })
      reload()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Não foi possível mover a reserva.')
      reload() // desfaz visualmente — a grade volta a refletir o servidor
    }
  }

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex h-[60px] flex-shrink-0 items-center justify-between px-6" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-3.5">
            <button
              onClick={() => setWeekOffset(0)}
              className="rounded-lg border px-4 py-1.5 text-[13px] font-semibold"
              style={{ borderColor: 'var(--color-border)' }}
            >
              Hoje
            </button>
            <button onClick={() => setWeekOffset((w) => w - 1)} className="flex h-[30px] w-[30px] items-center justify-center rounded-lg" style={{ color: 'var(--color-text-muted)' }}>
              <ChevronLeftIcon />
            </button>
            <button onClick={() => setWeekOffset((w) => w + 1)} className="flex h-[30px] w-[30px] items-center justify-center rounded-lg" style={{ color: 'var(--color-text-muted)' }}>
              <ChevronRightIcon />
            </button>
            <span className="text-base font-semibold capitalize">{rangeLabel}</span>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold"
            style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
          >
            <PlusIcon />
            Nova reserva
          </button>
        </div>

        {/* Grade */}
        <div className="flex flex-1 overflow-auto">
          <div className="w-14 flex-shrink-0 pt-[38px]">
            {hours.map((h) => (
              <div key={h} style={{ height: ROW_HEIGHT }} className="-translate-y-1.5 pr-2 text-right text-[11px]">
                <span style={{ color: 'var(--color-text-muted)' }}>{String(h).padStart(2, '0')}:00</span>
              </div>
            ))}
          </div>

          <div ref={gridRef} className="grid flex-1" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
            {days.map((day, dayIndex) => {
              const today = isSameDay(day, new Date())
              const dayReservations = reservations.filter((r) => {
                if (drag && drag.reservationId === r.id) return drag.dayIndex === dayIndex
                return isSameDay(new Date(r.start_at), day)
              })
              return (
                <div
                  key={dayIndex}
                  className="relative"
                  style={{
                    borderRight: dayIndex < 6 ? '1px solid var(--color-border)' : undefined,
                    background: today ? 'var(--color-surface)' : undefined,
                  }}
                >
                  <div
                    className="flex h-[38px] flex-col items-center justify-center"
                    style={{ borderBottom: '1px solid var(--color-border)' }}
                  >
                    <span className="text-[11px]" style={{ color: today ? 'var(--color-primary)' : 'var(--color-text-muted)', fontWeight: today ? 600 : 400 }}>
                      {DAY_LABELS[dayIndex]}
                    </span>
                    <span
                      className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-[12.5px] font-semibold"
                      style={today ? { background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' } : undefined}
                    >
                      {day.getDate()}
                    </span>
                  </div>

                  <div className="relative" style={{ height: ROW_HEIGHT * hours.length }}>
                    {hours.map((h) => (
                      <div key={h} style={{ height: ROW_HEIGHT, borderTop: '1px solid var(--color-border)' }} />
                    ))}

                    {dayReservations.map((r) => {
                      const isDragging = drag?.reservationId === r.id
                      let startFrac: number
                      let endFrac: number
                      if (isDragging && drag) {
                        startFrac = drag.startFrac
                        endFrac = drag.startFrac + drag.durationHours
                      } else {
                        const s = new Date(r.start_at)
                        const e = new Date(r.end_at)
                        startFrac = s.getHours() + s.getMinutes() / 60 - START_HOUR
                        endFrac = e.getHours() + e.getMinutes() / 60 - START_HOUR
                      }
                      const eq = equipmentById.get(r.equipment_id)
                      const canMove = r.user_id === user?.id || user?.is_super_admin
                      return (
                        <div
                          key={r.id}
                          onPointerDown={(e) => startDrag(e, r, dayIndex, startFrac, endFrac - startFrac)}
                          onPointerMove={(e) => onDragMove(e, r)}
                          onPointerUp={(e) => onDragEnd(e, r)}
                          className="absolute left-[3px] right-[3px] overflow-hidden rounded-md px-2 py-1.5"
                          style={{
                            top: startFrac * ROW_HEIGHT + 2,
                            height: Math.max((endFrac - startFrac) * ROW_HEIGHT - 4, 22),
                            background: eq?.color ?? 'var(--color-primary)',
                            cursor: canMove ? (isDragging ? 'grabbing' : 'grab') : 'default',
                            touchAction: 'none',
                            userSelect: 'none',
                            boxShadow: isDragging ? '0 4px 14px rgba(0,0,0,0.35)' : undefined,
                            zIndex: isDragging ? 10 : undefined,
                            opacity: isDragging ? 0.9 : 1,
                          }}
                          title={canMove ? 'Arraste para reagendar, clique para cancelar' : undefined}
                        >
                          <div className="truncate text-[11px] font-semibold text-white">{eq?.display_name ?? r.equipment_id}</div>
                          <div className="truncate text-[10.5px]" style={{ color: 'rgba(255,255,255,0.78)' }}>
                            {r.user_display_name}
                            {r.title ? ` · ${r.title}` : ''}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Sidebar direita */}
      <div className="flex w-[280px] flex-shrink-0 flex-col gap-6 overflow-y-auto p-5" style={{ borderLeft: '1px solid var(--color-border)' }}>
        {showForm ? (
          <NewReservationPanel equipment={equipment} onCreated={reload} onClose={() => setShowForm(false)} />
        ) : (
          <div>
            <div className="mb-3 text-[12.5px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.04em' }}>
              Equipamentos
            </div>
            {equipment.length === 0 && (
              <p className="text-[12.5px]" style={{ color: 'var(--color-text-muted)' }}>
                Nenhum equipamento cadastrado — peça ao administrador para cadastrar em Administração.
              </p>
            )}
            <div className="flex flex-col gap-2.5">
              {equipment.map((eq) => (
                <div key={eq.id} className="flex items-center gap-2.5">
                  <div className="h-3.5 w-3.5 flex-shrink-0 rounded" style={{ background: eq.color }} />
                  <span className="text-[13px]">{eq.display_name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
