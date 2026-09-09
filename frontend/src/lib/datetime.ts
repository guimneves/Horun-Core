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
