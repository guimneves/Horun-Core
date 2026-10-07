import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api, type Suggestion } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { LightbulbIcon } from '../icons'
import { timeAgo } from '../lib/datetime'

const POLL_MS = 60_000

// Ícone flutuante no canto da tela — qualquer colaborador deixa uma
// sugestão aqui. Só o administrador *original* (is_protected, não
// qualquer administrador máximo) vê a lista de sugestões recebidas.
export function SuggestionBox() {
  const { user } = useAuth()
  const ref = useRef<HTMLDivElement>(null)
  const isProtected = !!user?.is_protected

  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState<Suggestion[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)

  const refreshCount = useCallback(() => {
    if (!isProtected) return
    api
      .unreadSuggestionCount()
      .then((r) => setUnread(r.count))
      // polling de fundo: falha só mantém o número antigo até a próxima rodada
      .catch(() => {})
  }, [isProtected])

  useEffect(() => {
    if (!isProtected) return
    refreshCount()
    const id = setInterval(refreshCount, POLL_MS)
    return () => clearInterval(id)
  }, [isProtected, refreshCount])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function loadList() {
    api
      .listSuggestions()
      .then((list) => {
        setListError(null)
        setItems(list)
      })
      .catch((err) => {
        setListError(err instanceof ApiError ? err.message : 'Não foi possível carregar as sugestões.')
        setItems([])
      })
  }

  function toggle() {
    const next = !open
    setOpen(next)
    setSent(false)
    setError(null)
    if (next && isProtected) loadList()
  }

  async function send() {
    const value = text.trim()
    if (!value) return
    setSending(true)
    setError(null)
    try {
      await api.createSuggestion(value)
      setText('')
      setSent(true)
      if (isProtected) loadList()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao enviar sugestão.')
    } finally {
      setSending(false)
    }
  }

  async function setStatus(id: number, status: string) {
    try {
      await api.updateSuggestionStatus(id, status)
      loadList()
      refreshCount()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao atualizar sugestão.')
    }
  }

  async function remove(id: number) {
    try {
      await api.deleteSuggestion(id)
      loadList()
      refreshCount()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao excluir sugestão.')
    }
  }

  if (!user) return null

  return (
    <div ref={ref} className="fixed bottom-4 right-4 z-30 md:bottom-5 md:right-5">
      {open && (
        <div
          className="absolute bottom-full right-0 mb-3 flex max-h-[calc(100dvh-6rem)] w-[min(340px,calc(100vw-2rem))] flex-col overflow-y-auto rounded-xl border shadow-lg"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}
        >
          <div className="px-4 py-3 text-[13px] font-semibold" style={{ borderBottom: '1px solid var(--color-border)' }}>
            Deixe uma sugestão
          </div>
          <div className="p-4">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Alguma ideia, problema ou pedido para o Horun?"
              rows={3}
              className="w-full resize-none rounded-lg px-3 py-2 text-[13px] outline-none"
              style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}
            />
            {error && (
              <p className="mt-2 text-xs" style={{ color: '#d43b3b' }}>
                {error}
              </p>
            )}
            {sent && !error && (
              <p className="mt-2 text-xs" style={{ color: 'var(--color-primary)' }}>
                Sugestão enviada, obrigado!
              </p>
            )}
            <button
              onClick={send}
              disabled={!text.trim() || sending}
              className="mt-2 min-h-10 w-full rounded-lg py-2 text-[13px] font-medium disabled:opacity-50"
              style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
            >
              {sending ? 'Enviando…' : 'Enviar'}
            </button>
          </div>

          {isProtected && (
            <>
              <div
                className="px-4 py-2 text-[12px] font-semibold"
                style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
              >
                Sugestões recebidas
              </div>
              <div className="max-h-[320px] overflow-y-auto">
                {items === null && (
                  <div className="px-4 py-6 text-center text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
                    Carregando…
                  </div>
                )}
                {listError && (
                  <div className="px-4 py-6 text-center text-[13px]" style={{ color: '#d43b3b' }}>
                    {listError}
                  </div>
                )}
                {!listError && items !== null && items.length === 0 && (
                  <div className="px-4 py-6 text-center text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
                    Nenhuma sugestão ainda.
                  </div>
                )}
                {items?.map((s) => (
                  <div
                    key={s.id}
                    className="px-4 py-3"
                    style={{ borderTop: '1px solid var(--color-border)', opacity: s.status === 'arquivada' ? 0.55 : 1 }}
                  >
                    <p className="text-[13px] leading-snug">{s.text}</p>
                    <div className="mt-1.5 flex items-center justify-between text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                      <span>
                        {s.author_name} · {timeAgo(s.created_at)}
                      </span>
                      <div className="flex gap-2">
                        {s.status === 'novo' && (
                          <button onClick={() => setStatus(s.id, 'lida')} className="min-h-8 underline">
                            lida
                          </button>
                        )}
                        {s.status !== 'arquivada' && (
                          <button onClick={() => setStatus(s.id, 'arquivada')} className="min-h-8 underline">
                            arquivar
                          </button>
                        )}
                        <button onClick={() => remove(s.id)} className="min-h-8 underline" style={{ color: '#d43b3b' }}>
                          excluir
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <button
        onClick={toggle}
        aria-label="Caixa de sugestões"
        className="relative flex h-12 w-12 items-center justify-center rounded-full shadow-lg"
        style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
      >
        <LightbulbIcon width={22} height={22} />
        {isProtected && unread > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold"
            style={{ background: '#d43b3b', color: 'white' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </div>
  )
}
