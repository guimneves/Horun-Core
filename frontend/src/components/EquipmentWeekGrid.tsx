import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiError, type Equipment, type Reservation } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '../icons'
import { toLocalIso } from '../lib/datetime'
import { ReservationPanel } from './ReservationPanel'
import { BottomSheet } from './BottomSheet'
import { DayNav } from './DayNav'
import { useIsMobile } from '../lib/useIsMobile'

const START_HOUR = 8
const END_HOUR = 19
const ROW_HEIGHT = 44
const HEADER_HEIGHT = 34
const DAY_LABELS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM']

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

// Mini-agenda semanal de UM equipamento — mesma linguagem visual da
// Agenda principal, mas sem arrastar/redimensionar (isso continua
// exclusivo de /agenda); aqui é só ver a semana e clicar para
// reservar/editar. Usada na página de detalhe do equipamento.
export function EquipmentWeekGrid({ equipment }: { equipment: Equipment }) {
  const { user } = useAuth()
  const [weekOffset, setWeekOffset] = useState(0)
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [panel, setPanel] = useState<'new' | Reservation | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const isMobile = useIsMobile()
  // Celular: um dia por vez (a semana carregada acompanha o dia escolhido).
  const [selectedDay, setSelectedDay] = useState<Date>(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })
  const closePanel = useCallback(() => setPanel(null), [])

  const monday = useMemo(() => addDays(getMonday(new Date()), weekOffset * 7), [weekOffset])
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday])
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)

  function reload() {
    const start = monday
    const end = addDays(monday, 7)
    api
      .listReservations({ start: toLocalIso(start), end: toLocalIso(end) })
      .then((all) => {
        setLoadError(null)
        setReservations(all.filter((r) => r.equipment_id === equipment.id))
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Não foi possível carregar as reservas.'))
  }
  useEffect(reload, [monday, equipment.id])

  const canEdit = (r: Reservation) => r.user_id === user?.id || !!user?.can.moderate
  const rangeLabel = `${days[0].getDate()} – ${days[6].getDate()} de ${days[6].toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`

  function goToDay(d: Date) {
    const day = new Date(d)
    day.setHours(0, 0, 0, 0)
    setSelectedDay(day)
    setWeekOffset(Math.round((getMonday(day).getTime() - getMonday(new Date()).getTime()) / (7 * 24 * 3600 * 1000)))
  }

  function renderPanel(bare: boolean) {
    if (panel === 'new')
      return (
        <ReservationPanel
          equipment={[equipment]}
          canEdit
          onDone={reload}
          onClose={closePanel}
          initialDate={isMobile ? toLocalIso(selectedDay).slice(0, 10) : undefined}
          bare={bare}
        />
      )
    if (panel) return <ReservationPanel equipment={[equipment]} initial={panel} canEdit={canEdit(panel)} onDone={reload} onClose={closePanel} bare={bare} />
    return null
  }

  // ── Celular: lista das reservas do dia em vez da grade da semana ──
  if (isMobile) {
    const fmt = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const dayReservations = reservations
      .filter((r) => isSameDay(new Date(r.start_at), selectedDay))
      .sort((a, b) => a.start_at.localeCompare(b.start_at))
    return (
      <div className="flex flex-col gap-3">
        <DayNav day={selectedDay} weekDays={days} onChange={goToDay} />
        <button
          onClick={() => setPanel('new')}
          className="flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold"
          style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
        >
          <PlusIcon width={12} height={12} />
          Reservar
        </button>
        {loadError && <p className="text-xs" style={{ color: '#d43b3b' }}>{loadError}</p>}
        <div className="flex flex-col gap-2">
          {dayReservations.map((r) => (
            <button
              key={r.id}
              onClick={() => setPanel(r)}
              className="flex items-stretch gap-3 rounded-xl border px-3 py-2.5 text-left"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}
            >
              <div className="w-[52px] flex-shrink-0 text-[12.5px] font-semibold tabular-nums">
                {fmt(r.start_at)}
                <div className="font-normal" style={{ color: 'var(--color-text-muted)' }}>{fmt(r.end_at)}</div>
              </div>
              <div className="w-[3px] flex-shrink-0 rounded" style={{ background: equipment.color }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold">{r.title || 'Reserva'}</div>
                <div className="truncate text-[12.5px]" style={{ color: 'var(--color-text-muted)' }}>{r.user_display_name}</div>
              </div>
            </button>
          ))}
          {dayReservations.length === 0 && !loadError && (
            <p className="rounded-xl border border-dashed px-3 py-6 text-center text-[13px]" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
              Nenhuma reserva neste dia.
            </p>
          )}
        </div>
        {panel && (
          <BottomSheet label="Reserva" onClose={closePanel}>
            {renderPanel(true)}
          </BottomSheet>
        )}
      </div>
    )
  }

  return (
    <div className="flex gap-5">
      <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex h-12 flex-shrink-0 items-center justify-between px-4" style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-elevated)' }}>
          <div className="flex items-center gap-2.5">
            <button onClick={() => setWeekOffset(0)} className="rounded-lg border px-3 py-1 text-xs font-semibold" style={{ borderColor: 'var(--color-border)' }}>
              Hoje
            </button>
            <button onClick={() => setWeekOffset((w) => w - 1)} className="flex h-6 w-6 items-center justify-center rounded-lg" style={{ color: 'var(--color-text-muted)' }}>
              <ChevronLeftIcon width={14} height={14} />
            </button>
            <button onClick={() => setWeekOffset((w) => w + 1)} className="flex h-6 w-6 items-center justify-center rounded-lg" style={{ color: 'var(--color-text-muted)' }}>
              <ChevronRightIcon width={14} height={14} />
            </button>
            <span className="text-[13px] font-semibold capitalize">{rangeLabel}</span>
          </div>
          <button
            onClick={() => setPanel('new')}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold"
            style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
          >
            <PlusIcon width={11} height={11} />
            Reservar
          </button>
        </div>

        {loadError && (
          <p className="px-4 py-2 text-xs" style={{ color: '#d43b3b', borderBottom: '1px solid var(--color-border)' }}>
            {loadError}
          </p>
        )}

        <div className="flex overflow-x-auto">
          <div className="w-11 flex-shrink-0" style={{ paddingTop: HEADER_HEIGHT }}>
            {hours.map((h) => (
              <div key={h} style={{ height: ROW_HEIGHT }} className="-translate-y-1.5 pr-1.5 text-right text-[10px]">
                <span style={{ color: 'var(--color-text-muted)' }}>{String(h).padStart(2, '0')}h</span>
              </div>
            ))}
          </div>

          <div className="grid flex-1" style={{ gridTemplateColumns: 'repeat(7, minmax(64px, 1fr))' }}>
            {days.map((day, dayIndex) => {
              const today = isSameDay(day, new Date())
              const dayReservations = reservations.filter((r) => isSameDay(new Date(r.start_at), day))
              return (
                <div
                  key={dayIndex}
                  className="relative"
                  style={{ borderRight: dayIndex < 6 ? '1px solid var(--color-border)' : undefined, background: today ? 'var(--color-surface)' : undefined }}
                >
                  <div className="flex flex-col items-center justify-center" style={{ height: HEADER_HEIGHT, borderBottom: '1px solid var(--color-border)' }}>
                    <span className="text-[10px]" style={{ color: today ? 'var(--color-primary)' : 'var(--color-text-muted)', fontWeight: today ? 600 : 400 }}>
                      {DAY_LABELS[dayIndex]} {day.getDate()}
                    </span>
                  </div>

                  <div className="relative" style={{ height: ROW_HEIGHT * hours.length }}>
                    {hours.map((h) => (
                      <div key={h} style={{ height: ROW_HEIGHT, borderTop: '1px solid var(--color-border)' }} />
                    ))}

                    {dayReservations.map((r) => {
                      const s = new Date(r.start_at)
                      const en = new Date(r.end_at)
                      const sFrac = s.getHours() + s.getMinutes() / 60 - START_HOUR
                      const eFrac = en.getHours() + en.getMinutes() / 60 - START_HOUR
                      return (
                        <button
                          key={r.id}
                          onClick={() => setPanel(r)}
                          className="absolute left-[2px] right-[2px] overflow-hidden rounded-md px-1.5 py-1 text-left"
                          style={{
                            top: sFrac * ROW_HEIGHT + 1,
                            height: Math.max((eFrac - sFrac) * ROW_HEIGHT - 2, 18),
                            background: equipment.color,
                            color: '#fff',
                          }}
                          title={r.title || 'Reserva'}
                        >
                          <div className="truncate text-[10px] font-semibold leading-tight">{r.title || 'Reserva'}</div>
                          <div className="truncate text-[9px] leading-tight opacity-80">{r.user_display_name}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {panel && <div className="w-[280px] flex-shrink-0">{renderPanel(false)}</div>}
    </div>
  )
}
