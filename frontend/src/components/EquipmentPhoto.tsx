import { useEffect, useState } from 'react'
import { API_BASE } from '../api/client'

// Mesmo padrão do Avatar (usuários): tenta a foto (GET
// /equipment/{id}/photo) e cai pra um quadrado com a cor cadastrada do
// equipamento se não tiver foto ou o carregamento falhar. Quadrado (não
// círculo) só pra diferenciar visualmente equipamento de pessoa.
export function EquipmentPhoto({
  equipmentId,
  color,
  hasPhoto,
  size = 40,
  cacheBust,
}: {
  equipmentId: string
  color: string
  hasPhoto: boolean
  size?: number
  cacheBust?: number | string
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [equipmentId, hasPhoto, cacheBust])
  const showPhoto = hasPhoto && !failed

  if (showPhoto) {
    return (
      <img
        src={`${API_BASE}/equipment/${equipmentId}/photo${cacheBust !== undefined ? `?v=${cacheBust}` : ''}`}
        alt=""
        crossOrigin="use-credentials"
        onError={() => setFailed(true)}
        style={{ width: size, height: size, borderRadius: size * 0.22, objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        background: color,
        flexShrink: 0,
      }}
    />
  )
}
