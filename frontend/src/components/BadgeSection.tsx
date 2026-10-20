import { useEffect, useState, type FormEvent } from 'react'
import { api, ApiError, BLOOD_TYPES, type BadgeData } from '../api/client'
import { downloadBadges } from '../lib/badge'

const inputStyle = { border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }
const inputCls = 'w-full rounded-lg px-3.5 py-2.5 text-sm outline-none'

// "Meu crachá" no perfil (pedido do usuário, 2026-10-20): os dados do verso
// (sensíveis — só a pessoa e o administrador máximo veem) e o PDF pronto.
export function BadgeSection({ defaultTitle }: { defaultTitle: string }) {
  const [data, setData] = useState<BadgeData | null>(null)
  const [title, setTitle] = useState('')
  const [emName, setEmName] = useState('')
  const [emPhone, setEmPhone] = useState('')
  const [medical, setMedical] = useState('')
  const [blood, setBlood] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .getMyBadge()
      .then((b) => {
        setData(b)
        setTitle(b.badge_title)
        setEmName(b.emergency_contact_name)
        setEmPhone(b.emergency_contact_phone)
        setMedical(b.medical_notes)
        setBlood(b.blood_type)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os dados do crachá.'))
  }, [])

  async function save(): Promise<BadgeData | null> {
    setError(null)
    setMsg(null)
    try {
      await api.updateProfile({
        badge_title: title,
        emergency_contact_name: emName,
        emergency_contact_phone: emPhone,
        medical_notes: medical,
        blood_type: blood,
      })
      const b = await api.getMyBadge()
      setData(b)
      return b
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar os dados do crachá.')
      return null
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    if (await save()) setMsg('Dados do crachá salvos.')
    setBusy(false)
  }

  async function handleDownload() {
    setBusy(true)
    const b = await save()
    if (b) {
      try {
        await downloadBadges([b], 'meu-cracha-nqtr.pdf')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao gerar o PDF.')
      }
    }
    setBusy(false)
  }

  return (
    <form
      onSubmit={handleSave}
      className="mt-4 rounded-2xl border p-4 md:mt-6 md:p-5"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}
    >
      <div className="mb-1 text-[15px] font-semibold">Meu crachá</div>
      <p className="mb-4 text-[12.5px]" style={{ color: 'var(--color-text-muted)' }}>
        Frente: sua foto, o nome de exibição, o título e um QR code que salva seu contato no celular. Verso: telefone, e-mail e os
        dados abaixo. <strong>Contato de emergência, alergias e tipo sanguíneo são privados</strong> — só você e o administrador
        máximo veem; nunca aparecem no diretório.
      </p>

      <div className="mb-4">
        <label className="mb-1.5 block text-[13px] font-medium">Título no crachá</label>
        <input className={inputCls} style={inputStyle} value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} placeholder={defaultTitle || 'ex.: Professora, Doutorando'} />
        <p className="mt-1 text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>
          Em branco = {defaultTitle ? `"${defaultTitle}"` : 'sua qualificação'}. Útil para escrever no seu gênero (ex.: Professora).
        </p>
      </div>
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-[13px] font-medium">Contato de emergência — nome</label>
          <input className={inputCls} style={inputStyle} value={emName} maxLength={60} onChange={(e) => setEmName(e.target.value)} placeholder="ex.: Maria (mãe)" />
        </div>
        <div>
          <label className="mb-1.5 block text-[13px] font-medium">Contato de emergência — telefone</label>
          <input className={inputCls} style={inputStyle} value={emPhone} maxLength={30} onChange={(e) => setEmPhone(e.target.value)} placeholder="+55 21 99999-0000" />
        </div>
      </div>
      <div className="mb-4">
        <label className="mb-1.5 block text-[13px] font-medium">Alergias e condições médicas</label>
        <textarea className={inputCls} style={inputStyle} rows={2} value={medical} maxLength={160} onChange={(e) => setMedical(e.target.value)} placeholder="o que um socorrista precisa saber (deixe em branco se não houver)" />
        <p className="mt-1 text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>
          {medical.length}/160
        </p>
      </div>
      <div className="mb-4">
        <label className="mb-1.5 block text-[13px] font-medium">Tipo sanguíneo</label>
        <select className={inputCls} style={inputStyle} value={blood} onChange={(e) => setBlood(e.target.value)}>
          <option value="">— não informar —</option>
          {BLOOD_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="mb-4 text-sm" style={{ color: '#d43b3b' }}>
          {error}
        </p>
      )}
      {msg && !error && (
        <p className="mb-4 text-sm" style={{ color: 'var(--color-primary)' }}>
          {msg}
        </p>
      )}
      {data && !data.has_photo && (
        <p className="mb-4 text-[12.5px]" style={{ color: '#a3690f' }}>
          Sem foto de perfil: o crachá sai com as suas iniciais no círculo. Envie uma foto no alto da página.
        </p>
      )}

      <div className="flex flex-wrap gap-2.5">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
          style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}
        >
          Salvar dados do crachá
        </button>
        <button
          type="button"
          disabled={busy || !data}
          onClick={handleDownload}
          className="rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
          style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
        >
          {busy ? 'Gerando…' : 'Baixar meu crachá (PDF)'}
        </button>
      </div>
    </form>
  )
}
