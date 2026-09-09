import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import nqtrLogo from '@horun/design-system/src/assets/nqtr-logo.png'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username, password)
      navigate('/')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao entrar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--color-bg)' }}>
      {/* Painel esquerdo — identidade */}
      <div
        className="relative hidden w-[480px] flex-shrink-0 flex-col justify-between overflow-hidden p-14 lg:flex"
        style={{ background: 'var(--color-primary)' }}
      >
        <svg className="absolute -right-28 -top-28 opacity-10" width="420" height="420" viewBox="0 0 480 480" fill="none">
          <circle cx="240" cy="240" r="239" stroke="white" strokeWidth="1.5" />
          <circle cx="240" cy="240" r="180" stroke="white" strokeWidth="1.5" />
          <circle cx="240" cy="240" r="120" stroke="white" strokeWidth="1.5" />
        </svg>

        <div className="relative inline-flex w-fit items-center rounded-xl bg-white/95 px-3 py-2">
          <img src={nqtrLogo} alt="NQTR" className="h-8 w-auto" />
        </div>

        <div className="relative">
          <div className="mb-4 text-[40px] font-semibold leading-none tracking-tight text-white">Horun</div>
          <div className="max-w-[340px] text-[17px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.82)' }}>
            Gestão do parque analítico do laboratório NQTR — amostras, reagentes e equipamentos, num só lugar.
          </div>
        </div>

        <div className="relative text-[13px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
          NQTR · Instituto de Química, UFRJ
        </div>
      </div>

      {/* Painel direito — formulário */}
      <div className="flex flex-1 items-center justify-center p-8">
        <form onSubmit={handleSubmit} className="w-full max-w-[380px]">
          <div className="mb-1 text-[22px] font-semibold">Entrar</div>
          <div className="mb-8 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Use sua conta do laboratório NQTR.
          </div>

          <label className="mb-1.5 block text-[13px] font-medium">Usuário</label>
          <input
            className="mb-4.5 w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
            style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="usuario.sobrenome"
            autoFocus
          />

          <label className="mb-1.5 mt-4 block text-[13px] font-medium">Senha</label>
          <input
            type="password"
            className="mb-6 w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
            style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />

          {error && (
            <p className="mb-4 text-sm" style={{ color: '#d43b3b' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg py-3 text-sm font-semibold disabled:opacity-60"
            style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
          >
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>

          <p className="mt-7 text-center text-[13px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            Contas são criadas pelo administrador da plataforma.
            <br />
            Fale com a coordenação do NQTR para solicitar acesso.
          </p>
        </form>
      </div>
    </div>
  )
}
