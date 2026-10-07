import { ChevronLeftIcon, ChevronRightIcon } from '../icons'
import { toLocalIso } from '../lib/datetime'

const DAY_LABELS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM']

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString()
}

// Navegação "um dia por vez" da Agenda no celular: Hoje, dia anterior /
// seguinte, seletor de data e a faixa com os 7 dias da semana do dia
// escolhido (toque num dia para ir até ele).
export function DayNav({ day, weekDays, onChange }: { day: Date; weekDays: Date[]; onChange: (d: Date) => void }) {
  const today = new Date()
  const shift = (n: number) => {
    const d = new Date(day)
    d.setDate(d.getDate() + n)
    onChange(d)
  }
  const label = day.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onChange(new Date())}
          className="min-h-10 rounded-lg border px-3 text-[13px] font-semibold"
          style={{ borderColor: 'var(--color-border)' }}
        >
          Hoje
        </button>
        <button onClick={() => shift(-1)} aria-label="Dia anterior" className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg" style={{ color: 'var(--color-text-muted)' }}>
          <ChevronLeftIcon width={20} height={20} />
        </button>
        <input
          type="date"
          aria-label="Escolher data"
          value={toLocalIso(day).slice(0, 10)}
          onChange={(e) => {
            if (!e.target.value) return
            const [y, m, d] = e.target.value.split('-').map(Number)
            onChange(new Date(y, m - 1, d))
          }}
          className="h-10 min-w-0 flex-1 rounded-lg px-2 text-center font-semibold outline-none"
          style={{ background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
        />
        <button onClick={() => shift(1)} aria-label="Dia seguinte" className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg" style={{ color: 'var(--color-text-muted)' }}>
          <ChevronRightIcon width={20} height={20} />
        </button>
      </div>
      <div className="text-center text-[13px] font-medium capitalize" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((d, i) => {
          const selected = isSameDay(d, day)
          const isToday = isSameDay(d, today)
          return (
            <button
              key={i}
              onClick={() => onChange(d)}
              aria-pressed={selected}
              aria-label={d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
              className="flex min-h-12 flex-col items-center justify-center rounded-lg"
              style={{
                background: selected ? 'var(--color-primary)' : isToday ? 'var(--color-surface)' : 'transparent',
                color: selected ? 'var(--color-primary-contrast)' : 'var(--color-text)',
              }}
            >
              <span className="text-[10px]" style={{ opacity: selected ? 0.85 : 0.7 }}>{DAY_LABELS[i]}</span>
              <span className="text-[14px] font-semibold">{d.getDate()}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
