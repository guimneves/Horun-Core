import { ThemeProvider, ThemeToggle, HorunFooter } from '@horun/design-system'
import { PostrunApp } from './postrun-core'

// O que é próprio do equipamento na TELA entra aqui (o resto é comum, em
// src/postrun-core — não edite lá). Equipamento de exemplo: as linhas da
// janela de integração no gráfico.
function integrationWindow(params: Record<string, unknown>) {
  const out: { x: number; label: string }[] = []
  if (typeof params.t_ini === 'number') out.push({ x: params.t_ini, label: 'início' })
  if (typeof params.t_fim === 'number') out.push({ x: params.t_fim, label: 'fim' })
  return out
}

export default function App() {
  return (
    <ThemeProvider>
      <div className="flex min-h-screen flex-col" style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}>
        <header
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}
        >
          <div className="flex items-center gap-3">
            <a href="/" className="text-sm hover:underline" style={{ color: 'var(--color-text-muted)' }}>
              ← Voltar ao Horun
            </a>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--color-primary)' }}>
              Horun · __MODULE_NAME__
            </h1>
          </div>
          <ThemeToggle />
        </header>

        <main className="mx-auto w-full max-w-[1500px] flex-1 p-4 sm:p-6">
          <PostrunApp marks={integrationWindow} />
        </main>

        <HorunFooter moduleName="Horun · __MODULE_NAME__" />
      </div>
    </ThemeProvider>
  )
}
