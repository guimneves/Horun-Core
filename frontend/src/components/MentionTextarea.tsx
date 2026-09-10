import { useEffect, useMemo, useRef, useState } from 'react'
import { api, type MentionableUser } from '../api/client'
import { Avatar } from './Avatar'

// Caixa de texto com autocompletar de @menção — digitar "@" seguido de
// letras abre uma lista de colaboradores; Enter/clique insere
// "@username " no lugar do texto digitado. Cache simples em módulo: a
// lista de colaboradores raramente muda dentro de uma sessão, não precisa
// buscar de novo a cada caixa de texto montada.
let mentionableCache: MentionableUser[] | null = null

async function getMentionable(): Promise<MentionableUser[]> {
  if (!mentionableCache) mentionableCache = await api.listMentionableUsers()
  return mentionableCache
}

export function renderWithMentions(text: string) {
  const parts = text.split(/(@[\w.-]+)/g)
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <strong key={i} style={{ color: 'var(--color-primary)' }}>
        {part}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  )
}

export function MentionTextarea({
  value,
  onChange,
  placeholder,
  rows = 2,
  className,
  style,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  className?: string
  style?: React.CSSProperties
  autoFocus?: boolean
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [users, setUsers] = useState<MentionableUser[]>([])
  const [query, setQuery] = useState<string | null>(null) // null = fechado
  const [highlighted, setHighlighted] = useState(0)

  useEffect(() => {
    getMentionable().then(setUsers)
  }, [])

  const matches = useMemo(() => {
    if (query === null) return []
    const q = query.toLowerCase()
    return users.filter((u) => u.username.toLowerCase().includes(q) || u.display_name.toLowerCase().includes(q)).slice(0, 6)
  }, [query, users])

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value
    onChange(text)

    const cursor = e.target.selectionStart
    const upToCursor = text.slice(0, cursor)
    const match = upToCursor.match(/@([\w.-]*)$/)
    if (match) {
      setQuery(match[1])
      setHighlighted(0)
    } else {
      setQuery(null)
    }
  }

  function insertMention(username: string) {
    const el = textareaRef.current
    if (!el) return
    const cursor = el.selectionStart
    const upToCursor = value.slice(0, cursor)
    const match = upToCursor.match(/@([\w.-]*)$/)
    if (!match) return
    const start = cursor - match[0].length
    const next = value.slice(0, start) + '@' + username + ' ' + value.slice(cursor)
    onChange(next)
    setQuery(null)
    requestAnimationFrame(() => {
      const pos = start + username.length + 2
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (query === null || matches.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((h) => (h + 1) % matches.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((h) => (h - 1 + matches.length) % matches.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      insertMention(matches[highlighted].username)
    } else if (e.key === 'Escape') {
      setQuery(null)
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
        className={className}
        style={style}
      />
      {query !== null && matches.length > 0 && (
        <div
          className="absolute left-0 top-full z-10 mt-1 w-64 overflow-hidden rounded-lg border shadow-md"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}
        >
          {matches.map((u, i) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertMention(u.username)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm"
              style={{ background: i === highlighted ? 'var(--color-surface)' : 'transparent' }}
            >
              <Avatar name={u.display_name} size={24} userId={u.id} />
              <div>
                <div className="font-medium">{u.display_name}</div>
                <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  @{u.username}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
