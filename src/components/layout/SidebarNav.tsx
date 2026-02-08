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
}

function NavItemButton({ item, isActive, isCollapsed, onClick }: NavItemButtonProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const Icon = item.icon;

  return (
    <div className="relative">
      <button
        onClick={onClick}
        onMouseEnter={(e) => {
          if (isCollapsed) setShowTooltip(true);
          if (!isActive) e.currentTarget.style.color = '#D4883A';
        }}
        onMouseLeave={(e) => {
          setShowTooltip(false);
          if (!isActive) e.currentTarget.style.color = '#1e3a5f';
        }}
        onFocus={() => isCollapsed && setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        aria-label={item.label}
        className={[
          'group relative flex w-full items-center transition-colors duration-150',
          isCollapsed ? 'justify-center px-3 py-2.5' : 'gap-3 px-3 py-2.5',
          isActive
            ? 'bg-[rgba(212,136,58,0.08)]'
            : 'hover:bg-gray-100',
          ui.radius.control,
        ].join(' ')}
        style={{ color: isActive ? '#D4883A' : '#1e3a5f' }}
      >
        {/* Active indicator bar (Jira-style left border) */}
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
          <Text
            as="span"
            variant="body"
            className="whitespace-nowrap font-medium"
          >
            {item.label}
          </Text>
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

  const renderNavItems = (items: NavItem[]) => (
    <div className="space-y-0.5">
      {items.map((item) => (
        <NavItemButton
          key={item.path}
          item={item}
          isActive={location.pathname === item.path}
          isCollapsed={isCollapsed}
          onClick={() => navigate(item.path)}
        />
      ))}
    </div>
  );

  return (
    <nav className="flex h-full flex-col bg-white border-r border-gray-200">
      {/* Logo/Brand area */}
      <div className={[
        'flex items-center border-b border-gray-200 h-16',
        isCollapsed ? 'justify-center px-2' : 'px-4',
      ].join(' ')}>
        {isCollapsed ? (
          <img src="/LumaIQ-icon.png" alt="Luma-IQ" className="h-8 w-8" />
        ) : (
          <img src="/LumaIQ-header.png" alt="Luma-IQ" className="h-10" />
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
              <Text
                as="div"
                variant="micro"
                className={[ui.tone.faint, 'px-3 mb-2'].join(' ')}
              >
                MAIN
              </Text>
            )}
            {renderNavItems(mainNavItems)}
          </div>

          {/* Divider */}
          <div className={isCollapsed ? 'mx-2' : 'mx-3'}>
            <div className="h-px bg-gray-200" />
          </div>

          {/* AI section */}
          <div className="space-y-1">
            {!isCollapsed && (
              <Text
                as="div"
                variant="micro"
                className={[ui.tone.faint, 'px-3 mb-2'].join(' ')}
              >
                AI
              </Text>
            )}
            {renderNavItems(aiNavItems)}
          </div>
        </div>
      </div>

      {/* Bottom section (Settings + Collapse) */}
      <div className={[
        'border-t border-gray-200 py-3',
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
                e.currentTarget.style.color = '#1e3a5f';
              }}
              onFocus={() => isCollapsed && setShowCollapseTooltip(true)}
              onBlur={() => setShowCollapseTooltip(false)}
              aria-pressed={!isCollapsed}
              aria-expanded={!isCollapsed}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={[
                'group flex w-full items-center transition-colors duration-150',
                isCollapsed ? 'justify-center px-3 py-2.5' : 'gap-3 px-3 py-2.5',
                'hover:bg-gray-100',
                ui.radius.control,
              ].join(' ')}
              style={{ color: '#1e3a5f' }}
            >
              {isCollapsed ? (
                <ChevronRight className="h-5 w-5" strokeWidth={2} />
              ) : (
                <>
                  <ChevronLeft className="h-5 w-5" strokeWidth={2} />
                  <Text as="span" variant="body" className="font-medium">
                    Collapse
                  </Text>
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
