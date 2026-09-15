import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, API_BASE, type Equipment, type EquipmentArea, type EquipmentType, type ModuleStatus } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { timeAgo } from '../lib/datetime'

// Capa do card — diferente do EquipmentPhoto (tamanho fixo, usado como
// avatar): aqui a imagem preenche o container responsivo (aspect-ratio
// do card), com o mesmo fallback pra cor cadastrada se não tiver foto.
function CardPhoto({ equipmentId, color, hasPhoto }: { equipmentId: string; color: string; hasPhoto: boolean }) {
  const [failed, setFailed] = useState(false)
  if (hasPhoto && !failed) {
    return (
      <img
        src={`${API_BASE}/equipment/${equipmentId}/photo`}
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
        if (clickable) window.location.href = `/m/${module.id}/`
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
  const isAdmin = !!user?.is_super_admin

  useEffect(() => {
    api.listEquipment().then(setEquipment).catch(() => {})
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

  return (
    <div className="p-6">
      <h2 className="mb-5 text-lg font-semibold">Equipamentos</h2>

      <div className="mb-6 flex flex-wrap gap-2.5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou descrição…"
          className="min-w-[220px] flex-1 rounded-lg px-3 py-2 text-sm outline-none"
          style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
        />
        <select
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value)}
          className="rounded-lg px-3 py-2 text-sm outline-none"
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
          className="rounded-lg px-3 py-2 text-sm outline-none"
          style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
        >
          <option value="">Todos os tipos</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {equipment.length === 0 && (
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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {section.items.map((eq) => {
              const linkedModule = eq.module_id ? moduleById.get(eq.module_id) : undefined
              return (
                <Link
                  key={eq.id}
                  to={`/equipamentos/${eq.id}`}
                  viewTransition
                  className="group flex flex-col overflow-hidden rounded-2xl border transition-shadow hover:shadow-lg"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}
                >
                  <div className="relative aspect-[4/3] overflow-hidden" style={{ viewTransitionName: `equipment-photo-${eq.id}` }}>
                    <CardPhoto equipmentId={eq.id} color={eq.color} hasPhoto={eq.has_photo} />
                    {linkedModule && <ModuleStatusBadge module={linkedModule} />}
                  </div>
                  <div className="p-3.5">
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
    </div>
  )
}
