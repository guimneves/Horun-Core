import { useEffect, useState } from 'react'

// Abaixo de `md` (768 px) — mesmo ponto de quebra das classes `md:` do
// Tailwind. Usado onde o layout de celular é outro componente, não só
// outras classes (gaveta da barra lateral, visão de dia da Agenda).
const QUERY = '(max-width: 767px)'

function matches(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches
}

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(matches)
  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia(QUERY)
    const onChange = () => setMobile(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return mobile
}
