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
    <div className="space-y-2">
      <div
        className={`flex items-center gap-3 px-2 ${isCollapsed ? 'justify-center' : 'justify-start'}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--app-accent)]" aria-hidden />
        {!isCollapsed && (
          <span className="text-[12px] font-semibold uppercase tracking-[0.28em] text-gray-500">
            {title}
          </span>
        )}
      </div>
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
      <div className="space-y-6">
        {renderNavSection('Primary', mainNavItems)}
        {renderNavSection('Intelligence', aiNavItems)}
        <div className={`pt-4 ${isCollapsed ? '' : 'border-t border-[var(--app-border)]'}`}>
          {renderNavSection('Workspace', settingsNavItems)}
        </div>
        <div className={`pt-4 ${isCollapsed ? '' : 'border-t border-[var(--app-border)]'}`}>
          <button
            type="button"
            onClick={onToggle}
            aria-pressed={!isCollapsed}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`flex w-full items-center rounded-2xl py-3 text-[15px] font-semibold transition ${
              isCollapsed ? 'justify-center px-2' : 'gap-3 px-4 text-left'
            } text-gray-700 hover:bg-white/70 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent)]`}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/70 bg-white/95 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5)]">
              {isCollapsed ? (
                <ChevronRight className="h-5 w-5 transition" />
              ) : (
                <ChevronLeft className="h-5 w-5 transition" />
              )}
            </span>
            {!isCollapsed && <span className="whitespace-nowrap">Hide</span>}
          </button>
        </div>
      </div>
    </nav>
  );
}
