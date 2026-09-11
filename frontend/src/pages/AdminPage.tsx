import { useEffect, useState } from 'react'
import {
  api,
  ApiError,
  POSITIONS,
  QUALIFICATIONS,
  type CurrentUser,
  type Equipment,
  type EquipmentArea,
  type Group,
  type GroupMember,
  type ModuleAccessEntry,
  type ModuleFull,
} from '../api/client'
import { Avatar } from '../components/Avatar'

const TABS = ['Usuários', 'Grupos', 'Módulos', 'Equipamentos', 'Permissões'] as const
type Tab = (typeof TABS)[number]

// Nome de usuário tem que ser um slug (sem espaço, sem acento) — senão a
// menção `@usuario` quebra no espaço e a pessoa não é notificada.
function slugifyUsername(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tira acento
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/\.{2,}/g, '.')
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex-1 overflow-hidden rounded-2xl border"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}
    >
      <table className="w-full border-collapse">{children}</table>
    </div>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={'px-4.5 py-3 text-[11.5px] font-semibold uppercase ' + (right ? 'text-right' : 'text-left')}
      style={{ color: 'var(--color-text-muted)', letterSpacing: '0.03em', borderBottom: '1px solid var(--color-border)' }}
    >
      {children}
    </th>
  )
}

function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <td className={'px-4.5 py-3 text-[13.5px] ' + (right ? 'text-right' : 'text-left')} style={{ borderBottom: '1px solid var(--color-border)' }}>
      {children}
    </td>
  )
}

function CreatePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="w-[300px] flex-shrink-0 rounded-2xl border p-5" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}>
      <div className="mb-4 text-[14.5px] font-semibold">{title}</div>
      {children}
    </div>
  )
}

function FieldInput(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...rest } = props
  return (
    <div className="mb-3.5">
      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </label>
      <input
        {...rest}
        className="w-full rounded-lg px-3 py-2 text-[13px] outline-none"
        style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}
      />
    </div>
  )
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: readonly string[]
  placeholder: string
}) {
  return (
    <div className="mb-3.5">
      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg px-3 py-2 text-[13px] outline-none"
        style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  )
}

function PrimaryButton({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="w-full rounded-lg py-2.5 text-[13px] font-semibold disabled:opacity-50"
      style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
    >
      {children}
    </button>
  )
}

function SmallSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  options: readonly string[]
  placeholder: string
  disabled?: boolean
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md px-2 py-1 text-xs outline-none disabled:opacity-50"
      style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  )
}

function UsersTab({ users, onChange }: { users: CurrentUser[]; onChange: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [position, setPosition] = useState('')
  const [qualification, setQualification] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [justCreated, setJustCreated] = useState<{ username: string; code: string } | null>(null)
  const [regenerated, setRegenerated] = useState<{ username: string; code: string } | null>(null)

  async function handleCreate() {
    setError(null)
    setJustCreated(null)
    try {
      const created = await api.createUser({
        username,
        password: password || undefined,
        position: position || undefined,
        qualification: qualification || undefined,
      })
      setUsername('')
      setPassword('')
      setPosition('')
      setQualification('')
      if (created.setup_code) setJustCreated({ username: created.username, code: created.setup_code })
      onChange()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao criar usuário.')
    }
  }

  async function handleRegenerate(u: CurrentUser) {
    const updated = await api.regenerateSetupCode(u.id)
    if (updated.setup_code) setRegenerated({ username: updated.username, code: updated.setup_code })
    onChange()
  }

  async function handleRename(u: CurrentUser) {
    const raw = window.prompt(
      `Novo nome de usuário para "${u.display_name || u.username}" (sem espaço, sem acento):`,
      u.username,
    )
    if (!raw) return
    const next = slugifyUsername(raw)
    if (!next || next === u.username) return
    setError(null)
    try {
      await api.updateUser(u.id, { username: next })
      onChange()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível renomear.')
    }
  }

  return (
    <div className="flex gap-5">
      <div className="flex-1">
        {(justCreated || regenerated) && (
          <div
            className="mb-4 rounded-xl border p-4 text-[13px]"
            style={{ borderColor: 'var(--color-primary)', background: 'var(--color-bg-elevated)' }}
          >
            <div className="mb-1 font-semibold">
              Código de primeiro acesso para <strong>{(justCreated ?? regenerated)!.username}</strong>
            </div>
            <div className="mb-2" style={{ color: 'var(--color-text-muted)' }}>
              Passe este código para a pessoa. Em "Primeiro acesso" na tela de login, ela usa o usuário e o código
              para definir a própria senha.
            </div>
            <div className="flex items-center gap-3">
              <code
                className="rounded-lg px-3 py-1.5 text-base font-bold tracking-widest"
                style={{ background: 'var(--color-surface)', color: 'var(--color-primary)' }}
              >
                {(justCreated ?? regenerated)!.code}
              </code>
              <button
                className="text-xs"
                style={{ color: 'var(--color-text-muted)' }}
                onClick={() => {
                  setJustCreated(null)
                  setRegenerated(null)
                }}
              >
                dispensar
              </button>
            </div>
          </div>
        )}

        <Table>
          <thead>
            <tr>
              <Th>Usuário</Th>
              <Th>Posição</Th>
              <Th>Qualificação</Th>
              <Th>Papel</Th>
              <Th>Status</Th>
              <Th right>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={u.display_name || u.username} size={30} userId={u.id} />
                    <div className="min-w-0">
                      <div className="font-medium">{u.display_name || u.username}</div>
                      <div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                        @{u.username}
                      </div>
                    </div>
                  </div>
                </Td>
                <Td>
                  <SmallSelect
                    value={u.position}
                    disabled={u.is_protected}
                    placeholder="—"
                    options={POSITIONS}
                    onChange={(value) => api.updateUser(u.id, { position: value }).then(onChange)}
                  />
                </Td>
                <Td>
                  <SmallSelect
                    value={u.qualification}
                    disabled={u.is_protected}
                    placeholder="—"
                    options={QUALIFICATIONS}
                    onChange={(value) => api.updateUser(u.id, { qualification: value }).then(onChange)}
                  />
                </Td>
                <Td>
                  {u.is_super_admin ? (
                    <span
                      className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
                      style={{ color: 'var(--color-primary)', background: 'var(--color-surface)' }}
                    >
                      Administrador máximo
                    </span>
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)' }}>Usuário</span>
                  )}
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    {u.is_protected && (
                      <span
                        className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
                        style={{ color: 'var(--color-text-muted)', background: 'var(--color-surface)' }}
                      >
                        Protegida
                      </span>
                    )}
                    {u.setup_code && (
                      <span
                        className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
                        style={{ color: '#a3690f', background: 'var(--color-surface)' }}
                      >
                        Aguardando 1º acesso
                      </span>
                    )}
                  </div>
                </Td>
                <Td right>
                  <div className="flex items-center justify-end gap-3">
                    {!u.is_protected && (
                      <button
                        className="text-xs"
                        style={{ color: 'var(--color-text-muted)' }}
                        onClick={() => api.updateUser(u.id, { is_super_admin: !u.is_super_admin }).then(onChange)}
                      >
                        {u.is_super_admin ? 'remover admin' : 'tornar admin'}
                      </button>
                    )}
                    {!u.is_protected && (
                      <button className="text-xs" style={{ color: 'var(--color-text-muted)' }} onClick={() => handleRename(u)}>
                        renomear
                      </button>
                    )}
                    {!u.is_protected && (
                      <button className="text-xs" style={{ color: 'var(--color-text-muted)' }} onClick={() => handleRegenerate(u)}>
                        {u.setup_code ? 'ver código' : 'gerar novo acesso'}
                      </button>
                    )}
                    {!u.is_protected && (
                      <button className="text-xs" style={{ color: '#d43b3b' }} onClick={() => api.deleteUser(u.id).then(onChange)}>
                        remover
                      </button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <CreatePanel title="Novo usuário">
        <FieldInput
          label="Usuário"
          placeholder="usuario.sobrenome"
          value={username}
          onChange={(e) => setUsername(slugifyUsername(e.target.value))}
        />
        <p className="-mt-2 mb-3 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          Sem espaço e sem acento — é o que a pessoa digita pra entrar e o que vai depois do @ nas menções.
        </p>
        <FieldInput
          label="Senha provisória (opcional)"
          type="password"
          placeholder="deixe em branco p/ código de acesso"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <FieldSelect label="Posição" value={position} onChange={setPosition} options={POSITIONS} placeholder="Selecione…" />
        <FieldSelect
          label="Qualificação"
          value={qualification}
          onChange={setQualification}
          options={QUALIFICATIONS}
          placeholder="Selecione…"
        />
        {error && (
          <p className="mb-3 text-xs" style={{ color: '#d43b3b' }}>
            {error}
          </p>
        )}
        <PrimaryButton onClick={handleCreate} disabled={!username}>
          Criar usuário
        </PrimaryButton>
      </CreatePanel>
    </div>
  )
}

function ModulesTab({ modules, onChange }: { modules: ModuleFull[]; onChange: () => void }) {
  const [id, setId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [frontendUrl, setFrontendUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setError(null)
    try {
      await api.createModule({
        id,
        display_name: displayName,
        description: '',
        icon: '🧪',
        internal_base_url: baseUrl,
        health_path: '/health',
        internal_frontend_url: frontendUrl,
      })
      setId('')
      setDisplayName('')
      setBaseUrl('')
      setFrontendUrl('')
      onChange()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao cadastrar módulo.')
    }
  }

  return (
    <div className="flex gap-5">
      <Table>
        <thead>
          <tr>
            <Th>Módulo</Th>
            <Th>URL interna</Th>
            <Th right>Ações</Th>
          </tr>
        </thead>
        <tbody>
          {modules.map((m) => (
            <tr key={m.id}>
              <Td>
                <span className="font-medium">{m.display_name}</span>
              </Td>
              <Td>
                <code className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {m.internal_base_url}
                </code>
              </Td>
              <Td right>
                <button className="text-xs" style={{ color: '#d43b3b' }} onClick={() => api.deleteModule(m.id).then(onChange)}>
                  remover
                </button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <CreatePanel title="Cadastrar módulo">
        <FieldInput label="Id (slug)" placeholder="ex.: re7s" value={id} onChange={(e) => setId(e.target.value)} />
        <FieldInput label="Nome público" placeholder="ex.: RE7S" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <FieldInput label="URL interna (backend)" placeholder="http://<container>:8000" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        <FieldInput
          label="URL interna (frontend, opcional)"
          placeholder="http://<container>:80"
          value={frontendUrl}
          onChange={(e) => setFrontendUrl(e.target.value)}
        />
        {error && (
          <p className="mb-3 text-xs" style={{ color: '#d43b3b' }}>
            {error}
          </p>
        )}
        <PrimaryButton onClick={handleCreate} disabled={!id || !displayName || !baseUrl}>
          Cadastrar módulo
        </PrimaryButton>
      </CreatePanel>
    </div>
  )
}

function EquipmentTab({
  equipment,
  onChange,
  areas,
  onAreasChange,
}: {
  equipment: Equipment[]
  onChange: () => void
  areas: EquipmentArea[]
  onAreasChange: () => void
}) {
  const [id, setId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [color, setColor] = useState('#15216f')
  const [areaId, setAreaId] = useState('')
  const [newAreaName, setNewAreaName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setError(null)
    try {
      await api.createEquipment({ id, display_name: displayName, color, area_id: areaId ? Number(areaId) : undefined })
      setId('')
      setDisplayName('')
      setAreaId('')
      onChange()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao cadastrar equipamento.')
    }
  }

  async function handleCreateArea() {
    if (!newAreaName.trim()) return
    await api.createEquipmentArea(newAreaName.trim())
    setNewAreaName('')
    onAreasChange()
  }

  async function handleRenameArea(a: EquipmentArea) {
    const next = window.prompt('Novo nome da área:', a.name)
    if (!next || next === a.name) return
    await api.updateEquipmentArea(a.id, next)
    onAreasChange()
  }

  async function handleDeleteArea(a: EquipmentArea) {
    if (!confirm(`Remover a área "${a.name}"? Os equipamentos dela ficam sem área.`)) return
    await api.deleteEquipmentArea(a.id)
    onAreasChange()
    onChange()
  }

  return (
    <div className="flex gap-5">
      <div className="flex-1">
        <Table>
          <thead>
            <tr>
              <Th>Equipamento</Th>
              <Th>Área</Th>
              <Th right>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {equipment.map((eq) => (
              <tr key={eq.id}>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <div className="h-3.5 w-3.5 flex-shrink-0 rounded" style={{ background: eq.color }} />
                    <span className="font-medium">{eq.display_name}</span>
                  </div>
                </Td>
                <Td>{areas.find((a) => a.id === eq.area_id)?.name ?? '—'}</Td>
                <Td right>
                  <button className="text-xs" style={{ color: '#d43b3b' }} onClick={() => api.deleteEquipment(eq.id).then(onChange)}>
                    remover
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>

        <div className="mt-6 text-[13px] font-semibold">Áreas do laboratório</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {areas.map((a) => (
            <span
              key={a.id}
              className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
              style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)' }}
            >
              {a.name}
              <button onClick={() => handleRenameArea(a)} style={{ color: 'var(--color-text-muted)' }}>
                editar
              </button>
              <button onClick={() => handleDeleteArea(a)} style={{ color: '#d43b3b' }}>
                remover
              </button>
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <input
              value={newAreaName}
              onChange={(e) => setNewAreaName(e.target.value)}
              placeholder="nova área…"
              className="rounded-full px-3 py-1.5 text-xs outline-none"
              style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}
            />
            <button onClick={handleCreateArea} className="text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>
              + adicionar
            </button>
          </span>
        </div>
      </div>

      <CreatePanel title="Cadastrar equipamento">
        <FieldInput label="Id (slug)" placeholder="ex.: leco832" value={id} onChange={(e) => setId(e.target.value)} />
        <FieldInput label="Nome" placeholder="ex.: LECO 832" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <div className="mb-3.5">
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
            Área
          </label>
          <select
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
          >
            <option value="">Sem área</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div className="mb-3.5">
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
            Cor na agenda
          </label>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-full rounded-lg" style={{ background: 'var(--color-surface)' }} />
        </div>
        {error && (
          <p className="mb-3 text-xs" style={{ color: '#d43b3b' }}>
            {error}
          </p>
        )}
        <PrimaryButton onClick={handleCreate} disabled={!id || !displayName}>
          Cadastrar equipamento
        </PrimaryButton>
        <p className="mt-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Descrição, foto, AnyDesk, pasta de POPs e módulo vinculado ficam na página{' '}
          <strong>Equipamentos</strong>, no menu lateral.
        </p>
      </CreatePanel>
    </div>
  )
}

function PermissionsTab({ modules, users }: { modules: ModuleFull[]; users: CurrentUser[] }) {
  const [moduleId, setModuleId] = useState('')
  const [access, setAccess] = useState<ModuleAccessEntry[]>([])
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)

  useEffect(() => {
    if (moduleId) api.listModuleAccess(moduleId).then(setAccess)
    else setAccess([])
  }, [moduleId])

  function reloadAccess() {
    if (moduleId) api.listModuleAccess(moduleId).then(setAccess)
  }

  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}>
      <select
        className="mb-4 rounded-lg px-3 py-2 text-sm outline-none"
        style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}
        value={moduleId}
        onChange={(e) => setModuleId(e.target.value)}
      >
        <option value="">Selecione um módulo…</option>
        {modules.map((m) => (
          <option key={m.id} value={m.id}>
            {m.display_name}
          </option>
        ))}
      </select>

      {moduleId && (
        <>
          <ul className="mb-4 divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {access.map((a) => (
              <li key={a.user_id} className="flex items-center justify-between py-2 text-sm">
                <span>{a.username}</span>
                <button className="text-xs" style={{ color: '#d43b3b' }} onClick={() => api.revokeModuleAccess(moduleId, a.user_id).then(reloadAccess)}>
                  revogar
                </button>
              </li>
            ))}
            {access.length === 0 && (
              <li className="py-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                Ninguém com acesso ainda.
              </li>
            )}
          </ul>

          <div className="flex gap-2">
            <select
              className="rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}
              value={selectedUserId ?? ''}
              onChange={(e) => setSelectedUserId(Number(e.target.value) || null)}
            >
              <option value="">Selecione um usuário…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username}
                </option>
              ))}
            </select>
            <button
              className="rounded-lg px-4 py-2 text-[13px] font-semibold"
              style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast)' }}
              onClick={() => selectedUserId && api.grantModuleAccess(moduleId, selectedUserId).then(reloadAccess)}
            >
              Conceder acesso
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function GroupsTab({ users }: { users: CurrentUser[] }) {
  const [groups, setGroups] = useState<Group[]>([])
  const [selected, setSelected] = useState<Group | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [color, setColor] = useState('#5c6bc4')
  const [adminId, setAdminId] = useState<number | ''>('')

  const admins = users.filter((u) => u.is_super_admin)

  function reload() {
    api.listGroups().then(setGroups)
  }
  useEffect(reload, [])

  useEffect(() => {
    if (selected) api.listGroupMembers(selected.id).then(setMembers).catch(() => setMembers([]))
    else setMembers([])
  }, [selected])

  async function handleCreate() {
    setError(null)
    if (!name.trim() || !adminId) {
      setError('Nome e admin interno são obrigatórios.')
      return
    }
    try {
      await api.createGroup({ name, color, internal_admin_id: Number(adminId) })
      setName('')
      setAdminId('')
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao criar grupo.')
    }
  }

  async function refreshSelected() {
    const fresh = await api.listGroups()
    setGroups(fresh)
    setSelected((s) => fresh.find((g) => g.id === s?.id) ?? null)
    if (selected) api.listGroupMembers(selected.id).then(setMembers).catch(() => {})
  }

  return (
    <div className="flex gap-5">
      <Table>
        <thead>
          <tr>
            <Th>Grupo</Th>
            <Th>Admin interno</Th>
            <Th>Membros</Th>
            <Th right>Ações</Th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.id} style={selected?.id === g.id ? { background: 'var(--color-surface)' } : undefined}>
              <Td>
                <button className="flex items-center gap-2.5" onClick={() => setSelected(g)}>
                  <span className="h-3 w-3 flex-shrink-0 rounded" style={{ background: g.color }} />
                  <span className="font-medium">{g.name}</span>
                </button>
              </Td>
              <Td>{g.internal_admin_name}</Td>
              <Td>{g.member_count}</Td>
              <Td right>
                <button className="text-xs" style={{ color: 'var(--color-text-muted)' }} onClick={() => setSelected(g)}>
                  gerenciar
                </button>
                <button
                  className="ml-3 text-xs"
                  style={{ color: '#d43b3b' }}
                  onClick={() => {
                    if (confirm(`Excluir o grupo "${g.name}"? Os avisos e eventos dele são apagados.`))
                      api.deleteGroup(g.id).then(() => {
                        setSelected(null)
                        reload()
                      })
                  }}
                >
                  excluir
                </button>
              </Td>
            </tr>
          ))}
          {groups.length === 0 && (
            <tr>
              <Td>
                <span style={{ color: 'var(--color-text-muted)' }}>Nenhum grupo ainda.</span>
              </Td>
            </tr>
          )}
        </tbody>
      </Table>

      {selected ? (
        <CreatePanel title={`Membros — ${selected.name}`}>
          <div className="mb-3 flex flex-col gap-2">
            {members.map((m) => (
              <div key={m.user_id} className="flex items-center gap-2 text-[13px]">
                <Avatar name={m.name} size={24} userId={m.user_id} />
                <span className="flex-1 truncate">{m.name}</span>
                {m.is_internal_admin ? (
                  <span className="text-[11px]" style={{ color: 'var(--color-primary)' }}>admin interno</span>
                ) : (
                  <button
                    className="text-[11px]"
                    style={{ color: '#d43b3b' }}
                    onClick={() => api.removeGroupMember(selected.id, m.user_id).then(refreshSelected)}
                  >
                    remover
                  </button>
                )}
              </div>
            ))}
          </div>

          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Adicionar</label>
          <select
            className="mb-3 w-full rounded-lg px-3 py-2 text-[13px] outline-none"
            style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}
            value=""
            onChange={(e) => {
              if (e.target.value) api.addGroupMember(selected.id, Number(e.target.value)).then(refreshSelected)
            }}
          >
            <option value="">Escolher colaborador…</option>
            {users
              .filter((u) => !members.some((m) => m.user_id === u.id))
              .map((u) => (
                <option key={u.id} value={u.id}>{u.display_name || u.username}</option>
              ))}
          </select>

          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Admin interno</label>
          <select
            className="mb-3 w-full rounded-lg px-3 py-2 text-[13px] outline-none"
            style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}
            value={selected.internal_admin_id}
            onChange={(e) => api.updateGroup(selected.id, { internal_admin_id: Number(e.target.value) }).then(refreshSelected)}
          >
            {admins.map((u) => (
              <option key={u.id} value={u.id}>{u.display_name || u.username}</option>
            ))}
          </select>

          <button className="w-full rounded-lg border py-2 text-[13px]" style={{ borderColor: 'var(--color-border)' }} onClick={() => setSelected(null)}>
            Fechar
          </button>
        </CreatePanel>
      ) : (
        <CreatePanel title="Novo grupo">
          <FieldInput label="Nome" placeholder="ex.: Cromatografia" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="mb-3.5">
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Cor</label>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-full rounded-lg" style={{ background: 'var(--color-surface)' }} />
          </div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
            Admin interno (tem que ser administrador máximo)
          </label>
          <select
            className="mb-3.5 w-full rounded-lg px-3 py-2 text-[13px] outline-none"
            style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}
            value={adminId === '' ? '' : String(adminId)}
            onChange={(e) => setAdminId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Selecione…</option>
            {admins.map((u) => (
              <option key={u.id} value={u.id}>{u.display_name || u.username}</option>
            ))}
          </select>
          {admins.length === 0 && (
            <p className="-mt-2 mb-3 text-[11px]" style={{ color: '#d43b3b' }}>
              Nenhum administrador máximo cadastrado — promova alguém em Usuários primeiro.
            </p>
          )}
          {error && <p className="mb-3 text-xs" style={{ color: '#d43b3b' }}>{error}</p>}
          <PrimaryButton onClick={handleCreate} disabled={!name.trim() || !adminId}>
            Criar grupo
          </PrimaryButton>
        </CreatePanel>
      )}
    </div>
  )
}

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('Usuários')
  const [modules, setModules] = useState<ModuleFull[]>([])
  const [users, setUsers] = useState<CurrentUser[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [areas, setAreas] = useState<EquipmentArea[]>([])

  const reloadModules = () => {
    api.listModules().then(setModules)
  }
  const reloadUsers = () => {
    api.listUsers().then(setUsers)
  }
  const reloadEquipment = () => {
    api.listEquipment().then(setEquipment)
  }
  const reloadAreas = () => {
    api.listEquipmentAreas().then(setAreas)
  }

  useEffect(reloadModules, [])
  useEffect(reloadUsers, [])
  useEffect(reloadEquipment, [])
  useEffect(reloadAreas, [])

  return (
    <div className="p-6">
      <div className="mb-1 text-xl font-semibold">Administração</div>
      <div className="mb-5 text-[13.5px]" style={{ color: 'var(--color-text-muted)' }}>
        Usuários, módulos, equipamentos e permissões da plataforma.
      </div>

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

      {tab === 'Usuários' && <UsersTab users={users} onChange={reloadUsers} />}
      {tab === 'Grupos' && <GroupsTab users={users} />}
      {tab === 'Módulos' && <ModulesTab modules={modules} onChange={reloadModules} />}
      {tab === 'Equipamentos' && (
        <EquipmentTab equipment={equipment} onChange={reloadEquipment} areas={areas} onAreasChange={reloadAreas} />
      )}
      {tab === 'Permissões' && <PermissionsTab modules={modules} users={users} />}
    </div>
  )
}
