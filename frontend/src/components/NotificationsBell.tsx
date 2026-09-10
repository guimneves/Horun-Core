import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type Notification } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { BellIcon } from '../icons'
import { timeAgo } from '../lib/datetime'
import { Avatar } from './Avatar'

const POLL_MS = 45_000

export function NotificationsBell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)

  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState<Notification[] | null>(null)

  const refreshCount = useCallback(() => {
    if (!user) return
    api
      .unreadNotificationCount()
      .then((r) => setUnread(r.count))
      .catch(() => {})
  }, [user])

  // Contagem: no login e a cada POLL_MS.
  useEffect(() => {
    if (!user) {
      setUnread(0)
      setItems(null)
      return
    }
    refreshCount()
    const id = setInterval(refreshCount, POLL_MS)
    return () => clearInterval(id)
  }, [user, refreshCount])

  // Fechar ao clicar fora.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next) {
      try {
        const list = await api.listNotifications()
        setItems(list)
        if (list.some((n) => !n.read)) {
          await api.markNotificationsRead()
          setUnread(0)
        }
      } catch {
        setItems([])
      }
    }
  }

  function openNotification(n: Notification) {
    setOpen(false)
    navigate(n.link || '/')
  }

  if (!user) return null

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        aria-label="Notificações"
        className="relative flex h-8 w-8 items-center justify-center rounded-full"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <BellIcon />
        {unread > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold"
            style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-20 mt-2 w-[340px] overflow-hidden rounded-xl border shadow-lg"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}
        >
          <div
            className="px-4 py-3 text-[13px] font-semibold"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          >
            Notificações
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {items === null && (
              <div className="px-4 py-6 text-center text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
                Carregando…
              </div>
            )}
            {items !== null && items.length === 0 && (
              <div className="px-4 py-8 text-center text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
                Nenhuma notificação ainda.
              </div>
            )}
            {items?.map((n) => (
              <button
                key={n.id}
                onClick={() => openNotification(n)}
                className="flex w-full items-start gap-2.5 px-4 py-3 text-left"
                style={{
                  borderBottom: '1px solid var(--color-border)',
                  background: n.read ? 'transparent' : 'var(--color-surface)',
                }}
              >
                <Avatar name={n.actor_display_name || '?'} size={28} userId={n.actor_id ?? undefined} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-snug">{n.text}</p>
                  <p className="mt-0.5 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                    {timeAgo(n.created_at)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
