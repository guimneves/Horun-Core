import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, API_BASE, type Equipment, type EquipmentArea } from '../api/client'
import { useAuth } from '../auth/AuthContext'

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

export function EquipmentPage() {
  const { user } = useAuth()
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [areas, setAreas] = useState<EquipmentArea[]>([])
  const isAdmin = !!user?.is_super_admin

  useEffect(() => {
    api.listEquipment().then(setEquipment).catch(() => {})
    api.listEquipmentAreas().then(setAreas).catch(() => {})
  }, [])

  const sections = useMemo(() => {
    const byArea = new Map<number | 'none', Equipment[]>()
    for (const eq of equipment) {
      const key = eq.area_id ?? 'none'
      if (!byArea.has(key)) byArea.set(key, [])
      byArea.get(key)!.push(eq)
    }
    const named = areas
      .map((a) => ({ key: a.id as number | 'none', name: a.name, items: byArea.get(a.id) ?? [] }))
      .filter((s) => s.items.length > 0)
    const rest = byArea.get('none') ?? []
    return rest.length > 0 ? [...named, { key: 'none' as const, name: 'Sem área', items: rest }] : named
  }, [equipment, areas])

  return (
    <div className="p-6">
      <h2 className="mb-5 text-lg font-semibold">Equipamentos</h2>

      {equipment.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)' }}>
          Nenhum equipamento cadastrado ainda{isAdmin ? ' — cadastre em Administração → Equipamentos.' : '.'}
        </p>
      )}

      {sections.map((section) => (
        <div key={section.key} className="mb-8">
          <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>
            {section.name}
          </h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {section.items.map((eq) => (
              <Link
                key={eq.id}
                to={`/equipamentos/${eq.id}`}
                viewTransition
                className="group flex flex-col overflow-hidden rounded-2xl border transition-shadow hover:shadow-lg"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}
              >
                <div className="aspect-[4/3] overflow-hidden" style={{ viewTransitionName: `equipment-photo-${eq.id}` }}>
                  <CardPhoto equipmentId={eq.id} color={eq.color} hasPhoto={eq.has_photo} />
                </div>
                <div className="p-3.5">
                  <div className="truncate font-medium">{eq.display_name}</div>
                  {eq.description && (
                    <div className="mt-1 line-clamp-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {eq.description}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
