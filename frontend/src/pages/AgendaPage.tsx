import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError, type Birthday, type CalendarEvent, type Equipment, type Group, type Reservation } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '../icons'
import { toLocalIso } from '../lib/datetime'

const START_HOUR = 8
const END_HOUR = 19
const ROW_HEIGHT = 56
const HEADER_HEIGHT = 38
const ALLDAY_HEIGHT = 50
const DAY_LABELS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM']
const RESIZE_HANDLE_PX = 10
const HIDDEN_KEY = 'agenda.hiddenEquipment'

const field = 'w-full rounded-lg px-3 py-2 text-sm outline-none'
const fieldStyle = { background: 'var(--color-surface)', color: 'var(--color-text)' } as const
const labelCls = 'mb-1 block text-xs font-medium'
const labelStyle = { color: 'var(--color-text-muted)' } as const

// Bloco sendo arrastado (mover) ou redimensionado (mudar duração).
// `moved` distingue "só cliquei" (abre o painel de edição) de "arrastei"
// (salva a nova posição/duração) no pointerup.
interface DragState {
  kind: 'r' | 'e'
  id: number
  mode: 'move' | 'resize'
  dayIndex: number
  startFrac: number
  endFrac: number
  equipmentId?: string
  moved: boolean
}

function getMonday(base: Date): Date {
  const d = new Date(base)
  const day = d.getDay()
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
function fracToDate(day: Date, frac: number): Date {
  const hour = START_HOUR + frac
  const d = new Date(day)
  d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0)
  return d
}

// ── Painel de reserva (criar ou editar) ─────────────────────────────────
function ReservationPanel({
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
      <select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)} disabled={readOnly} className={`mb-3 ${field} disabled:opacity-60`} style={fieldStyle}>
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

// ── Painel de evento (criar ou editar) ─────────────────────────────────
function EventPanel({
  initial,
  canEdit,
  groupId,
  onDone,
  onClose,
}: {
  initial?: CalendarEvent
  canEdit: boolean
  groupId?: number | null
  onDone: () => void
  onClose: () => void
}) {
  const editing = !!initial
  const [title, setTitle] = useState(initial?.title ?? '')
  const [location, setLocation] = useState(initial?.location ?? '')
  const [allDay, setAllDay] = useState(initial?.all_day ?? false)
  const [date, setDate] = useState(initial ? toLocalInputDate(new Date(initial.start_at)) : toLocalInputDate(new Date()))
  const [endDate, setEndDate] = useState(initial ? toLocalInputDate(new Date(initial.end_at)) : toLocalInputDate(new Date()))
  const [start, setStart] = useState(initial && !initial.all_day ? new Date(initial.start_at).toTimeString().slice(0, 5) : '14:00')
  const [end, setEnd] = useState(initial && !initial.all_day ? new Date(initial.end_at).toTimeString().slice(0, 5) : '15:00')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const readOnly = editing && !canEdit

  async function save() {
    setError(null)
    if (!title.trim()) {
      setError('Dê um título ao evento.')
      return
    }
    setBusy(true)
    try {
      const body = {
        title,
        location,
        all_day: allDay,
        start_at: allDay ? `${date}T00:00:00` : `${date}T${start}:00`,
        end_at: allDay ? `${endDate}T23:59:59` : `${date}T${end}:00`,
        group_id: editing ? initial!.group_id : groupId ?? null,
      }
      if (editing) await api.updateEvent(initial!.id, body)
      else await api.createEvent(body)
      onDone()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar o evento.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm(`Remover o evento "${initial!.title}"?`)) return
    setBusy(true)
    try {
      await api.deleteEvent(initial!.id)
      onDone()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível remover.')
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}>
      <div className="mb-3 text-sm font-semibold">{editing ? 'Evento' : 'Novo evento'}</div>

      <label className={labelCls} style={labelStyle}>Título</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={readOnly} placeholder="ex.: Reunião geral do NQTR" className={`mb-3 ${field} disabled:opacity-60`} style={fieldStyle} />

      <label className={labelCls} style={labelStyle}>Local (opcional)</label>
      <input value={location} onChange={(e) => setLocation(e.target.value)} disabled={readOnly} placeholder="ex.: Sala 512" className={`mb-3 ${field} disabled:opacity-60`} style={fieldStyle} />

      <label className="mb-3 flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} disabled={readOnly} />
        Dia inteiro
      </label>

      <label className={labelCls} style={labelStyle}>{allDay ? 'De' : 'Data'}</label>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={readOnly} className={`mb-3 ${field} disabled:opacity-60`} style={fieldStyle} />

      {allDay ? (
        <>
          <label className={labelCls} style={labelStyle}>Até</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={readOnly} className={`mb-3 ${field} disabled:opacity-60`} style={fieldStyle} />
        </>
      ) : (
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
      )}

      {editing && <p className="mb-3 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Criado por {initial!.created_by_name}.</p>}
      {error && <p className="mb-3 text-xs" style={{ color: '#d43b3b' }}>{error}</p>}

      {readOnly ? (
        <button onClick={onClose} className="w-full rounded-lg border py-2 text-[13px]" style={{ borderColor: 'var(--color-border)' }}>Fechar</button>
      ) : (
        <div className="flex gap-2">
          <button onClick={save} disabled={busy} className="flex-1 rounded-lg py-2 text-[13px] font-semibold disabled:opacity-50" style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}>
            {editing ? 'Salvar' : 'Criar evento'}
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

type Panel =
  | { kind: 'new-reservation' }
  | { kind: 'new-event' }
  | { kind: 'reservation'; data: Reservation }
  | { kind: 'event'; data: CalendarEvent }
  | null

export function AgendaPage() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [weekOffset, setWeekOffset] = useState(0)
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [birthdays, setBirthdays] = useState<Birthday[]>([])
  const [panel, setPanel] = useState<Panel>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [myGroups, setMyGroups] = useState<Group[]>([])
  const [scope, setScope] = useState<number | null>(null) // null = laboratório
  const [hidden, setHidden] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]'))
    } catch {
      return new Set()
    }
  })
  const gridRef = useRef<HTMLDivElement>(null)

  const monday = useMemo(() => addDays(getMonday(new Date()), weekOffset * 7), [weekOffset])
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday])
  const equipmentById = useMemo(() => new Map(equipment.map((e) => [e.id, e])), [equipment])
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)

  function reload() {
    const start = monday
    const end = addDays(monday, 7)
    Promise.all([
      api.listEquipment(),
      api.listReservations({ start: toLocalIso(start), end: toLocalIso(end) }),
      api.listEvents({ start: toLocalIso(start), end: toLocalIso(end) }),
      api.listBirthdays({ start: toLocalInputDate(start), end: toLocalInputDate(addDays(monday, 6)) }),
    ])
      .then(([eq, res, ev, bd]) => {
        setEquipment(eq)
        setReservations(res)
        setEvents(ev)
        setBirthdays(bd)
      })
      .catch(() => {})
  }
  useEffect(reload, [weekOffset])

  useEffect(() => {
    api.listGroups().then((gs) => setMyGroups(gs.filter((g) => g.is_member))).catch(() => {})
  }, [])

  // Vindo da página Equipamentos ("ir para a agenda"): garante que aquele
  // equipamento esteja visível na legenda, mesmo que a pessoa tivesse
  // ocultado antes.
  useEffect(() => {
    const eq = searchParams.get('eq')
    if (!eq || !hidden.has(eq)) return
    const next = new Set(hidden)
    next.delete(eq)
    setHidden(next)
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]))
    } catch {
      /* ok */
    }
  }, [searchParams])

  // Reservas de equipamento + aniversários são sempre do laboratório; o
  // escopo só filtra quais eventos aparecem e onde um novo evento entra.
  const scopedEvents = events.filter((e) => (scope === null ? e.group_id == null : e.group_id === scope))
  const groupColor = (gid: number | null) => (gid == null ? 'var(--color-primary)' : myGroups.find((g) => g.id === gid)?.color ?? 'var(--color-primary)')
  const canCreateEventHere = scope === null ? !!user?.is_super_admin : !!myGroups.find((g) => g.id === scope)?.can_manage

  function toggleEquipment(id: string) {
    setHidden((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      try {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]))
      } catch {
        /* ok */
      }
      return next
    })
  }

  const canEditReservation = (r: Reservation) => r.user_id === user?.id || !!user?.is_super_admin
  const canEditEvent = (e: CalendarEvent) => e.can_manage

  function birthdaysForDay(day: Date) {
    const key = toLocalInputDate(day)
    return birthdays.filter((b) => b.date === key)
  }
  function allDayEventsForDay(day: Date) {
    const key = toLocalInputDate(day)
    return scopedEvents.filter((e) => e.all_day && e.start_at.slice(0, 10) <= key && e.end_at.slice(0, 10) >= key)
  }
  function timedEventsForDay(day: Date) {
    return scopedEvents.filter((e) => !e.all_day && isSameDay(new Date(e.start_at), day))
  }

  // ── Arrastar / redimensionar ────────────────────────────────────────
  function startDrag(
    e: React.PointerEvent,
    kind: 'r' | 'e',
    id: number,
    dayIndex: number,
    startFrac: number,
    endFrac: number,
    equipmentId?: string,
  ) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const onHandle = e.clientY > rect.bottom - RESIZE_HANDLE_PX
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* ok */
    }
    setDrag({ kind, id, mode: onHandle ? 'resize' : 'move', dayIndex, startFrac, endFrac, equipmentId, moved: false })
  }

  function onDragMove(e: React.PointerEvent) {
    if (!drag) return
    const editable =
      drag.kind === 'r'
        ? canEditReservation(reservations.find((r) => r.id === drag.id)!)
        : canEditEvent(events.find((e) => e.id === drag.id)!)
    if (!editable) return
    const gridEl = gridRef.current
    if (!gridEl) return
    const rect = gridEl.getBoundingClientRect()
    const relY = e.clientY - rect.top - HEADER_HEIGHT - ALLDAY_HEIGHT
    const rawFrac = relY / ROW_HEIGHT
    const snapped = Math.round(rawFrac * 4) / 4 // 15 min

    if (drag.mode === 'resize') {
      const newEnd = Math.min(Math.max(snapped, drag.startFrac + 0.25), hours.length)
      setDrag((d) => (d ? { ...d, endFrac: newEnd, moved: true } : d))
    } else {
      const dayWidth = rect.width / 7
      const newDayIndex = Math.min(6, Math.max(0, Math.floor((e.clientX - rect.left) / dayWidth)))
      const duration = drag.endFrac - drag.startFrac
      const newStart = Math.min(Math.max(snapped, 0), hours.length - duration)
      setDrag((d) => (d ? { ...d, dayIndex: newDayIndex, startFrac: newStart, endFrac: newStart + duration, moved: true } : d))
    }
  }

  async function onDragEnd(e: React.PointerEvent) {
    if (!drag) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ok */
    }
    const d = drag
    setDrag(null)

    if (!d.moved) {
      if (d.kind === 'r') {
        const r = reservations.find((x) => x.id === d.id)
        if (r) setPanel({ kind: 'reservation', data: r })
      } else {
        const ev = events.find((x) => x.id === d.id)
        if (ev) setPanel({ kind: 'event', data: ev })
      }
      return
    }

    const newStart = fracToDate(days[d.dayIndex], d.startFrac)
    const newEnd = fracToDate(days[d.dayIndex], d.endFrac)
    try {
      if (d.kind === 'r') {
        const r = reservations.find((x) => x.id === d.id)!
        await api.moveReservation(d.id, {
          equipment_id: r.equipment_id,
          start_at: toLocalIso(newStart),
          end_at: toLocalIso(newEnd),
        })
      } else {
        const ev = events.find((x) => x.id === d.id)!
        await api.updateEvent(d.id, {
          title: ev.title,
          location: ev.location,
          all_day: false,
          group_id: ev.group_id,
          start_at: toLocalIso(newStart),
          end_at: toLocalIso(newEnd),
        })
      }
      reload()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Não foi possível salvar.')
      reload()
    }
  }

  const rangeLabel = `${days[0].getDate()} – ${days[6].getDate()} de ${days[6].toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex h-[60px] flex-shrink-0 items-center justify-between px-6" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-3.5">
            <button onClick={() => setWeekOffset(0)} className="rounded-lg border px-4 py-1.5 text-[13px] font-semibold" style={{ borderColor: 'var(--color-border)' }}>
              Hoje
            </button>
            <button onClick={() => setWeekOffset((w) => w - 1)} className="flex h-[30px] w-[30px] items-center justify-center rounded-lg" style={{ color: 'var(--color-text-muted)' }}>
              <ChevronLeftIcon />
            </button>
            <button onClick={() => setWeekOffset((w) => w + 1)} className="flex h-[30px] w-[30px] items-center justify-center rounded-lg" style={{ color: 'var(--color-text-muted)' }}>
              <ChevronRightIcon />
            </button>
            <span className="text-base font-semibold capitalize">{rangeLabel}</span>
            {myGroups.length > 0 && (
              <select
                className="rounded-lg px-2.5 py-1.5 text-[13px] outline-none"
                style={{ background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                value={scope ?? ''}
                onChange={(e) => setScope(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">🏛 Laboratório</option>
                {myGroups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canCreateEventHere && (
              <button onClick={() => setPanel({ kind: 'new-event' })} className="flex items-center gap-1.5 rounded-lg border px-4 py-2 text-[13px] font-semibold" style={{ borderColor: 'var(--color-border)' }}>
                <PlusIcon />
                Novo evento
              </button>
            )}
            <button onClick={() => setPanel({ kind: 'new-reservation' })} className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold" style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}>
              <PlusIcon />
              Nova reserva
            </button>
          </div>
        </div>

        {/* Grade */}
        <div className="flex flex-1 overflow-auto">
          <div className="w-14 flex-shrink-0" style={{ paddingTop: HEADER_HEIGHT + ALLDAY_HEIGHT }}>
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
                if (hidden.has(r.equipment_id)) return false
                if (drag && drag.kind === 'r' && drag.id === r.id) return drag.dayIndex === dayIndex
                return isSameDay(new Date(r.start_at), day)
              })
              const dayEvents = timedEventsForDay(day).filter((e) => {
                if (drag && drag.kind === 'e' && drag.id === e.id) return drag.dayIndex === dayIndex
                return true
              })
              return (
                <div
                  key={dayIndex}
                  className="relative"
                  style={{ borderRight: dayIndex < 6 ? '1px solid var(--color-border)' : undefined, background: today ? 'var(--color-surface)' : undefined }}
                >
                  <div className="flex h-[38px] flex-col items-center justify-center" style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <span className="text-[11px]" style={{ color: today ? 'var(--color-primary)' : 'var(--color-text-muted)', fontWeight: today ? 600 : 400 }}>
                      {DAY_LABELS[dayIndex]}
                    </span>
                    <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-[12.5px] font-semibold" style={today ? { background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' } : undefined}>
                      {day.getDate()}
                    </span>
                  </div>

                  {/* Faixa dia-inteiro: aniversários + eventos all-day */}
                  <div className="flex flex-col gap-0.5 overflow-y-auto px-1 py-1" style={{ height: ALLDAY_HEIGHT, borderBottom: '1px solid var(--color-border)' }}>
                    {birthdaysForDay(day).map((b) => (
                      <div key={`b${b.user_id}`} className="truncate rounded px-1.5 py-0.5 text-[10.5px] font-medium" style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }} title={`Aniversário de ${b.name}`}>
                        🎂 {b.name}
                      </div>
                    ))}
                    {allDayEventsForDay(day).map((e) => (
                      <button key={`e${e.id}`} onClick={() => setPanel({ kind: 'event', data: e })} className="truncate rounded px-1.5 py-0.5 text-left text-[10.5px] font-medium" style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }} title={e.title}>
                        {e.title}
                      </button>
                    ))}
                  </div>

                  <div className="relative" style={{ height: ROW_HEIGHT * hours.length }}>
                    {hours.map((h) => (
                      <div key={h} style={{ height: ROW_HEIGHT, borderTop: '1px solid var(--color-border)' }} />
                    ))}

                    {dayEvents.map((e) => {
                      const dragging = drag?.kind === 'e' && drag.id === e.id
                      let sFrac: number, eFrac: number
                      if (dragging && drag) {
                        sFrac = drag.startFrac
                        eFrac = drag.endFrac
                      } else {
                        const s = new Date(e.start_at)
                        const en = new Date(e.end_at)
                        sFrac = s.getHours() + s.getMinutes() / 60 - START_HOUR
                        eFrac = en.getHours() + en.getMinutes() / 60 - START_HOUR
                      }
                      const editable = canEditEvent(e)
                      return (
                        <div
                          key={`ev${e.id}`}
                          onPointerDown={(ev) => editable && startDrag(ev, 'e', e.id, dayIndex, sFrac, eFrac)}
                          onPointerMove={onDragMove}
                          onPointerUp={onDragEnd}
                          onClick={() => !editable && setPanel({ kind: 'event', data: e })}
                          className="absolute left-[3px] right-[3px] overflow-hidden rounded-md px-2 py-1 text-left"
                          style={{
                            top: sFrac * ROW_HEIGHT + 2,
                            height: Math.max((eFrac - sFrac) * ROW_HEIGHT - 4, 20),
                            background: 'var(--color-bg-elevated)',
                            borderLeft: `3px solid ${groupColor(e.group_id)}`,
                            boxShadow: dragging ? '0 4px 14px rgba(0,0,0,0.35)' : 'inset 0 0 0 1px var(--color-border)',
                            cursor: editable ? (dragging ? 'grabbing' : 'grab') : 'pointer',
                            touchAction: 'none',
                            userSelect: 'none',
                            zIndex: dragging ? 10 : undefined,
                          }}
                          title={editable ? 'Arraste para mover · borda de baixo para redimensionar · clique para editar' : e.title}
                        >
                          <div className="truncate text-[11px] font-semibold" style={{ color: 'var(--color-text)' }}>{e.title}</div>
                          <div className="truncate text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{e.location || e.created_by_name}</div>
                          {editable && <div className="absolute inset-x-0 bottom-0" style={{ height: RESIZE_HANDLE_PX, cursor: 'ns-resize' }} />}
                        </div>
                      )
                    })}

                    {dayReservations.map((r) => {
                      const dragging = drag?.kind === 'r' && drag.id === r.id
                      let sFrac: number, eFrac: number
                      if (dragging && drag) {
                        sFrac = drag.startFrac
                        eFrac = drag.endFrac
                      } else {
                        const s = new Date(r.start_at)
                        const en = new Date(r.end_at)
                        sFrac = s.getHours() + s.getMinutes() / 60 - START_HOUR
                        eFrac = en.getHours() + en.getMinutes() / 60 - START_HOUR
                      }
                      const eq = equipmentById.get(r.equipment_id)
                      const editable = canEditReservation(r)
                      return (
                        <div
                          key={r.id}
                          onPointerDown={(ev) => editable && startDrag(ev, 'r', r.id, dayIndex, sFrac, eFrac, r.equipment_id)}
                          onPointerMove={onDragMove}
                          onPointerUp={onDragEnd}
                          onClick={() => !editable && setPanel({ kind: 'reservation', data: r })}
                          className="absolute left-[3px] right-[3px] overflow-hidden rounded-md px-2 py-1.5"
                          style={{
                            top: sFrac * ROW_HEIGHT + 2,
                            height: Math.max((eFrac - sFrac) * ROW_HEIGHT - 4, 22),
                            background: eq?.color ?? 'var(--color-primary)',
                            cursor: editable ? (dragging ? 'grabbing' : 'grab') : 'pointer',
                            touchAction: 'none',
                            userSelect: 'none',
                            boxShadow: dragging ? '0 4px 14px rgba(0,0,0,0.35)' : undefined,
                            zIndex: dragging ? 10 : undefined,
                            opacity: dragging ? 0.9 : 1,
                          }}
                          title={editable ? 'Arraste para mover · borda de baixo para redimensionar · clique para editar' : `${eq?.display_name ?? r.equipment_id} — ${r.user_display_name}`}
                        >
                          <div className="truncate text-[11px] font-semibold text-white">{eq?.display_name ?? r.equipment_id}</div>
                          <div className="truncate text-[10.5px]" style={{ color: 'rgba(255,255,255,0.78)' }}>
                            {r.user_display_name}
                            {r.title ? ` · ${r.title}` : ''}
                          </div>
                          {editable && <div className="absolute inset-x-0 bottom-0" style={{ height: RESIZE_HANDLE_PX, cursor: 'ns-resize' }} />}
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
        {panel?.kind === 'new-reservation' && (
          <ReservationPanel equipment={equipment} canEdit onDone={reload} onClose={() => setPanel(null)} />
        )}
        {panel?.kind === 'reservation' && (
          <ReservationPanel equipment={equipment} initial={panel.data} canEdit={canEditReservation(panel.data)} onDone={reload} onClose={() => setPanel(null)} />
        )}
        {panel?.kind === 'new-event' && <EventPanel canEdit groupId={scope} onDone={reload} onClose={() => setPanel(null)} />}
        {panel?.kind === 'event' && (
          <EventPanel initial={panel.data} canEdit={canEditEvent(panel.data)} onDone={reload} onClose={() => setPanel(null)} />
        )}

        {panel === null && (
          <>
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
                {equipment.map((eq) => {
                  const off = hidden.has(eq.id)
                  return (
                    <button key={eq.id} onClick={() => toggleEquipment(eq.id)} className="flex items-center gap-2.5 text-left" title={off ? 'Mostrar na agenda' : 'Esconder da agenda'}>
                      <span
                        className="h-3.5 w-3.5 flex-shrink-0 rounded"
                        style={off ? { border: `2px solid ${eq.color}`, background: 'transparent' } : { background: eq.color }}
                      />
                      <span className="text-[13px]" style={{ color: off ? 'var(--color-text-muted)' : 'var(--color-text)', textDecoration: off ? 'line-through' : undefined }}>
                        {eq.display_name}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {birthdays.length > 0 && (
              <div>
                <div className="mb-3 text-[12.5px] font-semibold uppercase" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.04em' }}>
                  Aniversários da semana
                </div>
                <div className="flex flex-col gap-2">
                  {birthdays.map((b) => (
                    <div key={b.user_id} className="flex items-center gap-2 text-[13px]">
                      <span>🎂</span>
                      <span className="flex-1 truncate">{b.name}</span>
                      <span style={{ color: 'var(--color-text-muted)' }}>{b.day}/{b.month}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
