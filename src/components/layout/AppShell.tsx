import { ReactNode, useState } from 'react';
import { AppHeader } from './AppHeader';
import { SidebarNav } from './SidebarNav';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 text-[var(--app-text-primary)] overflow-x-hidden">
      {/* Fixed Sidebar (Jira-style) */}
      <aside
        className={[
          'fixed left-0 top-0 z-40 h-screen',
          'transition-[width] duration-200 ease-in-out',
          isSidebarCollapsed ? 'w-16' : 'w-60',
        ].join(' ')}
      >
        <SidebarNav
          isCollapsed={isSidebarCollapsed}
          onToggle={() => setIsSidebarCollapsed((prev) => !prev)}
        />
      </aside>

      {/* Main content area */}
      <div
        className={[
          'min-h-screen flex flex-col',
          'transition-[margin-left] duration-200 ease-in-out',
          isSidebarCollapsed ? 'ml-16' : 'ml-60',
        ].join(' ')}
      >
        <AppHeader />
        <main className="flex-1 overflow-x-hidden">
          <div className="min-h-[calc(100vh-4rem)] bg-white">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
