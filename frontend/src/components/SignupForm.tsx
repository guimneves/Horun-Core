import { useState, type FormEvent } from 'react'
import { api, ApiError, type SignupInfo } from '../api/client'

// Cadastro automático: e-mail + nome de usuário → código por e-mail →
// senha e confirmação → conta criada e já logada. Só aparece quando o
// administrador máximo ligou o cadastro automático (Administração → Acesso).

const inputClass = 'mb-1 w-full rounded-lg px-3.5 py-2.5 text-sm outline-none'
const inputStyle = { border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }

// Mesma regra do backend (routes_signup.py) — conferida aqui só para avisar antes.
const USERNAME_RE = /^[a-z][a-z0-9._-]{2,29}$/

export function SignupForm({ info, onDone, onBack }: { info: SignupInfo; onDone: () => Promise<void>; onBack: () => void }) {
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const usernameOk = USERNAME_RE.test(username)

  async function sendCode() {
    setError(null)
    setNotice(null)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError('Informe um e-mail válido.')
    if (!usernameOk) return setError('O nome de usuário não segue as regras abaixo.')
    setBusy(true)
    try {
      const r = await api.signupCode(email.trim(), username)
      setCodeSent(true)
      setNotice(`Enviamos um código de 6 dígitos para ${email.trim().toLowerCase()}. Ele vale por ${r.valid_minutes} minutos — veja também o spam.`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar o código.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!codeSent) return sendCode()
    setError(null)
    if (password.length < info.password_min) return setError(`A senha precisa ter pelo menos ${info.password_min} caracteres.`)
    if (password !== confirm) return setError('As senhas não coincidem.')
    setBusy(true)
    try {
      await api.signupComplete({ email: email.trim(), username, code: code.trim(), password, password_confirm: confirm })
      await onDone()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar a conta.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="mb-1 text-[22px] font-semibold">Criar minha conta</div>
      <div className="mb-6 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Confirme seu e-mail com um código e escolha sua senha. A coordenação define depois o seu cargo no Horun.
      </div>

      <label className="mb-1.5 block text-[13px] font-medium">E-mail</label>
      <input
        type="email"
        className={inputClass}
        style={inputStyle}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="nome@exemplo.com"
        disabled={codeSent}
        autoComplete="email"
        autoFocus
      />

      <label className="mb-1.5 mt-3.5 block text-[13px] font-medium">Nome de usuário</label>
      <input
        className={inputClass}
        style={{ ...inputStyle, borderColor: username && !usernameOk ? '#d43b3b' : 'var(--color-border)' }}
        value={username}
        onChange={(e) => setUsername(e.target.value.trim())}
        placeholder="maria.silva"
        disabled={codeSent}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        aria-describedby="username-rules"
      />
      <div id="username-rules" className="mb-4 rounded-lg px-3 py-2 text-[12px] leading-relaxed" style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)' }}>
        <strong style={{ color: 'var(--color-text)' }}>Regras do nome de usuário:</strong>
        <ul className="ml-4 mt-1 list-disc">
          <li>de 3 a 30 caracteres;</li>
          <li>só letras minúsculas sem acento (a–z), números, ponto (.), hífen (-) e sublinhado (_);</li>
          <li>começa com uma letra; sem espaços;</li>
          <li>
            exemplo: <code>maria.silva</code> — é com ele que você entra e que os colegas te marcam no Mural (@maria.silva).
          </li>
        </ul>
      </div>

      {!codeSent ? (
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg py-3 text-sm font-semibold disabled:opacity-60"
          style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
        >
          {busy ? 'Enviando…' : 'Receber código de acesso por e-mail'}
        </button>
      ) : (
        <>
          {notice && (
            <p className="mb-4 rounded-lg px-3 py-2 text-[13px]" style={{ background: 'var(--color-surface)' }}>
              {notice}
            </p>
          )}
          <label className="mb-1.5 block text-[13px] font-medium">Código de acesso</label>
          <input
            className={`${inputClass} mb-3.5 tracking-[0.4em]`}
            style={inputStyle}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
          />
          <label className="mb-1.5 block text-[13px] font-medium">Senha</label>
          <input
            type="password"
            className={`${inputClass} mb-3.5`}
            style={inputStyle}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={`pelo menos ${info.password_min} caracteres`}
            autoComplete="new-password"
          />
          <label className="mb-1.5 block text-[13px] font-medium">Confirme a senha</label>
          <input
            type="password"
            className={`${inputClass} mb-5`}
            style={inputStyle}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="repita a senha"
            autoComplete="new-password"
          />
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="w-full rounded-lg py-3 text-sm font-semibold disabled:opacity-60"
            style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
          >
            {busy ? 'Criando conta…' : 'Criar conta e entrar'}
          </button>
          <div className="mt-3 flex justify-between text-[13px]">
            <button type="button" className="min-h-10 underline" style={{ color: 'var(--color-primary)' }} disabled={busy} onClick={sendCode}>
              Reenviar código
            </button>
            <button
              type="button"
              className="min-h-10 underline"
              style={{ color: 'var(--color-text-muted)' }}
              onClick={() => {
                setCodeSent(false)
                setCode('')
                setNotice(null)
              }}
            >
              Trocar e-mail ou usuário
            </button>
          </div>
        </>
      )}

      {error && (
        <p className="mt-4 text-sm" style={{ color: '#d43b3b' }}>
          {error}
        </p>
      )}

      <p className="mt-6 text-center text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
        Já tem conta?{' '}
        <button type="button" className="min-h-10 underline" style={{ color: 'var(--color-primary)' }} onClick={onBack}>
          Voltar para o login
        </button>
      </p>
    </form>
  )
}
