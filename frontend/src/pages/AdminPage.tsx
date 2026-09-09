import { useEffect, useState } from 'react'
import {
  api,
  ApiError,
  type CurrentUser,
  type Equipment,
  type ModuleAccessEntry,
  type ModuleFull,
} from '../api/client'
import { Avatar } from '../components/Avatar'

const TABS = ['Usuários', 'Módulos', 'Equipamentos', 'Permissões'] as const
type Tab = (typeof TABS)[number]

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

function UsersTab({ users, onChange }: { users: CurrentUser[]; onChange: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setError(null)
    try {
      await api.createUser({ username, password })
      setUsername('')
      setPassword('')
      onChange()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao criar usuário.')
    }
  }

  return (
    <div className="flex gap-5">
      <Table>
        <thead>
          <tr>
            <Th>Usuário</Th>
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
                  <Avatar name={u.display_name || u.username} size={30} />
                  <span className="font-medium">{u.display_name || u.username}</span>
                </div>
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
                {u.is_protected && (
                  <span
                    className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
                    style={{ color: 'var(--color-text-muted)', background: 'var(--color-surface)' }}
                  >
                    Protegida
                  </span>
                )}
              </Td>
              <Td right>
                {!u.is_protected && (
                  <button className="text-xs" style={{ color: '#d43b3b' }} onClick={() => api.deleteUser(u.id).then(onChange)}>
                    remover
                  </button>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <CreatePanel title="Novo usuário">
        <FieldInput label="Usuário" placeholder="usuario.sobrenome" value={username} onChange={(e) => setUsername(e.target.value)} />
        <FieldInput label="Senha provisória" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && (
          <p className="mb-3 text-xs" style={{ color: '#d43b3b' }}>
            {error}
          </p>
        )}
        <PrimaryButton onClick={handleCreate} disabled={!username || !password}>
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
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setError(null)
    try {
      await api.createModule({ id, display_name: displayName, codename: '', description: '', icon: '🧪', internal_base_url: baseUrl, health_path: '/health' })
      setId('')
      setDisplayName('')
      setBaseUrl('')
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
        <FieldInput label="URL interna" placeholder="http://<container>:8000" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
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

function EquipmentTab({ equipment, onChange }: { equipment: Equipment[]; onChange: () => void }) {
  const [id, setId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [color, setColor] = useState('#15216f')
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setError(null)
    try {
      await api.createEquipment({ id, display_name: displayName, color })
      setId('')
      setDisplayName('')
      onChange()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao cadastrar equipamento.')
    }
  }

  return (
    <div className="flex gap-5">
      <Table>
        <thead>
          <tr>
            <Th>Equipamento</Th>
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
              <Td right>
                <button className="text-xs" style={{ color: '#d43b3b' }} onClick={() => api.deleteEquipment(eq.id).then(onChange)}>
                  remover
                </button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <CreatePanel title="Cadastrar equipamento">
        <FieldInput label="Id (slug)" placeholder="ex.: leco832" value={id} onChange={(e) => setId(e.target.value)} />
        <FieldInput label="Nome" placeholder="ex.: LECO 832" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
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

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('Usuários')
  const [modules, setModules] = useState<ModuleFull[]>([])
  const [users, setUsers] = useState<CurrentUser[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])

  const reloadModules = () => {
    api.listModules().then(setModules)
  }
  const reloadUsers = () => {
    api.listUsers().then(setUsers)
  }
  const reloadEquipment = () => {
    api.listEquipment().then(setEquipment)
  }

  useEffect(reloadModules, [])
  useEffect(reloadUsers, [])
  useEffect(reloadEquipment, [])

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
      {tab === 'Módulos' && <ModulesTab modules={modules} onChange={reloadModules} />}
      {tab === 'Equipamentos' && <EquipmentTab equipment={equipment} onChange={reloadEquipment} />}
      {tab === 'Permissões' && <PermissionsTab modules={modules} users={users} />}
    </div>
  )
}
