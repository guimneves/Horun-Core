import { useState } from 'react'
import { api, ApiError, LOG_FIELD_KINDS, type LogField, type LogFieldInput, type LogFieldKind } from '../api/client'

const field = 'w-full rounded-lg px-2.5 py-1.5 text-xs outline-none'
const fieldStyle = { border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }
const labelCls = 'mb-1 block text-[11px] font-medium'
const labelStyle = { color: 'var(--color-text-muted)' }

export function kindLabel(kind: LogFieldKind): string {
  return LOG_FIELD_KINDS.find((k) => k.kind === kind)?.label ?? kind
}

interface Draft {
  label: string
  kind: LogFieldKind
  options: string
  unit: string
  help: string
  required: boolean
}

const EMPTY: Draft = { label: '', kind: 'text', options: '', unit: '', help: '', required: false }

function toInput(d: Draft): LogFieldInput {
  return {
    label: d.label.trim(),
    kind: d.kind,
    options: d.kind === 'select' ? d.options.split(/[;\n]/).map((o) => o.trim()).filter(Boolean) : [],
    unit: d.kind === 'number' ? d.unit.trim() : '',
    help: d.help.trim(),
    required: d.required,
  }
}

function FieldForm({ draft, onChange, onSave, onCancel, busy, saveLabel }: {
  draft: Draft
  onChange: (d: Draft) => void
  onSave: () => void
  onCancel: () => void
  busy: boolean
  saveLabel: string
}) {
  return (
    <div className="mb-2 rounded-lg p-3" style={{ background: 'var(--color-surface)' }}>
      <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-3 [&>div]:min-w-0">
        <div>
          <label className={labelCls} style={labelStyle}>Nome da coluna</label>
          <input value={draft.label} onChange={(e) => onChange({ ...draft, label: e.target.value })} placeholder="ex.: Método" className={field} style={fieldStyle} />
        </div>
        <div>
          <label className={labelCls} style={labelStyle}>Tipo de preenchimento</label>
          <select value={draft.kind} onChange={(e) => onChange({ ...draft, kind: e.target.value as LogFieldKind })} className={field} style={fieldStyle}>
            {LOG_FIELD_KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>{k.label}</option>
            ))}
          </select>
        </div>
        {draft.kind === 'number' && (
          <div>
            <label className={labelCls} style={labelStyle}>Unidade (opcional)</label>
            <input value={draft.unit} onChange={(e) => onChange({ ...draft, unit: e.target.value })} placeholder="ex.: mg, °C" className={field} style={fieldStyle} />
          </div>
        )}
      </div>
      {draft.kind === 'select' && (
        <div className="mb-2">
          <label className={labelCls} style={labelStyle}>Opções (separe com ; ou uma por linha)</label>
          <textarea value={draft.options} onChange={(e) => onChange({ ...draft, options: e.target.value })} rows={2} placeholder="Bulk Rock; Reservoir; Pure Organic" className={field} style={fieldStyle} />
        </div>
      )}
      <div className="mb-2">
        <label className={labelCls} style={labelStyle}>Instrução de preenchimento (opcional — aparece no formulário)</label>
        <input value={draft.help} onChange={(e) => onChange({ ...draft, help: e.target.value })} placeholder="ex.: o código do job no software do equipamento" className={field} style={fieldStyle} />
      </div>
      <label className="mb-3 flex items-center gap-2 text-xs">
        <input type="checkbox" checked={draft.required} onChange={(e) => onChange({ ...draft, required: e.target.checked })} />
        obrigatória (não dá para registrar sem preencher)
      </label>
      <div className="flex gap-2">
        <button onClick={onSave} disabled={busy || !draft.label.trim()} className="min-h-10 md:min-h-0 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}>
          {saveLabel}
        </button>
        <button onClick={onCancel} className="min-h-10 md:min-h-0 rounded-lg border px-3 py-1.5 text-xs" style={{ borderColor: 'var(--color-border)' }}>
          cancelar
        </button>
      </div>
    </div>
  )
}

// Colunas próprias da ficha RUE deste equipamento (pedido do usuário,
// 16/10/2026) — só aparece para técnicos, pesquisadores doutores e
// coordenação (`can.manage_log_fields`; o backend confere de novo).
export function LogFieldsManager({ equipmentId, fields, onChanged }: {
  equipmentId: string
  /** todas, inclusive as arquivadas */
  fields: LogField[]
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = fields.filter((f) => f.active)
  const archived = fields.filter((f) => !f.active)

  async function run(fn: () => Promise<unknown>, after?: () => void) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      after?.()
      onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar a coluna.')
    } finally {
      setBusy(false)
    }
  }

  function move(i: number, dir: -1 | 1) {
    const ids = active.map((f) => f.id)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    void run(() => api.reorderLogFields(equipmentId, [...ids, ...archived.map((f) => f.id)]))
  }

  return (
    <div className="mb-3 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--color-border)' }}>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full min-h-10 md:min-h-0 items-center justify-between text-left text-xs font-semibold">
        <span>Colunas próprias deste equipamento ({active.length})</span>
        <span style={{ color: 'var(--color-text-muted)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-2">
          <p className="mb-2 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            Colunas a mais na ficha, com o tipo de preenchimento de cada uma — valem só para este equipamento. Remover arquiva:
            some da ficha, mas o que já foi preenchido fica guardado e volta se reativar.
          </p>
          {error && <p className="mb-2 text-xs" style={{ color: '#d43b3b' }}>{error}</p>}
          {active.length > 0 && (
            <ul className="mb-2 flex flex-col gap-1">
              {active.map((f, i) =>
                editingId === f.id ? (
                  <li key={f.id}>
                    <FieldForm
                      draft={editDraft}
                      onChange={setEditDraft}
                      busy={busy}
                      saveLabel="Salvar coluna"
                      onCancel={() => setEditingId(null)}
                      onSave={() => void run(() => api.updateLogField(equipmentId, f.id, toInput(editDraft)), () => setEditingId(null))}
                    />
                  </li>
                ) : (
                  <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 text-xs" style={{ background: 'var(--color-surface)' }}>
                    <span className="flex gap-1">
                      <button onClick={() => move(i, -1)} disabled={busy || i === 0} className="min-h-8 px-1 disabled:opacity-30" aria-label="subir">↑</button>
                      <button onClick={() => move(i, 1)} disabled={busy || i === active.length - 1} className="min-h-8 px-1 disabled:opacity-30" aria-label="descer">↓</button>
                    </span>
                    <span className="font-semibold">{f.label}{f.required && ' *'}</span>
                    <span style={{ color: 'var(--color-text-muted)' }}>
                      {kindLabel(f.kind)}
                      {f.unit && ` (${f.unit})`}
                      {f.kind === 'select' && `: ${f.options.join(' · ')}`}
                    </span>
                    {f.help && <span className="basis-full text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{f.help}</span>}
                    <span className="ml-auto flex gap-3">
                      <button
                        onClick={() => {
                          setEditingId(f.id)
                          setEditDraft({ label: f.label, kind: f.kind, options: f.options.join('; '), unit: f.unit, help: f.help, required: f.required })
                        }}
                        className="min-h-8 underline"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        editar
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Remover a coluna "${f.label}" da ficha? O que já foi preenchido fica guardado.`))
                            void run(() => api.archiveLogField(equipmentId, f.id))
                        }}
                        className="min-h-8 underline"
                        style={{ color: '#d43b3b' }}
                      >
                        remover
                      </button>
                    </span>
                  </li>
                ),
              )}
            </ul>
          )}
          {adding ? (
            <FieldForm
              draft={draft}
              onChange={setDraft}
              busy={busy}
              saveLabel="Adicionar coluna"
              onCancel={() => setAdding(false)}
              onSave={() => void run(() => api.createLogField(equipmentId, toInput(draft)), () => {
                setDraft(EMPTY)
                setAdding(false)
              })}
            />
          ) : (
            <button onClick={() => setAdding(true)} className="min-h-10 md:min-h-0 text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>
              + nova coluna
            </button>
          )}
          {archived.length > 0 && (
            <div className="mt-2 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              Arquivadas:{' '}
              {archived.map((f) => (
                <button key={f.id} onClick={() => void run(() => api.updateLogField(equipmentId, f.id, { active: true }))} className="mr-2 underline" title="reativar">
                  {f.label} ↺
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
