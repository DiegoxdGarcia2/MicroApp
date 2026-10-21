import { ThinkingOrbGroup, useThinkingOrbState } from '../common/ThinkingOrb';

interface LayoutProps {
  children: React.ReactNode;
  syncSlot?: React.ReactNode;
}

export function Layout({ children, syncSlot }: LayoutProps) {
  const { orbs } = useThinkingOrbState();

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <header className="bg-surface border-b border-surface-alt sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary-600 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="text-h3 font-semibold text-primary">CajaViva</h1>
            </div>
            <nav className="flex items-center gap-4">
              <span className="text-sm text-muted hidden sm:block">Offline-First</span>
              {syncSlot ?? (
                <div className="w-3 h-3 rounded-full bg-green-500" aria-label="Estado de conexión" />
              )}
            </nav>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 bg-surface-alt border-r border-surface-alt flex flex-col hidden lg:flex">
          <nav className="flex-1 p-4 space-y-1" role="navigation" aria-label="Navegación principal">
            <a href="#ventas" className="flex items-center gap-3 px-3 py-2 rounded-lg text-primary hover:bg-primary-50 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 17a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2H7a2 2 0 00-2 2v4z" />
              </svg>
              Ventas
            </a>
            <a href="#inventario" className="flex items-center gap-3 px-3 py-2 rounded-lg text-muted hover:bg-surface hover:text-primary transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              Inventario
            </a>
            <a href="#caja" className="flex items-center gap-3 px-3 py-2 rounded-lg text-muted hover:bg-surface hover:text-primary transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Caja
            </a>
            <a href="#fiados" className="flex items-center gap-3 px-3 py-2 rounded-lg text-muted hover:bg-surface hover:text-primary transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Fiados
            </a>
          </nav>
          <div className="p-4 border-t border-surface">
            <div className="text-xs text-muted flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              v1.0.0-beta
            </div>
          </div>
        </aside>

        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>

      <footer className="bg-surface border-t border-surface-alt p-4">
        <div className="max-w-7xl mx-auto">
          <ThinkingOrbGroup orbs={orbs} size="md" />
        </div>
      </footer>
    </div>
  );
}

export function PageHeader({ title, description, action }: { 
  title: string; 
  description?: string; 
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h2 className="text-h2 font-semibold text-primary">{title}</h2>
        {description && <p className="text-body text-muted mt-1">{description}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

export function Card({ children, className = '', ...props }: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) {
  return (
    <div className={`card ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { 
  title: string; 
  subtitle?: string; 
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <div>
        <h3 className="text-h3 font-medium text-primary">{title}</h3>
        {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}