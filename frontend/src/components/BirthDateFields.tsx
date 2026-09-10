import { MONTHS_PT } from '../api/client'

export interface BirthValue {
  day: number | null
  month: number | null
  year: number | null
}

const fieldStyle = {
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
}

// Facilitador de data de nascimento: dois <select> (dia + mês por nome) e
// um campo de ano opcional. Mês por nome evita a confusão DD/MM × MM/DD;
// ano num campo à parte deixa "opcional" natural. 29/02 é permitido.
export function BirthDateFields({
  value,
  onChange,
}: {
  value: BirthValue
  onChange: (v: BirthValue) => void
}) {
  const { day, month, year } = value
  const maxDay = month ? new Date(2000, month, 0).getDate() : 31 // 2000 bissexto → fev = 29
  const currentYear = new Date().getFullYear()

  return (
    <div>
      <label className="mb-1 block text-[12.5px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
        Data de nascimento
      </label>
      <div className="flex gap-2">
        <select
          className="w-[70px] rounded-lg px-2 py-2 text-[13px] outline-none"
          style={fieldStyle}
          value={day ?? ''}
          onChange={(e) => onChange({ ...value, day: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">Dia</option>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d} disabled={d > maxDay}>
              {d}
            </option>
          ))}
        </select>
        <select
          className="flex-1 rounded-lg px-2 py-2 text-[13px] capitalize outline-none"
          style={fieldStyle}
          value={month ?? ''}
          onChange={(e) => {
            const m = e.target.value ? Number(e.target.value) : null
            const max = m ? new Date(2000, m, 0).getDate() : 31
            onChange({ ...value, month: m, day: day && day > max ? null : day })
          }}
        >
          <option value="">Mês</option>
          {MONTHS_PT.map((name, i) => (
            <option key={i} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <input
          type="number"
          inputMode="numeric"
          placeholder="Ano"
          className="w-[80px] rounded-lg px-2 py-2 text-[13px] outline-none"
          style={fieldStyle}
          min={1900}
          max={currentYear}
          value={year ?? ''}
          onChange={(e) => onChange({ ...value, year: e.target.value ? Number(e.target.value) : null })}
        />
      </div>
      <p className="mt-1 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
        Dia e mês juntos. O ano é opcional.
      </p>
    </div>
  )
}

/** Traduz o estado do formulário no corpo esperado por `api.updateProfile`.
 * `null` = não mexer no que já está salvo. */
export function birthPayload(v: BirthValue): {
  birth_set?: boolean
  birth_day?: number | null
  birth_month?: number | null
  birth_year?: number | null
} | null {
  if (v.day && v.month) return { birth_set: true, birth_day: v.day, birth_month: v.month, birth_year: v.year }
  if (!v.day && !v.month) return { birth_set: false }
  return null // preenchimento parcial — a página trata (mostra aviso, não salva)
}
