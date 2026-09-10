import { useRef, useState } from 'react'
import { api, ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Avatar } from './Avatar'

// Aparece uma vez, no primeiro acesso (User.onboarded === false), pra a
// pessoa completar o perfil — assim o Diretório de Colaboradores não
// nasce vazio. "Pular" também marca como concluído (não incomoda de novo).
export function OnboardingModal() {
  const { user, refreshUser, userVersion } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)

  const [fullName, setFullName] = useState(user?.full_name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [busy, setBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!user || user.onboarded) return null

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setPhotoBusy(true)
    try {
      await api.uploadMyPhoto(file)
      await refreshUser()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao enviar a foto.')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function finish(save: boolean) {
    setError(null)
    setBusy(true)
    try {
      await api.updateProfile(
        save
          ? { full_name: fullName, email, phone, onboarded: true }
          : { onboarded: true },
      )
      await refreshUser()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar.')
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(10,15,40,0.55)' }}
    >
      <div
        className="w-full max-w-[460px] rounded-2xl border p-6"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}
      >
        <div className="mb-1 text-lg font-semibold">Bem-vindo(a) ao Horun</div>
        <div className="mb-5 text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
          Complete seu perfil pra a equipe te encontrar no diretório de colaboradores. Dá pra
          ajustar depois em "Meu perfil".
        </div>

        <div className="mb-4 flex items-center gap-4">
          <Avatar name={user.display_name || user.username} size={56} userId={user.id} cacheBust={userVersion} />
          <button
            type="button"
            disabled={photoBusy}
            className="rounded-lg px-3.5 py-2 text-[13px] font-semibold disabled:opacity-50"
            style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}
            onClick={() => fileRef.current?.click()}
          >
            {user.has_photo ? 'Trocar foto' : 'Enviar foto'}
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhoto} />
        </div>

        {[
          { label: 'Nome completo', value: fullName, set: setFullName, ph: 'ex.: Ana Paula Souza Lima', type: 'text' },
          { label: 'E-mail', value: email, set: setEmail, ph: 'voce@nqtr.ufrj.br', type: 'email' },
          { label: 'Telefone', value: phone, set: setPhone, ph: '(21) 99999-0000', type: 'text' },
        ].map((f) => (
          <div key={f.label} className="mb-3">
            <label className="mb-1 block text-[12.5px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
              {f.label}
            </label>
            <input
              type={f.type}
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
              placeholder={f.ph}
              className="w-full rounded-lg px-3 py-2 text-[13px] outline-none"
              style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
            />
          </div>
        ))}

        {error && (
          <p className="mb-3 text-xs" style={{ color: '#d43b3b' }}>
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            disabled={busy}
            className="text-[13px]"
            style={{ color: 'var(--color-text-muted)' }}
            onClick={() => finish(false)}
          >
            Pular por enquanto
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg px-5 py-2.5 text-[13px] font-semibold disabled:opacity-60"
            style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
            onClick={() => finish(true)}
          >
            {busy ? 'Salvando…' : 'Salvar e começar'}
          </button>
        </div>
      </div>
    </div>
  )
}
