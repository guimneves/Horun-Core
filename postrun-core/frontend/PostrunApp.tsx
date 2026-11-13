// Tela comum de todo PostRun: corridas que saíram do equipamento, gráfico,
// tratamento, vínculo com a amostra, validação e publicação no Resultados
// (Prompt_Horun_PostRun.md). O que é próprio do equipamento entra pelas
// props `marks` (linhas no gráfico) e `detailExtras` (painel extra).
// NÃO EDITE dentro de um módulo — cópia de Horun Core/postrun-core.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  PostrunApiError,
  postrunApi,
  type Equipment,
  type FileError,
  type Param,
  type RunDetail,
  type RunStatus,
  type RunSummary,
} from './api'
import { SignalPlot, fmt, signalColor } from './SignalPlot'

const STATUS_LABEL: Record<RunStatus, string> = {
  nova: 'nova',
  tratada: 'tratada',
  validada: 'validada',
  publicada: 'publicada',
}
const STATUS_COLOR: Record<RunStatus, string> = {
  nova: '#7a8299',
  tratada: '#2a78d6',
  validada: '#1baf7a',
  publicada: '#7b61c9',
}
const btn =
  'rounded-lg border px-3 py-1.5 text-sm border-[var(--color-border)] hover:bg-[var(--color-surface)] disabled:opacity-40'
const btnPrimary =
  'rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--color-primary-contrast)] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-40'
const input =
  'rounded-lg border px-2 py-1.5 text-sm border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)]'
const card = 'rounded-2xl border p-4 border-[var(--color-border)] bg-[var(--color-bg-elevated)]'

function errorText(err: unknown, fallback: string) {
  return err instanceof PostrunApiError ? err.message : fallback
}

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

function StatusChip({ status }: { status: RunStatus }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ color: STATUS_COLOR[status], backgroundColor: `${STATUS_COLOR[status]}22` }}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

export interface PostrunAppProps {
  /** linhas verticais no gráfico a partir dos parâmetros (ex.: janela de integração) */
  marks?: (params: Record<string, unknown>) => { x: number; label: string }[]
  /** painel extra do equipamento, abaixo dos resultados */
  detailExtras?: (run: RunDetail) => ReactNode
}

export function PostrunApp({ marks, detailExtras }: PostrunAppProps) {
  const [equipment, setEquipment] = useState<Equipment | null>(null)
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [filter, setFilter] = useState<RunStatus | ''>('')
  const [query, setQuery] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [selected, setSelected] = useState<number | null>(() => {
    const id = Number(new URLSearchParams(window.location.search).get('run'))
    return Number.isFinite(id) && id > 0 ? id : null
  })
  const [detail, setDetail] = useState<RunDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const [fileErrors, setFileErrors] = useState<FileError[]>([])

  const reload = useCallback(async () => {
    const [eq, list, errs] = await Promise.all([postrunApi.equipment(), postrunApi.runs(), postrunApi.fileErrors()])
    setEquipment(eq)
    setRuns(list)
    setFileErrors(errs)
  }, [])

  useEffect(() => {
    reload().catch((err) => setMessage({ text: errorText(err, 'Não foi possível carregar o PostRun.'), error: true }))
  }, [reload])

  useEffect(() => {
    if (selected === null) {
      setDetail(null)
      return
    }
    postrunApi
      .run(selected)
      .then(setDetail)
      .catch((err) => setMessage({ text: errorText(err, 'Não foi possível abrir a corrida.'), error: true }))
  }, [selected])

  async function act(label: string, fn: () => Promise<unknown>, success?: (r: unknown) => string) {
    setBusy(true)
    setMessage(null)
    try {
      const r = await fn()
      if (success) setMessage({ text: success(r) })
      await reload()
      if (selected !== null) setDetail(await postrunApi.run(selected))
    } catch (err) {
      setMessage({ text: errorText(err, `Falha ao ${label}.`), error: true })
    } finally {
      setBusy(false)
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { '': runs.length }
    for (const r of runs) c[r.status] = (c[r.status] ?? 0) + 1
    return c
  }, [runs])
  const visible = runs.filter((r) => {
    if (filter && r.status !== filter) return false
    const q = query.trim().toLowerCase()
    return !q || [r.sample_label, r.sample_code, r.source_path].some((v) => v.toLowerCase().includes(q))
  })
  const checkedIds = visible.filter((r) => checked.has(r.id)).map((r) => r.id)

  function toggle(id: number) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function batch(action: 'tratar' | 'validar' | 'publicar') {
    void act(action, () => postrunApi.batch(action, checkedIds), (r) => {
      const res = r as { done: number[]; failed: { run_id: number; error: string }[] }
      return `${action}: ${res.done.length} ok` + (res.failed.length ? ` · ${res.failed.length} não (${res.failed[0].error})` : '')
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={`${card} flex flex-wrap items-center gap-3`}>
        <div className="flex flex-col">
          <span className="text-lg font-semibold">PostRun · {equipment?.name ?? '…'}</span>
          <span className="text-xs text-[var(--color-text-muted)]">
            arquivos: {equipment?.source ?? '…'} · envio: {equipment?.publisher ?? '…'}
          </span>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {equipment && equipment.outbox_pending > 0 && (
            <button type="button" className={btn} disabled={busy} onClick={() => void act('reenviar', postrunApi.retryOutbox, (r) => {
              const res = r as { sent: number; still_pending: number }
              return `Reenvio: ${res.sent} entregue(s), ${res.still_pending} ainda pendente(s).`
            })}>
              Reenviar pendentes ({equipment.outbox_pending})
            </button>
          )}
          <button type="button" className={btnPrimary} disabled={busy} onClick={() => void act('buscar arquivos', postrunApi.scan, (r) => {
            const res = r as { new_runs: number; errors: unknown[]; remaining: number }
            return `${res.new_runs} corrida(s) nova(s)` + (res.errors.length ? ` · ${res.errors.length} arquivo(s) com erro` : '') +
              (res.remaining ? ` · faltam ${res.remaining} arquivo(s) — busque de novo` : '')
          })}>
            Buscar arquivos novos
          </button>
        </div>
      </div>

      {message && (
        <p className="text-sm" style={{ color: message.error ? '#d4373a' : 'var(--color-text-muted)' }}>
          {message.text}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(300px,380px)_1fr]">
        <aside className={`${card} flex flex-col gap-3`}>
          <div className="flex flex-wrap gap-1 text-xs">
            {(['', 'nova', 'tratada', 'validada', 'publicada'] as const).map((s) => (
              <button
                key={s || 'todas'}
                type="button"
                onClick={() => setFilter(s)}
                className="rounded-full border px-2 py-0.5"
                style={
                  filter === s
                    ? { backgroundColor: 'var(--color-primary)', color: 'var(--color-primary-contrast)', borderColor: 'var(--color-primary)' }
                    : { borderColor: 'var(--color-border)' }
                }
              >
                {s || 'todas'} ({counts[s] ?? 0})
              </button>
            ))}
          </div>
          <input className={input} placeholder="buscar amostra ou arquivo…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={visible.length > 0 && checkedIds.length === visible.length}
                onChange={(e) => setChecked(e.target.checked ? new Set(visible.map((r) => r.id)) : new Set())}
              />
              marcar todas
            </label>
            <span className="text-[var(--color-text-muted)]">{checkedIds.length} marcada(s)</span>
          </div>
          {checkedIds.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <button type="button" className={btn} disabled={busy} onClick={() => batch('tratar')}>Tratar</button>
              {equipment?.can_validate && (
                <>
                  <button type="button" className={btn} disabled={busy} onClick={() => batch('validar')}>Validar</button>
                  <button type="button" className={btn} disabled={busy} onClick={() => batch('publicar')}>Publicar</button>
                </>
              )}
            </div>
          )}
          <ul className="flex max-h-[65vh] flex-col overflow-y-auto">
            {visible.map((r) => (
              <li
                key={r.id}
                className="flex items-start gap-2 border-t py-2 text-sm border-[var(--color-border)]"
                style={selected === r.id ? { backgroundColor: 'var(--color-surface)' } : undefined}
              >
                <input type="checkbox" className="mt-1" checked={checked.has(r.id)} onChange={() => toggle(r.id)} />
                <button type="button" className="flex min-w-0 flex-1 flex-col items-start text-left" onClick={() => setSelected(r.id)}>
                  <span className="flex w-full items-center gap-2">
                    <span className="truncate font-medium">{r.sample_label || '(sem rótulo)'}</span>
                    <span className="ml-auto"><StatusChip status={r.status} /></span>
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {when(r.acquired_at)}
                    {r.sample_code && ` · amostra ${r.sample_code}`}
                    {r.delivery?.state === 'pendente' && ' · envio pendente'}
                    {r.source_changed && ' · arquivo mudou'}
                  </span>
                </button>
              </li>
            ))}
            {visible.length === 0 && (
              <li className="py-4 text-sm text-[var(--color-text-muted)]">
                Nenhuma corrida{runs.length === 0 ? ' — toque em "Buscar arquivos novos".' : ' com esse filtro.'}
              </li>
            )}
          </ul>
          {fileErrors.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-[var(--color-text-muted)]">{fileErrors.length} arquivo(s) que não deu para ler</summary>
              <ul className="mt-1 flex flex-col gap-1">
                {fileErrors.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-mono">{f.path}</span>
                    <span className="text-[#d4373a]">{f.error}</span>
                    <button type="button" className="text-[var(--color-primary)] hover:underline" onClick={() => void act('reler', () => postrunApi.retryFile(f.id))}>
                      tentar de novo
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </aside>

        <section className="flex min-w-0 flex-col gap-4">
          {detail ? (
            <RunPanel
              key={detail.id}
              run={detail}
              equipment={equipment}
              busy={busy}
              act={act}
              marks={marks}
              extras={detailExtras?.(detail)}
            />
          ) : (
            <div className={`${card} text-sm text-[var(--color-text-muted)]`}>Escolha uma corrida à esquerda.</div>
          )}
        </section>
      </div>
    </div>
  )
}

function ParamInput({ param, value, onChange, disabled }: { param: Param; value: unknown; onChange: (v: unknown) => void; disabled: boolean }) {
  if (param.kind === 'bool')
    return <input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
  if (param.kind === 'choice')
    return (
      <select className={input} value={String(value ?? '')} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {param.choices.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    )
  return (
    <input
      className={`${input} w-28`}
      type="number"
      step="any"
      disabled={disabled}
      value={value === null || value === undefined ? '' : String(value)}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    />
  )
}

function RunPanel({
  run,
  equipment,
  busy,
  act,
  marks,
  extras,
}: {
  run: RunDetail
  equipment: Equipment | null
  busy: boolean
  act: (label: string, fn: () => Promise<unknown>, success?: (r: unknown) => string) => Promise<void>
  marks?: PostrunAppProps['marks']
  extras?: ReactNode
}) {
  const [params, setParams] = useState<Record<string, unknown>>(run.params)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [sampleCode, setSampleCode] = useState(run.sample_code)
  const [projectCode, setProjectCode] = useState(run.project_code)
  // o servidor pode mudar o vínculo (sugestão ao tratar) e os parâmetros:
  // os campos acompanham a corrida recarregada
  useEffect(() => {
    setSampleCode(run.sample_code)
    setProjectCode(run.project_code)
  }, [run.sample_code, run.project_code])
  useEffect(() => {
    setParams(run.params)
  }, [run.params])
  const locked = run.status === 'validada' || run.status === 'publicada'
  const fields = equipment?.result_fields ?? []
  const valueOf = (name: string) => run.values.find((v) => v.name === name)
  const otherValues = run.values.filter((v) => !fields.some((f) => f.name === v.name))

  return (
    <>
      <div className={`${card} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold">{run.sample_label || '(sem rótulo)'}</span>
          <StatusChip status={run.status} />
          <span className="text-xs text-[var(--color-text-muted)]">
            {when(run.acquired_at)} · <span className="font-mono">{run.source_path}{run.run_key && ` #${run.run_key}`}</span>
          </span>
          <button type="button" className="ml-auto text-xs text-[var(--color-primary)] hover:underline" disabled={busy}
            onClick={() => void act('reler o arquivo', () => postrunApi.reread(run.id), () => 'Arquivo lido de novo.')}>
            reler arquivo
          </button>
        </div>
        {run.source_changed && (
          <p className="rounded-lg border p-2 text-xs border-[#d9a400] text-[var(--color-text)]">
            O arquivo mudou depois da validação. A validação e a publicação continuam sendo da leitura anterior —
            desvalide e trate de novo para usar os dados novos.
          </p>
        )}
        <div className="flex flex-wrap gap-3 text-xs">
          {run.signals.map((s) => (
            <label key={s.name} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={!hidden.has(s.name)}
                onChange={() =>
                  setHidden((prev) => {
                    const next = new Set(prev)
                    if (next.has(s.name)) next.delete(s.name)
                    else next.add(s.name)
                    return next
                  })
                }
              />
              <span className="inline-block h-1.5 w-4 rounded" style={{ backgroundColor: signalColor(run.signals, s.name) }} />
              {s.name}
              {s.secondary && <span className="text-[var(--color-text-muted)]">(eixo direito)</span>}
            </label>
          ))}
        </div>
        <SignalPlot signals={run.signals} hidden={hidden} marks={marks?.(params) ?? []} />
      </div>

      <div className={`${card} flex flex-col gap-3`}>
        <div className="font-semibold">Tratamento</div>
        {(equipment?.params ?? []).length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">Este equipamento não tem parâmetros — os valores vêm do arquivo.</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {equipment!.params.map((p) => (
              <label key={p.name} className="flex flex-col gap-1 text-xs text-[var(--color-text-muted)]" title={p.help}>
                {p.label}{p.unit && ` (${p.unit})`}
                <ParamInput param={p} value={params[p.name]} disabled={locked} onChange={(v) => setParams((prev) => ({ ...prev, [p.name]: v }))} />
              </label>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} disabled={busy || locked}
            onClick={() => void act('tratar', () => postrunApi.treat(run.id, params), () => 'Tratamento salvo.')}>
            Tratar
          </button>
          {locked && <span className="self-center text-xs text-[var(--color-text-muted)]">Validada — desvalide para tratar de novo.</span>}
        </div>

        {run.values.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-muted)]">
                <th className="py-1">Resultado</th>
                <th className="py-1 text-right">Valor</th>
                <th className="py-1 pl-2">Unidade</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => {
                const v = valueOf(f.name)
                return v ? (
                  <tr key={f.name} className="border-t border-[var(--color-border)]">
                    <td className="py-1">{f.label}</td>
                    <td className="py-1 text-right tabular-nums font-medium">{fmt(v.value, f.decimals)}{v.uncertainty !== null && ` ± ${fmt(v.uncertainty, f.decimals)}`}</td>
                    <td className="py-1 pl-2 text-[var(--color-text-muted)]">{f.unit}</td>
                  </tr>
                ) : null
              })}
              {otherValues.map((v) => (
                <tr key={v.name} className="border-t border-[var(--color-border)]">
                  <td className="py-1">{v.label || v.name}</td>
                  <td className="py-1 text-right tabular-nums font-medium">{fmt(v.value)}</td>
                  <td className="py-1 pl-2 text-[var(--color-text-muted)]">{v.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {extras}

      <div className={`${card} flex flex-col gap-3`}>
        <div className="font-semibold">Amostra e validação</div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-[var(--color-text-muted)]">
            Código da amostra
            <input className={input} value={sampleCode} disabled={locked} onChange={(e) => setSampleCode(e.target.value)} placeholder={run.sample_label} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--color-text-muted)]">
            Projeto (opcional)
            <input className={input} value={projectCode} disabled={locked} onChange={(e) => setProjectCode(e.target.value)} />
          </label>
          <button type="button" className={btn}
            disabled={busy || locked || !sampleCode.trim() || (sampleCode === run.sample_code && projectCode === run.project_code)}
            onClick={() => void act('vincular', () => postrunApi.link(run.id, sampleCode, projectCode), () => 'Amostra vinculada.')}>
            Salvar vínculo
          </button>
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">
          No arquivo: <span className="font-mono">{run.sample_label || '—'}</span>. O código é o da amostra no laboratório.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {run.status === 'tratada' && equipment?.can_validate && (
            <button type="button" className={btnPrimary} disabled={busy}
              onClick={() => void act('validar', () => postrunApi.validate(run.id), () => 'Corrida validada.')}>
              Validar
            </button>
          )}
          {run.status === 'validada' && equipment?.can_validate && (
            <button type="button" className={btnPrimary} disabled={busy}
              onClick={() => void act('publicar', () => postrunApi.publish(run.id), () => 'Publicada no Resultados.')}>
              Publicar no Resultados
            </button>
          )}
          {locked && equipment?.can_validate && (run.status !== 'publicada' || equipment.can_unpublish) && (
            <button type="button" className={btn} disabled={busy}
              onClick={() => {
                const reason = run.status === 'publicada' ? window.prompt('Motivo (vai para o Resultados junto com a retirada):') : ''
                if (reason === null) return
                void act('desvalidar', () => postrunApi.unvalidate(run.id, reason), () =>
                  run.status === 'publicada' ? 'Desvalidada — o resultado foi retirado do Resultados.' : 'Desvalidada.')
              }}>
              Desvalidar
            </button>
          )}
          {run.validated_by && (
            <span className="text-xs text-[var(--color-text-muted)]">validada por {run.validated_by} em {when(run.validated_at)}</span>
          )}
        </div>
        {run.delivery && (
          <p className="text-xs" style={{ color: run.delivery.state === 'pendente' ? '#d4373a' : 'var(--color-text-muted)' }}>
            Resultados: {run.delivery.retracted ? 'retirada' : `versão ${run.delivery.version}`} —{' '}
            {run.delivery.state === 'enviado'
              ? `entregue em ${when(run.delivery.sent_at)}${run.delivery.answer === 'ignored' ? ' (já estava lá)' : ''}`
              : `pendente (${run.delivery.attempts} tentativa(s)${run.delivery.last_error ? `: ${run.delivery.last_error}` : ''}) — tenta de novo sozinho`}
          </p>
        )}
      </div>

      <details className={card}>
        <summary className="cursor-pointer text-sm font-semibold">Dados do arquivo e histórico</summary>
        <div className="mt-2 grid gap-4 text-xs md:grid-cols-2">
          <div>
            <div className="mb-1 font-medium">Metadados</div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              {Object.entries(run.metadata).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-[var(--color-text-muted)]">{k}</dt>
                  <dd className="font-mono">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <div className="mb-1 font-medium">Tratamentos ({run.treatments.length})</div>
            <ul className="flex flex-col gap-1">
              {run.treatments.map((t) => (
                <li key={t.id} className={t.current ? 'font-medium' : 'text-[var(--color-text-muted)]'}>
                  {when(t.created_at)} · {t.created_by} · {Object.entries(t.params).map(([k, v]) => `${k}=${v}`).join(', ')}
                  {t.current && ' (atual)'}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </details>
    </>
  )
}
