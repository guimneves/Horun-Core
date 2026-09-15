import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, type Equipment, type EquipmentArea, type EquipmentType, type ModuleFull, type ModuleStatus } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { EquipmentPhoto } from '../components/EquipmentPhoto'
import { EquipmentQrCode } from '../components/EquipmentQrCode'
import { EquipmentWeekGrid } from '../components/EquipmentWeekGrid'
import { UsageLogSection } from '../components/UsageLogSection'
import { ChevronLeftIcon } from '../icons'

const field = 'w-full rounded-lg px-3 py-2 text-sm outline-none'
const fieldStyle = { border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }
const labelCls = 'mb-1 block text-xs font-medium'
const labelStyle = { color: 'var(--color-text-muted)' }

const TABS = ['Ficha de utilização', 'Agenda', 'Informações'] as const
type DetailTab = (typeof TABS)[number]

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}>
      {children}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="text-xs underline"
      style={{ color: 'var(--color-text-muted)' }}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          /* clipboard indisponível — sem feedback, sem quebrar nada */
        }
      }}
    >
      {copied ? 'copiado!' : 'copiar caminho'}
    </button>
  )
}

export function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = !!user?.is_super_admin
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [areas, setAreas] = useState<EquipmentArea[]>([])
  const [types, setTypes] = useState<EquipmentType[]>([])
  const [modules, setModules] = useState<ModuleStatus[]>([])
  const [moduleFulls, setModuleFulls] = useState<ModuleFull[]>([])
  const [loaded, setLoaded] = useState(false)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [anydesk, setAnydesk] = useState('')
  const [pop, setPop] = useState('')
  const [icon, setIcon] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [modelName, setModelName] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [assetTag, setAssetTag] = useState('')
  const [photoBusy, setPhotoBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<DetailTab>('Ficha de utilização')

  function reload() {
    Promise.all([api.listEquipment(), api.listEquipmentAreas(), api.listEquipmentTypes(), api.dashboardModules()])
      .then(([eq, ar, ty, mo]) => {
        setEquipment(eq)
        setAreas(ar)
        setTypes(ty)
        setModules(mo)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }
  useEffect(reload, [])
  useEffect(() => {
    if (isAdmin) api.listModules().then(setModuleFulls).catch(() => {})
  }, [isAdmin])

  const eq = equipment.find((e) => e.id === id) ?? null

  // Reidrata os campos locais quando o equipamento muda (não a cada
  // render — senão editar perderia o cursor a cada tecla).
  useEffect(() => {
    if (!eq) return
    setName(eq.display_name)
    setDescription(eq.description)
    setAnydesk(eq.anydesk_id)
    setPop(eq.pop_folder_path)
    setManufacturer(eq.manufacturer)
    setModelName(eq.model_name)
    setSerialNumber(eq.serial_number)
    setAssetTag(eq.asset_tag)
    setError(null)
  }, [eq?.id])

  const linkedModule = eq?.module_id ? modules.find((m) => m.id === eq.module_id) ?? null : null
  const linkedModuleFull = eq?.module_id ? moduleFulls.find((m) => m.id === eq.module_id) ?? null : null
  useEffect(() => setIcon(linkedModuleFull?.icon ?? ''), [linkedModuleFull?.icon, eq?.id])

  async function save(patch: Parameters<typeof api.updateEquipment>[1]) {
    if (!eq) return
    setError(null)
    try {
      await api.updateEquipment(eq.id, patch)
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar.')
    }
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !eq) return
    setPhotoBusy(true)
    setError(null)
    try {
      await api.uploadEquipmentPhoto(eq.id, file)
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao enviar a foto.')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function handleRemovePhoto() {
    if (!eq) return
    setPhotoBusy(true)
    try {
      await api.deleteEquipmentPhoto(eq.id)
      reload()
    } finally {
      setPhotoBusy(false)
    }
  }

  async function handleDelete() {
    if (!eq || !confirm(`Remover "${eq.display_name}"? Isto não apaga o histórico de reservas.`)) return
    await api.deleteEquipment(eq.id)
    navigate('/equipamentos')
  }

  if (loaded && !eq) {
    return (
      <div className="p-6">
        <p style={{ color: 'var(--color-text-muted)' }}>Equipamento não encontrado.</p>
        <button onClick={() => navigate('/equipamentos')} className="mt-3 text-sm underline" style={{ color: 'var(--color-primary)' }}>
          ← Voltar
        </button>
      </div>
    )
  }
  if (!eq) return null

  return (
    <div className="mx-auto max-w-[980px] p-6">
      <button
        onClick={() => navigate('/equipamentos')}
        className="mb-4 flex items-center gap-1.5 text-sm"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <ChevronLeftIcon width={14} height={14} />
        Equipamentos
      </button>

      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div style={{ viewTransitionName: `equipment-photo-${eq.id}` }}>
            <EquipmentPhoto equipmentId={eq.id} color={eq.color} hasPhoto={eq.has_photo} size={72} />
          </div>
          <div>
            {isAdmin ? (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => name !== eq.display_name && save({ display_name: name })}
                className="-mx-1 rounded px-1 text-2xl font-semibold outline-none"
                style={{ background: 'transparent' }}
              />
            ) : (
              <div className="text-2xl font-semibold">{eq.display_name}</div>
            )}
            <div className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {areas.find((a) => a.id === eq.area_id)?.name ?? 'Sem área'}
            </div>
          </div>
        </div>

        {isAdmin && (
          <div className="flex flex-col items-end gap-1.5">
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoChange} />
            <div className="flex gap-2.5 text-xs">
              <button disabled={photoBusy} className="underline" style={{ color: 'var(--color-primary)' }} onClick={() => fileInputRef.current?.click()}>
                {eq.has_photo ? 'trocar foto' : 'enviar foto'}
              </button>
              {eq.has_photo && (
                <button disabled={photoBusy} className="underline" style={{ color: 'var(--color-text-muted)' }} onClick={handleRemovePhoto}>
                  remover foto
                </button>
              )}
            </div>
            <button onClick={handleDelete} className="text-xs underline" style={{ color: '#d43b3b' }}>
              remover equipamento
            </button>
          </div>
        )}
      </div>

      {error && <p className="mb-4 text-xs" style={{ color: '#d43b3b' }}>{error}</p>}

      <div className="mb-5 flex gap-6" style={{ borderBottom: '1px solid var(--color-border)' }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="pb-2.5 pt-1 text-[13.5px]"
            style={{
              color: tab === t ? 'var(--color-primary)' : 'var(--color-text-muted)',
              fontWeight: tab === t ? 600 : 400,
              borderBottom: tab === t ? '2px solid var(--color-primary)' : '2px solid transparent',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Ficha de utilização' && (
        <Card>
          <UsageLogSection equipmentId={eq.id} />
        </Card>
      )}

      {tab === 'Agenda' && <EquipmentWeekGrid equipment={eq} />}

      {tab === 'Informações' && (
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Card>
          <label className={labelCls} style={labelStyle}>Área</label>
          {isAdmin ? (
            <select
              value={eq.area_id ?? ''}
              onChange={(e) => save(e.target.value ? { area_id: Number(e.target.value) } : { clear_area: true })}
              className={`mb-4 ${field}`}
              style={fieldStyle}
            >
              <option value="">Sem área</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          ) : (
            <p className="mb-4 text-sm">{areas.find((a) => a.id === eq.area_id)?.name ?? 'Sem área'}</p>
          )}

          <label className={labelCls} style={labelStyle}>Tipo</label>
          {isAdmin ? (
            <select
              value={eq.type_id ?? ''}
              onChange={(e) => save(e.target.value ? { type_id: Number(e.target.value) } : { clear_type: true })}
              className={`mb-4 ${field}`}
              style={fieldStyle}
            >
              <option value="">Sem tipo</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          ) : (
            <p className="mb-4 text-sm">{types.find((t) => t.id === eq.type_id)?.name ?? 'Sem tipo'}</p>
          )}

          <label className={labelCls} style={labelStyle}>Descrição</label>
          {isAdmin ? (
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => description !== eq.description && save({ description })}
              rows={4}
              placeholder="O que é, pra que serve, particularidades de uso…"
              className={field}
              style={fieldStyle}
            />
          ) : (
            <p className="text-sm" style={{ color: eq.description ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
              {eq.description || 'Sem descrição.'}
            </p>
          )}
        </Card>

        <Card>
          <label className={labelCls} style={labelStyle}>AnyDesk</label>
          {isAdmin && (
            <input
              value={anydesk}
              onChange={(e) => setAnydesk(e.target.value)}
              onBlur={() => anydesk !== eq.anydesk_id && save({ anydesk_id: anydesk })}
              placeholder="ex.: 123 456 789"
              className={`mb-2 ${field}`}
              style={fieldStyle}
            />
          )}
          <div className="mb-4">
            {eq.anydesk_id ? (
              <a href={`anydesk:${eq.anydesk_id.replace(/\s+/g, '')}`} className="text-sm font-medium underline" style={{ color: 'var(--color-primary)' }}>
                Conectar via AnyDesk
              </a>
            ) : (
              !isAdmin && <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Não cadastrado.</p>
            )}
          </div>

          <label className={labelCls} style={labelStyle}>Pasta de POPs (nqtrmaster)</label>
          {isAdmin && (
            <input
              value={pop}
              onChange={(e) => setPop(e.target.value)}
              onBlur={() => pop !== eq.pop_folder_path && save({ pop_folder_path: pop })}
              placeholder={String.raw`\\nqtrmaster\Compartilhamento\POPs\...`}
              className={`mb-2 ${field}`}
              style={fieldStyle}
            />
          )}
          {eq.pop_folder_path ? (
            <div>
              <p className="mb-1 break-all rounded px-2 py-1 font-mono text-xs" style={{ background: 'var(--color-surface)' }}>
                {eq.pop_folder_path}
              </p>
              <div className="flex items-center gap-2">
                <CopyButton text={eq.pop_folder_path} />
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>— cole no Explorer (Win+E)</span>
              </div>
            </div>
          ) : (
            !isAdmin && <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Não cadastrada.</p>
          )}
        </Card>

        <Card>
          <label className={labelCls} style={labelStyle}>Módulo vinculado</label>
          {isAdmin && (
            <select
              value={eq.module_id ?? ''}
              onChange={(e) => save(e.target.value ? { module_id: e.target.value } : { clear_module: true })}
              className={`mb-2 ${field}`}
              style={fieldStyle}
            >
              <option value="">Nenhum</option>
              {moduleFulls.map((m) => (
                <option key={m.id} value={m.id}>{m.display_name}</option>
              ))}
            </select>
          )}
          {linkedModule ? (
            <div className="flex items-center gap-2.5">
              {isAdmin ? (
                <input
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  onBlur={() => {
                    if (!linkedModuleFull || icon === linkedModuleFull.icon) return
                    api.updateModule(linkedModuleFull.id, { ...linkedModuleFull, icon }).then(reload)
                  }}
                  className="w-9 rounded-lg px-1.5 py-1 text-center text-lg"
                  style={fieldStyle}
                  title="Ícone do módulo"
                />
              ) : (
                <span className="text-lg">{linkedModule.icon}</span>
              )}
              <span className="text-sm font-medium">Horun · {linkedModule.display_name}</span>
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Sem módulo de software vinculado.</p>
          )}
          {linkedModule && (
            <div className="mt-2">
              {linkedModule.has_access ? (
                linkedModule.embeddable ? (
                  <a href={`/m/${linkedModule.id}/`} className="text-sm font-medium underline" style={{ color: 'var(--color-primary)' }}>
                    Abrir módulo
                  </a>
                ) : (
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    Módulo ainda sem interface embutida no Core.
                  </span>
                )
              ) : (
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Sem permissão para abrir — solicite ao administrador.</span>
              )}
            </div>
          )}
        </Card>

        <Card>
          <label className={labelCls} style={labelStyle}>Fabricante</label>
          {isAdmin ? (
            <input
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              onBlur={() => manufacturer !== eq.manufacturer && save({ manufacturer })}
              placeholder="ex.: Shimadzu"
              className={`mb-3 ${field}`}
              style={fieldStyle}
            />
          ) : (
            <p className="mb-3 text-sm" style={{ color: eq.manufacturer ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
              {eq.manufacturer || '—'}
            </p>
          )}

          <label className={labelCls} style={labelStyle}>Modelo</label>
          {isAdmin ? (
            <input
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              onBlur={() => modelName !== eq.model_name && save({ model_name: modelName })}
              placeholder="ex.: GC 2014"
              className={`mb-3 ${field}`}
              style={fieldStyle}
            />
          ) : (
            <p className="mb-3 text-sm" style={{ color: eq.model_name ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
              {eq.model_name || '—'}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} style={labelStyle}>Número de série</label>
              {isAdmin ? (
                <input
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  onBlur={() => serialNumber !== eq.serial_number && save({ serial_number: serialNumber })}
                  className={field}
                  style={fieldStyle}
                />
              ) : (
                <p className="text-sm" style={{ color: eq.serial_number ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
                  {eq.serial_number || '—'}
                </p>
              )}
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Patrimônio</label>
              {isAdmin ? (
                <input
                  value={assetTag}
                  onChange={(e) => setAssetTag(e.target.value)}
                  onBlur={() => assetTag !== eq.asset_tag && save({ asset_tag: assetTag })}
                  className={field}
                  style={fieldStyle}
                />
              ) : (
                <p className="text-sm" style={{ color: eq.asset_tag ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
                  {eq.asset_tag || '—'}
                </p>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <label className={labelCls} style={labelStyle}>QR code</label>
          <p className="mb-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Imprima e cole na bancada — aponta direto pra esta página.
          </p>
          <EquipmentQrCode equipmentName={eq.display_name} />
        </Card>
      </div>
      )}
    </div>
  )
}
