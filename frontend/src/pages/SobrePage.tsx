import { useEffect, useState } from 'react'
import { api, type ModuleContributor, type ModuleStatus } from '../api/client'
import { Avatar } from '../components/Avatar'
import horunIcon from '../assets/horun-icon.png'
import nqtrLogo from '../assets/nqtr-logo.png'

function ModuleCredits({ module }: { module: ModuleStatus }) {
  const [contributors, setContributors] = useState<ModuleContributor[]>([])

  useEffect(() => {
    api.listModuleContributors(module.id).then(setContributors).catch(() => {})
  }, [module.id])

  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xl">{module.icon}</span>
        <span className="font-semibold">Horun · {module.display_name}</span>
      </div>
      {module.description && (
        <p className="mb-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {module.description}
        </p>
      )}
      {contributors.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Sem contribuidores cadastrados.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {contributors.map((c) => (
            <div key={c.user_id} className="flex items-center gap-2">
              <Avatar name={c.display_name} size={28} userId={c.user_id} />
              <span className="text-sm">{c.display_name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function SobrePage() {
  const [modules, setModules] = useState<ModuleStatus[]>([])

  useEffect(() => {
    api.dashboardModules().then(setModules).catch(() => {})
  }, [])

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <img src={horunIcon} alt="" className="h-16 w-16 rounded-2xl" />
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-primary)' }}>Horun</h1>
        <p className="text-sm">
          A plataforma "digital twin" do parque analítico do NQTR — gestão de amostras, reagentes e
          equipamentos, num só lugar.
        </p>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <strong>H</strong>ub <strong>O</strong>peracional de <strong>R</strong>egistro{' '}
          <strong>U</strong>nificado Multiusuário do <strong>N</strong>úcleo de Desenvolvimento de
          Processos e Análises Químicas em Tempo Real
        </p>

        <dl
          className="grid w-full grid-cols-2 gap-2 rounded-2xl border p-4 text-left text-sm"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}
        >
          <dt style={{ color: 'var(--color-text-muted)' }}>Núcleo (Core)</dt>
          <dd>Guilherme M. Neves</dd>
          <dt style={{ color: 'var(--color-text-muted)' }}>Laboratório</dt>
          <dd>NQTR — Instituto de Química, UFRJ</dd>
          <dt style={{ color: 'var(--color-text-muted)' }}>Repositório</dt>
          <dd>
            <a
              href="https://github.com/guimneves/Horun-Core"
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
              style={{ color: 'var(--color-primary)' }}
            >
              github.com/guimneves/Horun-Core
            </a>
          </dd>
        </dl>
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>
          Créditos por módulo
        </h2>
        <div className="flex flex-col gap-4">
          {modules.map((m) => (
            <ModuleCredits key={m.id} module={m} />
          ))}
          {modules.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Nenhum módulo cadastrado ainda.</p>
          )}
        </div>
      </div>

      <div className="mt-8 flex items-center justify-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <img src={nqtrLogo} alt="NQTR · IQ-UFRJ" className="h-6 w-auto opacity-70" />
        NQTR, IQ-UFRJ
      </div>
    </div>
  )
}
