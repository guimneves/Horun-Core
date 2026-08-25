import { ThemeProvider, ThemeToggle, HorunFooter } from '@horun/design-system'

export default function App() {
  return (
    <ThemeProvider>
      <div className="flex min-h-screen flex-col">
        <header
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elevated)' }}
        >
          <h1 className="text-lg font-semibold" style={{ color: 'var(--color-primary)' }}>
            Horun · __MODULE_NAME__
          </h1>
          <ThemeToggle />
        </header>

        <main className="flex-1 p-6">
          <p>
            Módulo novo, gerado pelo template padrão do Horun — comece a desenvolver em{' '}
            <code>src/App.tsx</code>.
          </p>
        </main>

        <HorunFooter moduleName="Horun · __MODULE_NAME__" codename="__MODULE_CODENAME__" />
      </div>
    </ThemeProvider>
  )
}
