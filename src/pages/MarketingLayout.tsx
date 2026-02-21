import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Link2 } from 'lucide-react';

const tabs = [
  { path: '/marketing', pathExact: true, label: 'Overview', icon: LayoutDashboard },
  { path: '/marketing/connected-accounts', pathExact: false, label: 'Connected accounts', icon: Link2 },
];

export default function MarketingLayout() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 p-2 border-b border-gray-200 bg-gray-50/50">
        {tabs.map(({ path, pathExact, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={pathExact}
            className={({ isActive }) =>
              [
                'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive ? 'bg-[#1e3a5f] text-white' : 'text-gray-600 hover:bg-gray-200',
              ].join(' ')
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        <Outlet />
      </div>
    </div>
  );
}
