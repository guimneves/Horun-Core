import { useEffect, useMemo, useState } from 'react'
import { api, type Equipment, type Reservation } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '../icons'
import { toLocalIso } from '../lib/datetime'
import { ReservationPanel } from './ReservationPanel'

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

  const monday = useMemo(() => addDays(getMonday(new Date()), weekOffset * 7), [weekOffset])
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday])
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)

  function reload() {
    const start = monday
    const end = addDays(monday, 7)
    api
      .listReservations({ start: toLocalIso(start), end: toLocalIso(end) })
      .then((all) => setReservations(all.filter((r) => r.equipment_id === equipment.id)))
      .catch(() => {})
  }
  useEffect(reload, [monday, equipment.id])

  const canEdit = (r: Reservation) => r.user_id === user?.id || !!user?.is_super_admin
  const rangeLabel = `${days[0].getDate()} – ${days[6].getDate()} de ${days[6].toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`

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

      {panel && (
        <div className="w-[280px] flex-shrink-0">
          {panel === 'new' ? (
            <ReservationPanel equipment={[equipment]} canEdit onDone={reload} onClose={() => setPanel(null)} />
          ) : (
            <ReservationPanel equipment={[equipment]} initial={panel} canEdit={canEdit(panel)} onDone={reload} onClose={() => setPanel(null)} />
          )}
        </div>
      )}
    </div>
  )
}
