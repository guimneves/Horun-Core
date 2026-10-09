import { useEffect, useState } from 'react'
import { api, ApiError, type SignupSettings } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { downloadHomeQrPdf, downloadHomeQrPng, homeQrDataUrl, homeUrl } from '../lib/homeQr'

// Administração → Acesso: cadastro automático (liga/desliga só o
// administrador máximo) e o QR code da página inicial do Horun.

const card = { border: '1px solid var(--color-border)', background: 'var(--color-bg-elevated)' }

function SignupCard() {
  const { user } = useAuth()
  const canToggle = !!user?.can.manage_signup
  const [settings, setSettings] = useState<SignupSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api
      .getSignupSettings()
      .then(setSettings)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar a configuração.'))
  }, [])

  async function toggle() {
    if (!settings) return
    setSaving(true)
    setError(null)
    try {
      setSettings(await api.putSignupSettings(!settings.enabled))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl p-4 md:p-5" style={card}>
      <div className="mb-1 text-[15px] font-semibold">Cadastro automático</div>
      <p className="mb-4 text-[13px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
        Ligado, a tela de login ganha <strong>Primeiro acesso → Criar minha conta</strong>: a pessoa informa o e-mail e um nome
        de usuário, recebe um código de acesso por e-mail, escolhe a senha e a conta é criada (e já entra). A conta nasce sem
        cargo (nível Iniciação Científica, sem acesso a módulos) e a coordenação recebe um aviso para definir a posição em{' '}
        <strong>Usuários</strong>.
      </p>
      {settings && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={settings.enabled}
            disabled={!canToggle || saving}
            onClick={toggle}
            className="relative h-7 w-12 flex-shrink-0 rounded-full transition-colors disabled:opacity-60"
            style={{ background: settings.enabled ? 'var(--color-primary)' : 'var(--color-border)' }}
            aria-label="Habilitar cadastro automático"
          >
            <span
              className="absolute top-1 h-5 w-5 rounded-full bg-white transition-all"
              style={{ left: settings.enabled ? 26 : 4 }}
            />
          </button>
          <span className="text-sm font-medium">{settings.enabled ? 'Habilitado' : 'Desabilitado'}</span>
          {!canToggle && (
            <span className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
              Só o administrador máximo muda esta opção.
            </span>
          )}
        </div>
      )}
      {settings && settings.enabled && !settings.email_configured && (
        <p className="mt-3 rounded-lg px-3 py-2 text-[13px]" style={{ background: 'rgba(212,160,23,0.12)', color: '#8a6a00' }}>
          O envio de e-mail (SMTP) não está configurado no servidor — sem ele não há como mandar o código, e a opção não aparece
          no login.
        </p>
      )}
      {error && (
        <p className="mt-3 text-[13px]" style={{ color: '#d43b3b' }}>
          {error}
        </p>
      )}
    </div>
  )
}

function HomeQrCard() {
  const [qr, setQr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    homeQrDataUrl(440)
      .then(setQr)
      .catch(() => setQr(null))
  }, [])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch {
      setError('Não foi possível gerar o arquivo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl p-4 md:p-5" style={card}>
      <div className="mb-1 text-[15px] font-semibold">QR code do Horun</div>
      <p className="mb-4 text-[13px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
        Leva para a página inicial do Horun ({homeUrl().replace(/\/$/, '')}). Imprima o cartaz para a porta do laboratório ou
        baixe a imagem para slides e mensagens.
      </p>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {qr && <img src={qr} alt="QR code da página inicial do Horun" className="h-44 w-44 rounded-lg" style={{ background: '#fff' }} />}
        <div className="flex w-full flex-col gap-2 sm:w-auto">
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => downloadHomeQrPdf())}
            className="min-h-10 rounded-lg px-4 text-sm font-semibold disabled:opacity-60"
            style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
          >
            {busy ? 'Gerando…' : 'Baixar cartaz (PDF A4)'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => downloadHomeQrPng())}
            className="min-h-10 rounded-lg px-4 text-sm disabled:opacity-60"
            style={{ border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
          >
            Baixar imagem (PNG)
          </button>
        </div>
      </div>
      {error && (
        <p className="mt-3 text-[13px]" style={{ color: '#d43b3b' }}>
          {error}
        </p>
      )}
    </div>
  )
}

export function AdminAccessTab() {
  return (
    <div className="grid max-w-4xl gap-4 lg:grid-cols-2">
      <SignupCard />
      <HomeQrCard />
    </div>
  )
}
