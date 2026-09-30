import { useRef, useState, type FormEvent } from 'react'
import { api, ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Avatar } from '../components/Avatar'
import { BirthDateFields, birthPayload, type BirthValue } from '../components/BirthDateFields'

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-[13px] font-medium">{label}</label>
      <input
        type={type}
        className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
        style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}

export function ProfilePage() {
  const { user, refreshUser, userVersion } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [displayName, setDisplayName] = useState(user?.display_name ?? '')
  const [fullName, setFullName] = useState(user?.full_name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [birth, setBirth] = useState<BirthValue>({
    day: user?.birth_day ?? null,
    month: user?.birth_month ?? null,
    year: user?.birth_year ?? null,
  })
  const [emailNotif, setEmailNotif] = useState(user?.email_notifications ?? true)

  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordSavedAt, setPasswordSavedAt] = useState<number | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  if (!user) return null

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    setPasswordError(null)
    if (newPassword.length < 6) {
      setPasswordError('A nova senha precisa ter pelo menos 6 caracteres.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('A confirmação não bate com a nova senha.')
      return
    }
    setPasswordSaving(true)
    try {
      await api.changeMyPassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordSavedAt(Date.now())
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : 'Falha ao trocar a senha.')
    } finally {
      setPasswordSaving(false)
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const birthBody = birthPayload(birth)
    if (birthBody === null) {
      setError('Escolha o dia e o mês de nascimento juntos (ou deixe os dois em branco).')
      return
    }
    setSaving(true)
    try {
      await api.updateProfile({
        display_name: displayName,
        full_name: fullName,
        email,
        phone,
        email_notifications: emailNotif,
        ...birthBody,
      })
      await refreshUser()
      setSavedAt(Date.now())
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar perfil.')
    } finally {
      setSaving(false)
    }
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
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

  async function handleRemovePhoto() {
    setError(null)
    setPhotoBusy(true)
    try {
      await api.deleteMyPhoto()
      await refreshUser()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao remover a foto.')
    } finally {
      setPhotoBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-[560px] p-6">
      <div className="mb-1 text-xl font-semibold">Meu perfil</div>
      <div className="mb-7 text-[13.5px]" style={{ color: 'var(--color-text-muted)' }}>
        Seus dados pessoais e sua foto de perfil. Posição e qualificação são definidas pelo administrador.
      </div>

      <div
        className="mb-6 flex items-center gap-5 rounded-2xl border p-5"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}
      >
        <Avatar name={user.display_name || user.username} size={72} userId={user.id} cacheBust={userVersion} />
        <div>
          <div className="mb-2 flex gap-2.5">
            <button
              type="button"
              disabled={photoBusy}
              className="rounded-lg px-3.5 py-2 text-[13px] font-semibold disabled:opacity-50"
              style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
              onClick={() => fileInputRef.current?.click()}
            >
              {user.has_photo ? 'Trocar foto' : 'Enviar foto'}
            </button>
            {user.has_photo && (
              <button
                type="button"
                disabled={photoBusy}
                className="rounded-lg px-3.5 py-2 text-[13px] font-semibold disabled:opacity-50"
                style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}
                onClick={handleRemovePhoto}
              >
                Remover
              </button>
            )}
          </div>
          <div className="text-[12.5px]" style={{ color: 'var(--color-text-muted)' }}>
            JPEG, PNG ou WEBP · até 2 MB
          </div>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoChange} />
        </div>
      </div>

      <form
        onSubmit={handleSave}
        className="rounded-2xl border p-5"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}
      >
        <Field label="Nome de exibição" value={displayName} onChange={setDisplayName} placeholder="como aparece no mural e na agenda" />
        <Field label="Nome completo" value={fullName} onChange={setFullName} placeholder="ex.: Ana Paula Souza Lima" />
        <Field label="E-mail" type="email" value={email} onChange={setEmail} placeholder="voce@nqtr.ufrj.br" />
        <Field label="Telefone" value={phone} onChange={setPhone} placeholder="(21) 99999-0000" />

        <div className="mb-4">
          <BirthDateFields value={birth} onChange={setBirth} />
        </div>

        <label className="mb-4 flex items-center gap-2.5 text-[13px]">
          <input type="checkbox" checked={emailNotif} onChange={(e) => setEmailNotif(e.target.checked)} />
          Receber notificações importantes por e-mail (menção, resposta, aniversários da semana)
        </label>

        <div className="mb-4 grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
              Posição
            </label>
            <div className="rounded-lg px-3.5 py-2.5 text-sm" style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)' }}>
              {user.position || '—'}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
              Qualificação
            </label>
            <div className="rounded-lg px-3.5 py-2.5 text-sm" style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)' }}>
              {user.qualification || '—'}
            </div>
          </div>
        </div>

        {error && (
          <p className="mb-4 text-sm" style={{ color: '#d43b3b' }}>
            {error}
          </p>
        )}
        {savedAt && !error && (
          <p className="mb-4 text-sm" style={{ color: 'var(--color-primary)' }}>
            Perfil salvo.
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
          style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
        >
          {saving ? 'Salvando…' : 'Salvar perfil'}
        </button>
      </form>

      <form
        onSubmit={handleChangePassword}
        className="mt-6 rounded-2xl border p-5"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}
      >
        <div className="mb-4 text-[15px] font-semibold">Trocar senha</div>
        <Field label="Senha atual" type="password" value={currentPassword} onChange={setCurrentPassword} />
        <Field label="Nova senha" type="password" value={newPassword} onChange={setNewPassword} placeholder="mínimo 6 caracteres" />
        <Field label="Confirmar nova senha" type="password" value={confirmPassword} onChange={setConfirmPassword} />

        {passwordError && (
          <p className="mb-4 text-sm" style={{ color: '#d43b3b' }}>
            {passwordError}
          </p>
        )}
        {passwordSavedAt && !passwordError && (
          <p className="mb-4 text-sm" style={{ color: 'var(--color-primary)' }}>
            Senha alterada.
          </p>
        )}

        <button
          type="submit"
          disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
          className="rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
          style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
        >
          {passwordSaving ? 'Salvando…' : 'Trocar senha'}
        </button>
      </form>
    </div>
  )
}
