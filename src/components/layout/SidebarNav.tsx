import {
  LayoutDashboard,
  Trello,
  CheckSquare,
  Sparkles,
  Settings,
  BarChart3,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
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
  { icon: Settings, label: 'Settings', path: '/workspace-settings' },
];

interface SidebarNavProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export function SidebarNav({ isCollapsed, onToggle }: SidebarNavProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const renderNavSection = (title: string, items: typeof mainNavItems) => (
    <div>
      <p
        className={`px-3 pb-2 text-[12px] font-semibold uppercase tracking-[0.35em] text-gray-400 ${
          isCollapsed ? 'sr-only' : ''
        }`}
      >
        {title}
      </p>
      <div className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          const layoutClasses = isCollapsed ? 'justify-center px-2' : 'gap-3 px-4 text-left';

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              aria-label={item.label}
              title={item.label}
              className={`flex w-full items-center rounded-2xl py-3 text-[15px] font-semibold transition ${layoutClasses} ${
                isActive
                  ? 'bg-[rgba(10,132,255,0.12)] text-[var(--app-accent)] shadow-[inset_0_0_0_1px_rgba(10,132,255,0.2)]'
                  : 'text-gray-600 hover:bg-white/70 hover:text-gray-900'
              }`}
            >
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-2xl border text-gray-700 ${
                  isActive
                    ? 'border-[rgba(10,132,255,0.3)] bg-white/80'
                    : 'border-white/60 bg-white/90'
                }`}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
              </span>
              {!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <nav
      className={`sticky top-24 rounded-[var(--app-radius)] border border-[var(--app-border)] bg-white/80 shadow-[0_15px_40px_rgba(15,23,42,0.12)] transition-all duration-300 ${
        isCollapsed ? 'p-3' : 'p-4'
      }`}
    >
      <div className={`mb-6 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
        {!isCollapsed && (
          <p className="text-[13px] font-semibold uppercase tracking-[0.35em] text-gray-500">Navigation</p>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={!isCollapsed}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? 'Expand sidebar navigation' : 'Collapse sidebar navigation'}
          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/70 bg-white/90 text-gray-700 transition hover:text-[var(--app-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent)]"
        >
          {isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </button>
      </div>
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
