import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError, type Equipment, type EquipmentArea, type EquipmentLog, type ModuleFull, type ModuleStatus } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { EquipmentPhoto } from '../components/EquipmentPhoto'
import { timeAgo } from '../lib/datetime'

const field = 'w-full rounded-lg px-3 py-2 text-sm outline-none'
const fieldStyle = { border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }
const labelCls = 'mb-1 block text-xs font-medium'
const labelStyle = { color: 'var(--color-text-muted)' }

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

function UsageLogSection({ equipmentId }: { equipmentId: string }) {
  const { user } = useAuth()
  const [logs, setLogs] = useState<EquipmentLog[]>([])
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    api.listEquipmentLogs(equipmentId).then(setLogs).catch(() => {})
  }
  useEffect(reload, [equipmentId])

  async function handleAdd() {
    if (!draft.trim()) return
    setBusy(true)
    setError(null)
    try {
      await api.createEquipmentLog(equipmentId, draft.trim())
      setDraft('')
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível registrar.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveEdit(logId: number) {
    if (!editText.trim()) return
    try {
      await api.updateEquipmentLog(equipmentId, logId, editText.trim())
      setEditingId(null)
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar.')
    }
  }

  async function handleDelete(logId: number) {
    if (!confirm('Remover este registro?')) return
    await api.deleteEquipmentLog(equipmentId, logId)
    reload()
  }

  return (
    <div>
      <label className={labelCls} style={labelStyle}>Registro de uso</label>
      <p className="mb-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        Anote aqui o que foi feito — ainda não sincronizado com o histórico interno do módulo.
      </p>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={2}
        placeholder="ex.: rodada de pirólise, amostras 1-10…"
        className={`mb-2 ${field}`}
        style={fieldStyle}
      />
      <button
        onClick={handleAdd}
        disabled={busy || !draft.trim()}
        className="mb-3 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
      >
        Registrar
      </button>
      {error && <p className="mb-2 text-xs" style={{ color: '#d43b3b' }}>{error}</p>}

      <div className="flex flex-col gap-2.5">
        {logs.length === 0 && (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Nenhum registro ainda.</p>
        )}
        {logs.map((log) => {
          const canEdit = log.user_id === user?.id || !!user?.is_super_admin
          return (
            <div key={log.id} className="rounded-lg p-2.5 text-xs" style={{ background: 'var(--color-surface)' }}>
              <div className="mb-1 flex items-center justify-between" style={{ color: 'var(--color-text-muted)' }}>
                <span>
                  <strong>{log.user_display_name}</strong> · {timeAgo(log.occurred_at)}
                </span>
                {canEdit && editingId !== log.id && (
                  <span className="flex gap-2">
                    <button onClick={() => { setEditingId(log.id); setEditText(log.description) }} className="underline">
                      editar
                    </button>
                    <button onClick={() => handleDelete(log.id)} className="underline" style={{ color: '#d43b3b' }}>
                      remover
                    </button>
                  </span>
                )}
              </div>
              {editingId === log.id ? (
                <div>
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={2}
                    className={`mb-1.5 ${field}`}
                    style={fieldStyle}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => handleSaveEdit(log.id)} className="underline" style={{ color: 'var(--color-primary)' }}>
                      salvar
                    </button>
                    <button onClick={() => setEditingId(null)} style={{ color: 'var(--color-text-muted)' }}>
                      cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <p>{log.description}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DetailPanel({
  eq,
  areas,
  modules,
  moduleFulls,
  isAdmin,
  onChange,
  onClose,
  onGoToAgenda,
}: {
  eq: Equipment
  areas: EquipmentArea[]
  modules: ModuleStatus[]
  moduleFulls: ModuleFull[]
  isAdmin: boolean
  onChange: () => void
  onClose: () => void
  onGoToAgenda: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(eq.display_name)
  const [description, setDescription] = useState(eq.description)
  const [anydesk, setAnydesk] = useState(eq.anydesk_id)
  const [pop, setPop] = useState(eq.pop_folder_path)
  const [icon, setIcon] = useState('')
  const [photoBusy, setPhotoBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reidrata os campos locais quando o equipamento selecionado muda (não
  // a cada render) — sem isto, editar um e clicar em outro manteria o
  // texto do anterior até o próximo reload.
  useEffect(() => {
    setName(eq.display_name)
    setDescription(eq.description)
    setAnydesk(eq.anydesk_id)
    setPop(eq.pop_folder_path)
    setError(null)
  }, [eq.id])

  const linkedModule = eq.module_id ? modules.find((m) => m.id === eq.module_id) ?? null : null
  const linkedModuleFull = eq.module_id ? moduleFulls.find((m) => m.id === eq.module_id) ?? null : null
  useEffect(() => setIcon(linkedModuleFull?.icon ?? ''), [linkedModuleFull?.icon, eq.id])

  async function save(patch: Parameters<typeof api.updateEquipment>[1]) {
    setError(null)
    try {
      await api.updateEquipment(eq.id, patch)
      onChange()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar.')
    }
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhotoBusy(true)
    setError(null)
    try {
      await api.uploadEquipmentPhoto(eq.id, file)
      onChange()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao enviar a foto.')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function handleRemovePhoto() {
    setPhotoBusy(true)
    try {
      await api.deleteEquipmentPhoto(eq.id)
      onChange()
    } finally {
      setPhotoBusy(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Remover "${eq.display_name}"? Isto não apaga o histórico de reservas.`)) return
    await api.deleteEquipment(eq.id)
    onChange()
    onClose()
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <EquipmentPhoto equipmentId={eq.id} color={eq.color} hasPhoto={eq.has_photo} size={48} />
          <div>
            {isAdmin ? (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => name !== eq.display_name && save({ display_name: name })}
                className="rounded px-1 -mx-1 text-base font-semibold outline-none"
                style={{ background: 'transparent' }}
              />
            ) : (
              <div className="text-base font-semibold">{eq.display_name}</div>
            )}
          </div>
        </div>
        <button onClick={onClose} className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          fechar
        </button>
      </div>

      {isAdmin && (
        <div>
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
        </div>
      )}

      <button
        onClick={onGoToAgenda}
        className="rounded-lg px-3.5 py-2 text-sm font-semibold"
        style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
      >
        Ver na agenda
      </button>

      <div>
        <label className={labelCls} style={labelStyle}>Área</label>
        {isAdmin ? (
          <select
            value={eq.area_id ?? ''}
            onChange={(e) => save(e.target.value ? { area_id: Number(e.target.value) } : { clear_area: true })}
            className={field}
            style={fieldStyle}
          >
            <option value="">Sem área</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        ) : (
          <p className="text-sm">{areas.find((a) => a.id === eq.area_id)?.name ?? 'Sem área'}</p>
        )}
      </div>

      <div>
        <label className={labelCls} style={labelStyle}>Descrição</label>
        {isAdmin ? (
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => description !== eq.description && save({ description })}
            rows={3}
            placeholder="O que é, pra que serve, particularidades de uso…"
            className={field}
            style={fieldStyle}
          />
        ) : (
          <p className="text-sm" style={{ color: eq.description ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
            {eq.description || 'Sem descrição.'}
          </p>
        )}
      </div>

      <div>
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
        {eq.anydesk_id ? (
          <a href={`anydesk:${eq.anydesk_id.replace(/\s+/g, '')}`} className="text-sm font-medium underline" style={{ color: 'var(--color-primary)' }}>
            Conectar via AnyDesk
          </a>
        ) : (
          !isAdmin && <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Não cadastrado.</p>
        )}
      </div>

      <div>
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
      </div>

      <div>
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
                  api.updateModule(linkedModuleFull.id, { ...linkedModuleFull, icon }).then(onChange)
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
      </div>

      <UsageLogSection equipmentId={eq.id} />

      {error && <p className="text-xs" style={{ color: '#d43b3b' }}>{error}</p>}

      {isAdmin && (
        <button onClick={handleDelete} className="text-xs" style={{ color: '#d43b3b' }}>
          remover equipamento
        </button>
      )}
    </div>
  )
}

export function EquipmentPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [areas, setAreas] = useState<EquipmentArea[]>([])
  const [modules, setModules] = useState<ModuleStatus[]>([])
  const [moduleFulls, setModuleFulls] = useState<ModuleFull[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const isAdmin = !!user?.is_super_admin

  function reload() {
    api.listEquipment().then(setEquipment).catch(() => {})
    api.listEquipmentAreas().then(setAreas).catch(() => {})
    api.dashboardModules().then(setModules).catch(() => {})
  }
  useEffect(reload, [])
  useEffect(() => {
    if (isAdmin) api.listModules().then(setModuleFulls).catch(() => {})
  }, [isAdmin])

  const selected = equipment.find((e) => e.id === selectedId) ?? null

  const sections = useMemo(() => {
    const byArea = new Map<number | 'none', Equipment[]>()
    for (const eq of equipment) {
      const key = eq.area_id ?? 'none'
      if (!byArea.has(key)) byArea.set(key, [])
      byArea.get(key)!.push(eq)
    }
    const named = areas
      .map((a) => ({ key: a.id as number | 'none', name: a.name, items: byArea.get(a.id) ?? [] }))
      .filter((s) => s.items.length > 0)
    const rest = byArea.get('none') ?? []
    return rest.length > 0 ? [...named, { key: 'none' as const, name: 'Sem área', items: rest }] : named
  }, [equipment, areas])

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-y-auto p-6">
        <h2 className="mb-5 text-lg font-semibold">Equipamentos</h2>

        {equipment.length === 0 && (
          <p style={{ color: 'var(--color-text-muted)' }}>
            Nenhum equipamento cadastrado ainda{isAdmin ? ' — cadastre em Administração → Equipamentos.' : '.'}
          </p>
        )}

        {sections.map((section) => (
          <div key={section.key} className="mb-7">
            <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>
              {section.name}
            </h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {section.items.map((eq) => (
                <button
                  key={eq.id}
                  onClick={() => setSelectedId(eq.id)}
                  className="flex flex-col items-start gap-2.5 rounded-xl border p-4 text-left"
                  style={{
                    borderColor: selectedId === eq.id ? 'var(--color-primary)' : 'var(--color-border)',
                    background: 'var(--color-bg-elevated)',
                  }}
                >
                  <EquipmentPhoto equipmentId={eq.id} color={eq.color} hasPhoto={eq.has_photo} size={48} />
                  <div className="font-medium">{eq.display_name}</div>
                  {eq.description && (
                    <div className="line-clamp-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {eq.description}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex w-[320px] flex-shrink-0 flex-col overflow-y-auto p-5" style={{ borderLeft: '1px solid var(--color-border)' }}>
        {selected ? (
          <DetailPanel
            key={selected.id}
            eq={selected}
            areas={areas}
            modules={modules}
            moduleFulls={moduleFulls}
            isAdmin={isAdmin}
            onChange={reload}
            onClose={() => setSelectedId(null)}
            onGoToAgenda={() => navigate(`/agenda?eq=${selected.id}`)}
          />
        ) : (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Selecione um equipamento pra ver detalhes.
          </p>
        )}
      </div>
    </div>
  )
}
