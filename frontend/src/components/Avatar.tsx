import { useEffect, useState } from 'react'
import { API_BASE } from '../api/client'

// Círculo com iniciais — cor determinística por pessoa (mesmo nome/id
// sempre cai na mesma cor), dentro da família de tons já usada na
// plataforma (não introduz matizes novos).
const PALETTE = ['#15216f', '#5c6bc4', '#1f7a5c', '#3a4a9e', '#a34a1f']

function colorFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

// `userId`, quando informado, tenta carregar a foto de perfil da pessoa
// (GET /users/{id}/photo) — cai pras iniciais automaticamente se não
// tiver foto (404) ou o carregamento falhar. Sem `userId`, mostra só as
// iniciais (ex. avatar do campo "escrever uma resposta", antes de saber
// quem está digitando).
export function Avatar({
  name,
  size = 34,
  userId,
  cacheBust,
}: {
  name: string
  size?: number
  userId?: number
  // Muda (ex.: um contador incrementado após enviar/remover a própria
  // foto) para forçar o navegador a buscar de novo em vez de servir do
  // cache — a URL do endpoint não muda sozinha quando a foto muda.
  cacheBust?: number | string
}) {
  const [photoFailed, setPhotoFailed] = useState(false)
  // Se a pessoa remove a foto (cai pra iniciais) e depois envia outra, o
  // `userId` não muda — sem isto o componente ficaria preso mostrando
  // iniciais mesmo com uma foto nova disponível.
  useEffect(() => setPhotoFailed(false), [userId, cacheBust])
  const showPhoto = userId != null && !photoFailed

  if (showPhoto) {
    return (
      <img
        src={`${API_BASE}/users/${userId}/photo${cacheBust !== undefined ? `?v=${cacheBust}` : ''}`}
        alt={name}
        // A rota exige sessão — em dev, front (5174) e back (8000) são
        // origens diferentes, e um <img> normal não manda o cookie de
        // sessão nesse caso (em produção, mesma origem via Caddy, isto é
        // inofensivo). Sem isto, a foto sempre falhava com 401 no dev.
        crossOrigin="use-credentials"
        onError={() => setPhotoFailed(true)}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />
    )
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: colorFor(name),
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.38,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {initials(name)}
    </div>
  )
}
