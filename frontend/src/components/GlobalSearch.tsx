import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type SearchHit } from '../api/client'
import { SearchIcon } from '../icons'

const KIND_LABEL: Record<string, string> = {
  post: 'Mural',
  equipment: 'Equipamentos',
  module: 'Módulos',
  person: 'Colaboradores',
}
const KIND_ORDER = ['post', 'equipment', 'module', 'person']

export function GlobalSearch() {
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setHits(null)
      return
    }
    const id = setTimeout(() => {
      api
        .search(term)
        .then((r) => {
          setHits(r)
          setOpen(true)
        })
        .catch(() => setHits([]))
    }, 220)
    return () => clearTimeout(id)
  }, [q])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function go(hit: SearchHit) {
    setOpen(false)
    setQ('')
    setHits(null)
    navigate(hit.link)
  }

  const grouped = KIND_ORDER.map((kind) => ({
    kind,
    items: (hits ?? []).filter((h) => h.kind === kind),
  })).filter((g) => g.items.length > 0)

  return (
    <div ref={ref} className="relative w-[380px]">
      <div
        className="flex items-center gap-2.5 rounded-full px-3.5 py-2"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <SearchIcon style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => hits && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
            if (e.key === 'Enter' && hits && hits.length > 0) go(hits[0])
          }}
          placeholder="Buscar avisos, equipamentos, pessoas…"
          className="w-full bg-transparent text-[13px] outline-none"
          style={{ color: 'var(--color-text)' }}
        />
      </div>

      {open && hits !== null && (
        <div
          className="absolute left-0 top-full z-30 mt-2 max-h-[70vh] w-full overflow-y-auto rounded-xl border shadow-lg"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}
        >
          {grouped.length === 0 && (
            <div className="px-4 py-6 text-center text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
              Nada encontrado para "{q.trim()}".
            </div>
          )}
          {grouped.map((g) => (
            <div key={g.kind}>
              <div
                className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase"
                style={{ color: 'var(--color-text-muted)', letterSpacing: '0.04em' }}
              >
                {KIND_LABEL[g.kind] ?? g.kind}
              </div>
              {g.items.map((hit, i) => (
                <button
                  key={g.kind + i}
                  onClick={() => go(hit)}
                  className="block w-full px-4 py-2 text-left"
                  style={{ borderBottom: '1px solid var(--color-border)' }}
                >
                  <div className="truncate text-[13px]">{hit.title}</div>
                  <div className="truncate text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>
                    {hit.subtitle}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
