import { ReactNode } from 'react';
import { AppHeader } from './AppHeader';
import { SidebarNav } from './SidebarNav';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_var(--app-bg-start),_var(--app-bg-mid)_45%,_var(--app-bg-end))] text-[var(--app-text-primary)] overflow-x-hidden">
      <AppHeader />
      <div className="relative mx-auto flex w-full flex-col gap-6 px-4 pb-10 pt-6 lg:flex-row lg:px-8">
        <div className="lg:w-64 lg:flex-shrink-0">
          <SidebarNav />
        </div>
        <main className="flex-1 overflow-x-hidden">
          <div className="min-h-[calc(100vh-10rem)] rounded-[var(--app-radius)] border border-[var(--app-border)] bg-white/85 p-4 shadow-[0_10px_50px_rgba(15,23,42,0.08)] sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
