import { useEffect, useMemo, useState } from 'react'
import { api, ApiError, type DirectoryEntry } from '../api/client'
import { Avatar } from '../components/Avatar'
import { SearchIcon } from '../icons'

function Card({ person }: { person: DirectoryEntry }) {
  return (
    <div
      className="flex flex-col gap-3 rounded-2xl border p-5"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}
    >
      <div className="flex items-center gap-3">
        <Avatar name={person.name} size={48} userId={person.id} />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold">{person.name}</div>
          {person.position && (
            <div className="text-[12.5px]" style={{ color: 'var(--color-primary)' }}>
              {person.position}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 text-[13px]">
        {person.qualification && (
          <div style={{ color: 'var(--color-text-muted)' }}>{person.qualification}</div>
        )}
        {person.email && (
          <a href={`mailto:${person.email}`} className="truncate" style={{ color: 'var(--color-primary)' }}>
            {person.email}
          </a>
        )}
        {person.phone && (
          <a href={`tel:${person.phone.replace(/[^\d+]/g, '')}`} style={{ color: 'var(--color-text)' }}>
            {person.phone}
          </a>
        )}
        {!person.qualification && !person.email && !person.phone && (
          <span style={{ color: 'var(--color-text-muted)' }}>Sem informações de contato ainda.</span>
        )}
      </div>
    </div>
  )
}

export function ColaboradoresPage() {
  const [people, setPeople] = useState<DirectoryEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    api
      .usersDirectory()
      .then(setPeople)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o diretório.'))
  }, [])

  const filtered = useMemo(() => {
    if (!people) return []
    const term = q.toLowerCase().trim()
    if (!term) return people
    return people.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.position.toLowerCase().includes(term) ||
        p.qualification.toLowerCase().includes(term) ||
        p.email.toLowerCase().includes(term),
    )
  }, [people, q])

  return (
    <div className="p-6">
      <div className="mb-5 text-xl font-semibold">Colaboradores</div>

      <div
        className="mb-5 flex w-full max-w-[360px] items-center gap-2.5 rounded-full px-3.5 py-2"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <SearchIcon style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nome, cargo, qualificação…"
          className="w-full bg-transparent text-[13px] outline-none"
          style={{ color: 'var(--color-text)' }}
        />
      </div>

      {error && <p style={{ color: '#d43b3b' }}>{error}</p>}
      {!people && !error && <p style={{ color: 'var(--color-text-muted)' }}>Carregando…</p>}
      {people && filtered.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)' }}>Ninguém encontrado.</p>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
        {filtered.map((p) => (
          <Card key={p.id} person={p} />
        ))}
      </div>
    </div>
  )
}
