import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api, API_BASE, type Equipment, type EquipmentArea, type EquipmentType, type ModuleStatus } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { timeAgo } from '../lib/datetime'
import { downloadQrSheet } from '../lib/qrSheet'

// Capa do card — diferente do EquipmentPhoto (tamanho fixo, usado como
// avatar): aqui a imagem preenche o container responsivo (aspect-ratio
// do card), com o mesmo fallback pra cor cadastrada se não tiver foto.
function CardPhoto({ equipmentId, color, hasPhoto }: { equipmentId: string; color: string; hasPhoto: boolean }) {
  const [failed, setFailed] = useState(false)
  if (hasPhoto && !failed) {
    return (
      <img
        src={`${API_BASE}/equipment/${encodeURIComponent(equipmentId)}/photo`}
        alt=""
        crossOrigin="use-credentials"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />
    )
  }
  return <div className="h-full w-full" style={{ background: color }} />
}

// Bolinha de status do módulo vinculado — clicar abre o módulo direto,
// sem passar pela página de detalhe do equipamento.
function ModuleStatusBadge({ module }: { module: ModuleStatus }) {
  const online = module.status === 'online'
  const clickable = module.has_access && module.embeddable
  return (
    <button
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (clickable) window.location.href = `/m/${encodeURIComponent(module.id)}/`
      }}
      className="absolute right-2 top-2 h-3.5 w-3.5 rounded-full"
      style={{
        background: online ? '#1fa34a' : '#d43b3b',
        boxShadow: '0 0 0 2px var(--color-bg-elevated)',
        cursor: clickable ? 'pointer' : 'default',
      }}
      title={`${module.display_name} — ${online ? 'operacional' : 'offline'}${clickable ? ' (clique para abrir)' : ''}`}
    />
  )
}

export function EquipmentPage() {
  const { user } = useAuth()
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [areas, setAreas] = useState<EquipmentArea[]>([])
  const [types, setTypes] = useState<EquipmentType[]>([])
  const [modules, setModules] = useState<ModuleStatus[]>([])
  const [search, setSearch] = useState('')
  const [areaFilter, setAreaFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const isAdmin = !!user?.can.manage_equipment
  // PDF de QR codes: só o administrador máximo (nível 1)
  const canPrintQr = user?.level === 1
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    // Sem isto, uma falha aqui (ex. backend desatualizado numa coluna
    // nova) ficava indistinguível de "nenhum equipamento cadastrado" —
    // a lista simplesmente ficava vazia, sem nenhum aviso.
    api
      .listEquipment()
      .then(setEquipment)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os equipamentos.'))
    // auxiliares (filtros e badge de status do módulo): se falharem, a lista
    // de equipamentos — que tem erro visível acima — continua utilizável
    api.listEquipmentAreas().then(setAreas).catch(() => {})
    api.listEquipmentTypes().then(setTypes).catch(() => {})
    api.dashboardModules().then(setModules).catch(() => {})
  }, [])

  const moduleById = useMemo(() => new Map(modules.map((m) => [m.id, m])), [modules])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return equipment.filter((eq) => {
      if (areaFilter && String(eq.area_id ?? '') !== areaFilter) return false
      if (typeFilter && String(eq.type_id ?? '') !== typeFilter) return false
      if (q && !eq.display_name.toLowerCase().includes(q) && !eq.description.toLowerCase().includes(q)) return false
      return true
    })
  }, [equipment, search, areaFilter, typeFilter])

  const sections = useMemo(() => {
    const byArea = new Map<number | 'none', Equipment[]>()
    for (const eq of filtered) {
      const key = eq.area_id ?? 'none'
      if (!byArea.has(key)) byArea.set(key, [])
      byArea.get(key)!.push(eq)
    }
    const named = areas
      .map((a) => ({ key: a.id as number | 'none', name: a.name, items: byArea.get(a.id) ?? [] }))
      .filter((s) => s.items.length > 0)
    const rest = byArea.get('none') ?? []
    return rest.length > 0 ? [...named, { key: 'none' as const, name: 'Sem área', items: rest }] : named
  }, [filtered, areas])

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const stopSelecting = () => {
    setSelecting(false)
    setSelected(new Set())
  }

  async function makePdf() {
    const areaName = new Map(areas.map((a) => [a.id, a.name]))
    const typeName = new Map(types.map((t) => [t.id, t.name]))
    // na ordem da tela (áreas, depois nome)
    const chosen = sections.flatMap((sec) => sec.items).filter((eq) => selected.has(eq.id))
    setPrinting(true)
    setError(null)
    try {
      await downloadQrSheet(
        chosen.map((eq) => ({
          id: eq.id,
          name: eq.display_name,
          detail: [eq.area_id != null ? areaName.get(eq.area_id) : '', eq.type_id != null ? typeName.get(eq.type_id) : ''].filter(Boolean).join(' · '),
        })),
      )
    } catch {
      setError('Não foi possível gerar o PDF dos QR codes.')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div className="p-3 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 md:mb-5">
        <h2 className="text-lg font-semibold">Equipamentos</h2>
        {canPrintQr && equipment.length > 0 && !selecting && (
          <button
            onClick={() => setSelecting(true)}
            className="min-h-10 rounded-lg border px-3 text-sm md:min-h-9"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)', color: 'var(--color-text)' }}
          >
            QR codes em PDF
          </button>
        )}
      </div>
      {selecting && (
        <p className="mb-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Toque nos equipamentos para escolher. O PDF sai em A4, 6 etiquetas por folha, com o QR code, o nome e o ícone do Horun.
        </p>
      )}

      <div className="mb-5 flex flex-wrap gap-2.5 md:mb-6">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou descrição…"
          className="w-full rounded-lg px-3 py-2 text-sm outline-none sm:w-auto sm:min-w-[220px] sm:flex-1"
          style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
        />
        <select
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value)}
          className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm outline-none sm:flex-none"
          style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
        >
          <option value="">Todas as áreas</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm outline-none sm:flex-none"
          style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
        >
          <option value="">Todos os tipos</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {error && <p style={{ color: '#d43b3b' }}>{error}</p>}
      {!error && equipment.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)' }}>
          Nenhum equipamento cadastrado ainda{isAdmin ? ' — cadastre em Administração → Equipamentos.' : '.'}
        </p>
      )}
      {equipment.length > 0 && filtered.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)' }}>Nenhum equipamento corresponde ao filtro.</p>
      )}

      {sections.map((section) => (
        <div key={section.key} className="mb-8">
          <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>
            {section.name}
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {section.items.map((eq) => {
              const linkedModule = eq.module_id ? moduleById.get(eq.module_id) : undefined
              return (
                <Link
                  key={eq.id}
                  to={`/equipamentos/${encodeURIComponent(eq.id)}`}
                  viewTransition
                  onClick={(e) => {
                    if (!selecting) return
                    e.preventDefault()
                    toggle(eq.id)
                  }}
                  aria-pressed={selecting ? selected.has(eq.id) : undefined}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border transition-shadow hover:shadow-lg"
                  style={{
                    borderColor: selecting && selected.has(eq.id) ? 'var(--color-primary)' : 'var(--color-border)',
                    boxShadow: selecting && selected.has(eq.id) ? '0 0 0 2px var(--color-primary)' : undefined,
                    background: 'var(--color-bg-elevated)',
                  }}
                >
                  {selecting && (
                    <span
                      className="absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md text-sm font-bold"
                      style={{
                        background: selected.has(eq.id) ? 'var(--color-primary)' : 'rgba(255,255,255,0.9)',
                        color: selected.has(eq.id) ? '#fff' : 'transparent',
                        border: '2px solid var(--color-primary)',
                      }}
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                  )}
                  <div className="relative aspect-[4/3] overflow-hidden" style={{ viewTransitionName: `equipment-photo-${eq.id}` }}>
                    <CardPhoto equipmentId={eq.id} color={eq.color} hasPhoto={eq.has_photo} />
                    {linkedModule && <ModuleStatusBadge module={linkedModule} />}
                  </div>
                  <div className="min-w-0 p-3 md:p-3.5">
                    <div className="truncate font-medium">{eq.display_name}</div>
                    {eq.description && (
                      <div className="mt-1 line-clamp-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {eq.description}
                      </div>
                    )}
                    {(eq.reservations_this_week > 0 || eq.last_used_at) && (
                      <div className="mt-2 flex flex-col gap-0.5 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                        {eq.reservations_this_week > 0 && (
                          <span>{eq.reservations_this_week} reserva{eq.reservations_this_week > 1 ? 's' : ''} esta semana</span>
                        )}
                        {eq.last_used_at && <span>usado {timeAgo(eq.last_used_at)}</span>}
                      </div>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      ))}

      {selecting && (
        <div
          className="sticky bottom-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border p-2 shadow-lg"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}
          role="region"
          aria-label="QR codes em PDF"
        >
          <span className="mr-auto px-1 text-sm font-medium">{selected.size} selecionado(s)</span>
          <button
            onClick={() => setSelected(new Set(filtered.map((eq) => eq.id)))}
            className="min-h-10 rounded-lg px-3 text-sm md:min-h-9"
            style={{ color: 'var(--color-text)' }}
          >
            Todos os da tela
          </button>
          <button onClick={stopSelecting} className="min-h-10 rounded-lg px-3 text-sm md:min-h-9" style={{ color: 'var(--color-text-muted)' }}>
            Cancelar
          </button>
          <button
            onClick={makePdf}
            disabled={selected.size === 0 || printing}
            className="min-h-10 rounded-lg px-4 text-sm font-medium disabled:opacity-50 md:min-h-9"
            style={{ background: 'var(--color-primary)', color: '#fff' }}
          >
            {printing ? 'Gerando…' : `Gerar PDF (${Math.ceil(selected.size / 6) || 0} folha${Math.ceil(selected.size / 6) === 1 ? '' : 's'})`}
          </button>
        </div>
      )}
    </div>
  )
}
