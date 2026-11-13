// Gráfico das curvas de uma corrida (SVG feito à mão, sem biblioteca).
// Curvas `secondary` (ex.: rampa de temperatura) usam o eixo da direita.
// Lições do PostRun do RE7S: o nome sob o mouse aparece DENTRO do gráfico
// (texto fora mudava a altura da página e fazia piscar) e o hover só
// atualiza quando muda.
// NÃO EDITE dentro de um módulo — cópia de Horun Core/postrun-core.

import { useMemo, useRef, useState, type PointerEvent } from 'react'
import type { Signal } from './api'

const WIDTH = 760
const PAD = { left: 64, right: 60, top: 14, bottom: 40 }
const COLORS = ['#2a78d6', '#e34948', '#1baf7a', '#d9a400', '#7b61c9', '#0f9fb5']
const MAX_POINTS = 2000

export function ticks(lo: number, hi: number, count = 6): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return []
  const span = hi - lo || Math.abs(hi) || 1
  const step0 = span / count
  const mag = 10 ** Math.floor(Math.log10(step0))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)))
  return out
}

export function fmt(v: number | null | undefined, decimals?: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  if (decimals === undefined && a !== 0 && (a >= 1e5 || a < 1e-3)) return v.toExponential(2).replace('.', ',')
  return v.toLocaleString('pt-BR', { maximumFractionDigits: decimals ?? 3, minimumFractionDigits: decimals ?? 0 })
}

function range(values: number[]): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (const v of values) {
    if (!Number.isFinite(v)) continue
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  if (!Number.isFinite(lo)) return [0, 1]
  return hi > lo ? [lo, hi] : [lo, lo + 1]
}

function thin(s: Signal): Signal {
  const step = Math.max(1, Math.ceil(s.x.length / MAX_POINTS))
  if (step === 1) return s
  return { ...s, x: s.x.filter((_, i) => i % step === 0), y: s.y.filter((_, i) => i % step === 0) }
}

export function SignalPlot({
  signals,
  hidden = new Set<string>(),
  height = 320,
  marks = [],
}: {
  signals: Signal[]
  hidden?: Set<string>
  height?: number
  /** linhas verticais (ex.: janela de integração) */
  marks?: { x: number; label: string }[]
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [cursor, setCursor] = useState<number | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const shown = useMemo(() => signals.filter((s) => !hidden.has(s.name)).map(thin), [signals, hidden])
  const main = shown.filter((s) => !s.secondary)
  const second = shown.filter((s) => s.secondary)
  const plotW = WIDTH - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom
  const [xMin, xMax] = range(shown.flatMap((s) => s.x))
  const [y1Lo, y1Hi] = range(main.flatMap((s) => s.y))
  const [y2Lo, y2Hi] = range(second.flatMap((s) => s.y))
  const yMin = Math.min(0, y1Lo)
  const yMax = y1Hi + (y1Hi - yMin) * 0.05
  const sx = (x: number) => PAD.left + ((x - xMin) / (xMax - xMin)) * plotW
  const sy = (y: number) => PAD.top + plotH - ((y - yMin) / (yMax - yMin || 1)) * plotH
  const sy2 = (y: number) => PAD.top + plotH - ((y - y2Lo) / (y2Hi - y2Lo || 1)) * plotH
  const colorOf = (name: string) => COLORS[signals.findIndex((s) => s.name === name) % COLORS.length]
  const path = (s: Signal) => {
    const fy = s.secondary ? sy2 : sy
    let d = ''
    let pen = false
    s.x.forEach((x, i) => {
      const y = s.y[i]
      if (!Number.isFinite(y) || !Number.isFinite(x)) {
        pen = false
        return
      }
      d += `${pen ? 'L' : 'M'}${sx(x).toFixed(1)},${fy(y).toFixed(1)}`
      pen = true
    })
    return d
  }

  function onMove(e: PointerEvent<SVGSVGElement>) {
    const r = svgRef.current!.getBoundingClientRect()
    const vx = ((e.clientX - r.left) / r.width) * WIDTH
    const vy = ((e.clientY - r.top) / r.height) * height
    if (vx < PAD.left || vx > WIDTH - PAD.right) {
      setCursor(null)
      if (hover !== null) setHover(null)
      return
    }
    const x = xMin + ((vx - PAD.left) / plotW) * (xMax - xMin)
    setCursor(x)
    let best: string | null = null
    let bestD = 14
    for (const s of shown) {
      let i = 0
      while (i < s.x.length - 1 && s.x[i] < x) i++
      const y = s.y[i]
      if (!Number.isFinite(y)) continue
      const d = Math.abs((s.secondary ? sy2 : sy)(y) - vy)
      if (d < bestD) {
        bestD = d
        best = s.name
      }
    }
    if (best !== hover) setHover(best)
  }

  const valueAt = (s: Signal, x: number) => {
    let i = 0
    while (i < s.x.length - 1 && s.x[i] < x) i++
    return s.y[i]
  }

  if (!shown.length) return <p className="text-sm text-[var(--color-text-muted)]">Sem curvas para mostrar.</p>
  const xLabel = shown[0].x_label
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${WIDTH} ${height}`}
      className="block w-full select-none"
      role="img"
      aria-label={`${main[0]?.y_label ?? ''} × ${xLabel}`}
      onPointerMove={onMove}
      onPointerLeave={() => {
        setCursor(null)
        setHover(null)
      }}
    >
      {ticks(yMin, yMax).map((v) => (
        <g key={`y${v}`}>
          <line x1={PAD.left} x2={WIDTH - PAD.right} y1={sy(v)} y2={sy(v)} stroke="var(--color-border)" strokeWidth={0.6} />
          <text x={PAD.left - 6} y={sy(v) + 3} textAnchor="end" fontSize={10} fill="var(--color-text-muted)">
            {fmt(v)}
          </text>
        </g>
      ))}
      {ticks(xMin, xMax, 8).map((v) => (
        <text key={`x${v}`} x={sx(v)} y={PAD.top + plotH + 14} textAnchor="middle" fontSize={10} fill="var(--color-text-muted)">
          {fmt(v)}
        </text>
      ))}
      <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--color-text-muted)" strokeWidth={0.8} />
      <line x1={PAD.left} x2={WIDTH - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke="var(--color-text-muted)" strokeWidth={0.8} />
      <text x={PAD.left + plotW / 2} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--color-text-muted)">
        {xLabel}
      </text>
      <text x={12} y={PAD.top + plotH / 2} textAnchor="middle" fontSize={11} fill="var(--color-text-muted)" transform={`rotate(-90 12 ${PAD.top + plotH / 2})`}>
        {main.map((s) => s.y_label).filter((v, i, a) => a.indexOf(v) === i).join(' · ')}
      </text>
      {second.length > 0 && (
        <g>
          <line x1={WIDTH - PAD.right} x2={WIDTH - PAD.right} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--color-text-muted)" strokeWidth={0.8} />
          {ticks(y2Lo, y2Hi).map((v) => (
            <text key={`y2${v}`} x={WIDTH - PAD.right + 5} y={sy2(v) + 3} fontSize={10} fill="var(--color-text-muted)">
              {fmt(v)}
            </text>
          ))}
          <text x={WIDTH - 8} y={PAD.top + plotH / 2} textAnchor="middle" fontSize={11} fill="var(--color-text-muted)" transform={`rotate(90 ${WIDTH - 8} ${PAD.top + plotH / 2})`}>
            {second[0].y_label}
          </text>
        </g>
      )}
      {marks.map((m) => (
        <g key={m.label} pointerEvents="none">
          <line x1={sx(m.x)} x2={sx(m.x)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--color-primary)" strokeDasharray="4 3" strokeWidth={1} />
          <text x={sx(m.x) + 3} y={PAD.top + 10} fontSize={9} fill="var(--color-primary)">
            {m.label}
          </text>
        </g>
      ))}
      {shown.map((s) => (
        <path
          key={s.name}
          d={path(s)}
          fill="none"
          stroke={colorOf(s.name)}
          strokeWidth={hover === s.name ? 2.4 : 1.5}
          strokeDasharray={s.secondary ? '5 3' : undefined}
          opacity={hover === null || hover === s.name ? 1 : 0.35}
        />
      ))}
      {cursor !== null && (
        <g pointerEvents="none">
          <line x1={sx(cursor)} x2={sx(cursor)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--color-text-muted)" strokeWidth={0.5} />
          <text x={sx(cursor) + 4} y={PAD.top + plotH - 4} fontSize={9} fill="var(--color-text-muted)">
            {fmt(cursor)}
            {shown.map((s) => ` · ${s.name} ${fmt(valueAt(s, cursor))}`).join('')}
          </text>
        </g>
      )}
      {hover && (
        <text x={PAD.left + 6} y={PAD.top + 12} fontSize={11} fontWeight={600} fill={colorOf(hover)} pointerEvents="none">
          {hover}
        </text>
      )}
    </svg>
  )
}

export function signalColor(signals: Signal[], name: string): string {
  return COLORS[signals.findIndex((s) => s.name === name) % COLORS.length]
}
