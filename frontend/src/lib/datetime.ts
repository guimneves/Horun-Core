// Formata um Date como string local "YYYY-MM-DDTHH:mm:ss", sem conversão
// de fuso — mesma convenção usada pelo backend para start_at/end_at
// (naive, hora local). `date.toISOString()` NÃO serve aqui: converte pra
// UTC antes de formatar, o que desalinha os limites de filtro por
// intervalo com o que está gravado (causava reservas "sumindo" da grade).
export function toLocalIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

// "agora" / "há 5 min" / "há 3h" / "ontem" / "há 4 dias" — usado no Mural
// e no painel de notificações.
export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'ontem'
  return `há ${days} dias`
}
