import { useState } from 'react';
import {
  LayoutDashboard,
  Trello,
  CheckSquare,
  Sparkles,
  Settings,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  LucideIcon,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ui } from '../../ui/tokens';
import { Text } from '../../ui/Text';
import { usePrefetch } from '../../hooks/useQueryCache';

interface NavItem {
  icon: LucideIcon;
  label: string;
  path: string;
}

const mainNavItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: Trello, label: 'Pipeline', path: '/pipeline' },
  { icon: CheckSquare, label: 'Tasks', path: '/tasks' },
  { icon: BarChart3, label: 'Analytics', path: '/analytics' },
];

const aiNavItems: NavItem[] = [
  { icon: Sparkles, label: 'Luma AI', path: '/luma' },
];

const settingsNavItems: NavItem[] = [
  { icon: Settings, label: 'Settings', path: '/workspace-settings' },
];

interface SidebarNavProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

interface NavItemButtonProps {
  item: NavItem;
  isActive: boolean;
  isCollapsed: boolean;
  onClick: () => void;
  onHover?: () => void;
}

function NavItemButton({ item, isActive, isCollapsed, onClick, onHover }: NavItemButtonProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const Icon = item.icon;

  return (
    <div className="relative">
      <button
        onClick={onClick}
        onMouseEnter={(e) => {
          if (isCollapsed) setShowTooltip(true);
          if (!isActive) e.currentTarget.style.color = '#D4883A';
          onHover?.();
        }}
        onMouseLeave={(e) => {
          setShowTooltip(false);
          if (!isActive) e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
        }}
        onFocus={() => isCollapsed && setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        aria-label={item.label}
        className={[
          'group relative flex w-full items-center transition-colors duration-150',
          isCollapsed ? 'justify-center px-3 py-2.5' : 'gap-3 px-3 py-2.5',
          isActive
            ? 'bg-white/10'
            : 'hover:bg-white/10',
          ui.radius.control,
        ].join(' ')}
        style={{ color: isActive ? '#D4883A' : 'rgba(255,255,255,0.8)' }}
      >
        {/* Active indicator bar */}
        {isActive && (
          <span
            className={[
              'absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[var(--app-accent)]',
              ui.radius.pill,
            ].join(' ')}
          />
        )}
        
        <Icon
          className="h-5 w-5 flex-shrink-0 transition-colors"
          strokeWidth={2}
        />
        
        {!isCollapsed && (
          <span className="whitespace-nowrap font-medium text-sm" style={{ color: 'inherit' }}>
            {item.label}
          </span>
        )}
      </button>

      {/* Tooltip (shown when collapsed) */}
      {showTooltip && isCollapsed && (
        <div
          className={[
            'absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50',
            'px-2.5 py-1.5 bg-gray-900 text-white whitespace-nowrap',
            ui.radius.control,
            ui.shadow.card,
          ].join(' ')}
          role="tooltip"
        >
          <Text as="span" variant="body" className="text-white text-sm">
            {item.label}
          </Text>
          {/* Tooltip arrow */}
          <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
        </div>
      )}
    </div>
  );
}

export function SidebarNav({ isCollapsed, onToggle }: SidebarNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [showCollapseTooltip, setShowCollapseTooltip] = useState(false);
  const { prefetchRoute } = usePrefetch();

  const renderNavItems = (items: NavItem[]) => (
    <div className="space-y-0.5">
      {items.map((item) => (
        <NavItemButton
          key={item.path}
          item={item}
          isActive={location.pathname === item.path}
          isCollapsed={isCollapsed}
          onClick={() => navigate(item.path)}
          onHover={() => prefetchRoute(item.path)}
        />
      ))}
    </div>
  );

  return (
    <nav className="flex h-full flex-col bg-[#1e3a5f]">
      {/* Logo/Brand area */}
      <div className={[
        'flex items-center border-b border-white/10 h-16',
        isCollapsed ? 'justify-center px-2' : 'px-4',
      ].join(' ')}>
        {isCollapsed ? (
          <img src="/LumaIQ-icon-white.png" alt="Luma-IQ" className="h-8 w-8" />
        ) : (
          <img src="/LumaIQ-header-white.png" alt="Luma-IQ" className="h-7" />
        )}
      </div>

      {/* Main navigation */}
      <div className={[
        'flex-1 overflow-y-auto py-4',
        isCollapsed ? 'px-2' : 'px-3',
      ].join(' ')}>
        <div className="space-y-6">
          {/* Main section */}
          <div className="space-y-1">
            {!isCollapsed && (
              <div className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
                MAIN
              </div>
            )}
            {renderNavItems(mainNavItems)}
          </div>

          {/* Divider */}
          <div className={isCollapsed ? 'mx-2' : 'mx-3'}>
            <div className="h-px bg-white/10" />
          </div>

          {/* AI section */}
          <div className="space-y-1">
            {!isCollapsed && (
              <div className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
                AI
              </div>
            )}
            {renderNavItems(aiNavItems)}
          </div>
        </div>
      </div>

      {/* Bottom section (Settings + Collapse) */}
      <div className={[
        'border-t border-white/10 py-3',
        isCollapsed ? 'px-2' : 'px-3',
      ].join(' ')}>
        <div className="space-y-1">
          {renderNavItems(settingsNavItems)}

          {/* Collapse toggle */}
          <div className="relative">
            <button
              type="button"
              onClick={onToggle}
              onMouseEnter={(e) => {
                if (isCollapsed) setShowCollapseTooltip(true);
                e.currentTarget.style.color = '#D4883A';
              }}
              onMouseLeave={(e) => {
                setShowCollapseTooltip(false);
                e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
              }}
              onFocus={() => isCollapsed && setShowCollapseTooltip(true)}
              onBlur={() => setShowCollapseTooltip(false)}
              aria-pressed={!isCollapsed}
              aria-expanded={!isCollapsed}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={[
                'group flex w-full items-center transition-colors duration-150',
                isCollapsed ? 'justify-center px-3 py-2.5' : 'gap-3 px-3 py-2.5',
                'hover:bg-white/10',
                ui.radius.control,
              ].join(' ')}
              style={{ color: 'rgba(255,255,255,0.8)' }}
            >
              {isCollapsed ? (
                <ChevronRight className="h-5 w-5" strokeWidth={2} />
              ) : (
                <>
                  <ChevronLeft className="h-5 w-5" strokeWidth={2} />
                  <span className="font-medium text-sm" style={{ color: 'inherit' }}>
                    Collapse
                  </span>
                </>
              )}
            </button>

            {/* Collapse tooltip */}
            {showCollapseTooltip && isCollapsed && (
              <div
                className={[
                  'absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50',
                  'px-2.5 py-1.5 bg-gray-900 text-white whitespace-nowrap',
                  ui.radius.control,
                  ui.shadow.card,
                ].join(' ')}
                role="tooltip"
              >
                <Text as="span" variant="body" className="text-white text-sm">
                  Expand
                </Text>
                <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
