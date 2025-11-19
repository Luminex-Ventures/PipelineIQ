import { LayoutDashboard, Trello, CheckSquare, Sparkles, Settings, BarChart3 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

const mainNavItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: Trello, label: 'Pipeline', path: '/pipeline' },
  { icon: CheckSquare, label: 'Tasks', path: '/tasks' },
  { icon: BarChart3, label: 'Analytics', path: '/analytics' },
];

const aiNavItems = [
  { icon: Sparkles, label: 'Luma AI', path: '/luma' },
];

const settingsNavItems = [
  { icon: Settings, label: 'Workspace Settings', path: '/workspace-settings' },
];

export function SidebarNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const renderNavSection = (title: string, items: typeof mainNavItems) => (
    <div>
      <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        {title}
      </p>
      <div className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left text-sm font-medium transition ${
                isActive
                  ? 'bg-[rgba(10,132,255,0.12)] text-[var(--app-accent)] shadow-[inset_0_0_0_1px_rgba(10,132,255,0.2)]'
                  : 'text-gray-600 hover:bg-white/70 hover:text-gray-900'
              }`}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-2xl border text-gray-700 ${
                  isActive
                    ? 'border-[rgba(10,132,255,0.3)] bg-white/80'
                    : 'border-white/60 bg-white/90'
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={2} />
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <nav className="sticky top-24 rounded-[var(--app-radius)] border border-[var(--app-border)] bg-white/80 p-4 shadow-[0_15px_40px_rgba(15,23,42,0.12)]">
      <div className="space-y-6">
        {renderNavSection('Primary', mainNavItems)}
        {renderNavSection('Intelligence', aiNavItems)}
      </div>
      <div className="mt-6 border-t border-[var(--app-border)] pt-4">
        {renderNavSection('Workspace', settingsNavItems)}
      </div>
    </nav>
  );
}
