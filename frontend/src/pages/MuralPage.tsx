import { useEffect, useState } from 'react'
import { api, ApiError, type Equipment, type ModuleStatus, type Post, type Reservation } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Avatar } from '../components/Avatar'
import { PinIcon } from '../icons'
import { toLocalIso } from '../lib/datetime'
import { MentionTextarea, renderWithMentions } from '../components/MentionTextarea'

function timeAgo(iso: string): string {
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

function Composer({ onPosted }: { onPosted: () => void }) {
  const { user } = useAuth()
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)

  async function handlePost() {
    if (!content.trim()) return
    setBusy(true)
    try {
      await api.createPost(content.trim())
      setContent('')
      onPosted()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="flex items-start gap-3 rounded-2xl border p-4"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}
    >
      <Avatar name={user?.display_name || user?.username || '?'} size={36} />
      <div className="flex-1">
        <MentionTextarea
          value={content}
          onChange={setContent}
          placeholder="Deixe um aviso ou lembrete para a equipe… use @ para marcar alguém"
          rows={2}
          className="mb-2.5 w-full resize-none rounded-[10px] px-3.5 py-2.5 text-sm outline-none"
          style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}
        />
        <div className="flex justify-end">
          <button
            onClick={handlePost}
            disabled={busy || !content.trim()}
            className="rounded-lg px-4.5 py-2 text-[13px] font-semibold disabled:opacity-50"
            style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
          >
            Publicar
          </button>
        </div>
      </div>
    </div>
  )
}

function ReplyRow({ reply, postId, onChanged }: { reply: Post['replies'][number]; postId: number; onChanged: () => void }) {
  const { user } = useAuth()
  const canDelete = user?.is_super_admin || user?.id === reply.author_id
  return (
    <div className="flex gap-2.5">
      <Avatar name={reply.author_display_name} size={26} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] font-semibold">{reply.author_display_name}</span>
          <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            · {timeAgo(reply.created_at)}
          </span>
          {canDelete && (
            <button
              className="ml-auto text-[11px]"
              style={{ color: '#d43b3b' }}
              onClick={() => api.deleteReply(postId, reply.id).then(onChanged)}
            >
              remover
            </button>
          )}
        </div>
        <p className="text-[13px] leading-relaxed">{renderWithMentions(reply.content)}</p>
      </div>
    </div>
  )
}

function ReplyThread({ post, onChanged }: { post: Post; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleReply() {
    if (!content.trim()) return
    setBusy(true)
    try {
      await api.createReply(post.id, content.trim())
      setContent('')
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--color-border)' }}>
      {post.replies.length > 0 && (
        <div className="mb-3 flex flex-col gap-3">
          {post.replies.map((r) => (
            <ReplyRow key={r.id} reply={r} postId={post.id} onChanged={onChanged} />
          ))}
        </div>
      )}

      {open ? (
        <div className="flex items-start gap-2.5">
          <Avatar name="" size={26} />
          <div className="flex-1">
            <MentionTextarea
              value={content}
              onChange={setContent}
              placeholder="Escreva uma resposta… use @ para marcar alguém"
              rows={1}
              autoFocus
              className="mb-2 w-full resize-none rounded-lg px-3 py-1.5 text-[13px] outline-none"
              style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}
            />
            <div className="flex justify-end gap-2">
              <button className="text-[12.5px]" style={{ color: 'var(--color-text-muted)' }} onClick={() => setOpen(false)}>
                cancelar
              </button>
              <button
                onClick={handleReply}
                disabled={busy || !content.trim()}
                className="rounded-md px-3 py-1 text-[12.5px] font-semibold disabled:opacity-50"
                style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
              >
                Responder
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button className="text-[12.5px] font-medium" style={{ color: 'var(--color-text-muted)' }} onClick={() => setOpen(true)}>
          Responder{post.replies.length > 0 ? ` (${post.replies.length})` : ''}
        </button>
      )}
    </div>
  )
}

function PostCard({ post, onChanged }: { post: Post; onChanged: () => void }) {
  const { user } = useAuth()
  const canManage = user?.is_super_admin
  const canDelete = canManage || user?.id === post.author_id

  return (
    <div
      className="rounded-2xl border p-4"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}
    >
      <div className="flex gap-3">
        <Avatar name={post.author_display_name} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-semibold">{post.author_display_name}</span>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              · {timeAgo(post.created_at)}
            </span>
            {post.pinned && (
              <span
                className="ml-auto flex items-center gap-1 rounded-full py-0.5 pl-1.5 pr-2 text-[11.5px] font-semibold"
                style={{ color: 'var(--color-primary)', background: 'var(--color-surface)' }}
              >
                <PinIcon />
                Fixado
              </span>
            )}
            {!post.pinned && canManage && (
              <button
                className="ml-auto text-[11.5px]"
                style={{ color: 'var(--color-text-muted)' }}
                onClick={() => api.pinPost(post.id, true).then(onChanged)}
              >
                fixar
              </button>
            )}
            {post.pinned && canManage && (
              <button
                className="text-[11.5px]"
                style={{ color: 'var(--color-text-muted)' }}
                onClick={() => api.pinPost(post.id, false).then(onChanged)}
              >
                desafixar
              </button>
            )}
            {canDelete && (
              <button
                className="text-[11.5px]"
                style={{ color: '#d43b3b' }}
                onClick={() => api.deletePost(post.id).then(onChanged)}
              >
                remover
              </button>
            )}
          </div>
          <p className="mt-1.5 text-sm leading-relaxed">{renderWithMentions(post.content)}</p>
        </div>
      </div>
      <ReplyThread post={post} onChanged={onChanged} />
    </div>
  )
}

function ModulesWidget() {
  const [modules, setModules] = useState<ModuleStatus[]>([])

  useEffect(() => {
    api.dashboardModules().then(setModules).catch(() => {})
  }, [])

  if (modules.length === 0) return null

  return (
    <div>
      <div
        className="mb-3 text-[12.5px] font-semibold uppercase"
        style={{ color: 'var(--color-text-muted)', letterSpacing: '0.04em' }}
      >
        Módulos
      </div>
      <div className="flex flex-col gap-2">
        {modules.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-2.5 rounded-[10px] border px-3 py-2.5"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}
          >
            <span className="flex-1 text-[13px] font-medium">{m.display_name}</span>
            <span
              className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
              style={{
                background: m.status === 'online' ? 'rgba(31,163,74,0.15)' : 'rgba(212,59,59,0.15)',
                color: m.status === 'online' ? '#1fa34a' : '#d43b3b',
              }}
            >
              {m.status === 'online' ? 'Operacional' : 'Offline'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AgendaWidget() {
  const [items, setItems] = useState<Array<{ reservation: Reservation; equipment?: Equipment }>>([])

  useEffect(() => {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date()
    endOfDay.setHours(23, 59, 59, 999)

    Promise.all([
      api.listReservations({ start: toLocalIso(startOfDay), end: toLocalIso(endOfDay) }),
      api.listEquipment(),
    ])
      .then(([reservations, equipment]) => {
        const byId = new Map(equipment.map((e) => [e.id, e]))
        setItems(
          reservations
            .sort((a, b) => a.start_at.localeCompare(b.start_at))
            .map((r) => ({ reservation: r, equipment: byId.get(r.equipment_id) })),
        )
      })
      .catch(() => {})
  }, [])

  function formatRange(startIso: string, endIso: string): string {
    const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
    return `${new Date(startIso).toLocaleTimeString('pt-BR', opts)} – ${new Date(endIso).toLocaleTimeString('pt-BR', opts)}`
  }

  return (
    <div>
      <div
        className="mb-3 text-[12.5px] font-semibold uppercase"
        style={{ color: 'var(--color-text-muted)', letterSpacing: '0.04em' }}
      >
        Agenda de hoje
      </div>
      {items.length === 0 && (
        <p className="text-[12.5px]" style={{ color: 'var(--color-text-muted)' }}>
          Nenhuma reserva para hoje.
        </p>
      )}
      <div className="flex flex-col gap-2.5">
        {items.map(({ reservation, equipment }) => (
          <div
            key={reservation.id}
            className="flex gap-2.5 rounded-[10px] border px-3 py-2.5"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}
          >
            <div className="w-[3px] flex-shrink-0 rounded" style={{ background: equipment?.color ?? 'var(--color-primary)' }} />
            <div>
              <div className="text-[12.5px] font-semibold">
                {formatRange(reservation.start_at, reservation.end_at)} · {equipment?.display_name ?? reservation.equipment_id}
              </div>
              <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {reservation.user_display_name}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MuralPage() {
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    api
      .listPosts()
      .then(setPosts)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o mural.'))
  }

  useEffect(reload, [])

  return (
    <div className="flex">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 p-6">
        <Composer onPosted={reload} />
        {error && <p style={{ color: '#d43b3b' }}>{error}</p>}
        {!posts && !error && <p style={{ color: 'var(--color-text-muted)' }}>Carregando…</p>}
        {posts?.length === 0 && (
          <p style={{ color: 'var(--color-text-muted)' }}>Nenhum aviso ainda — seja a primeira pessoa a publicar.</p>
        )}
        {posts?.map((p) => (
          <PostCard key={p.id} post={p} onChanged={reload} />
        ))}
      </div>

      <div className="w-[308px] flex-shrink-0 border-l p-6" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex flex-col gap-6">
          <ModulesWidget />
          <AgendaWidget />
        </div>
      </div>
    </div>
  )
}
