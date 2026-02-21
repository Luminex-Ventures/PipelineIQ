import { NavLink, Outlet } from 'react-router-dom';
import { Inbox, Plug } from 'lucide-react';

const tabs = [
  { path: '/conversations/inbox', label: 'Inbox', icon: Inbox },
];

export default function Conversations() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 p-2 border-b border-gray-200 bg-gray-50/50">
        {tabs.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
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
        <NavLink
          to="/workspace-settings?section=integrations"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-200 ml-auto"
        >
          <Plug className="h-4 w-4" />
          Connections
        </NavLink>
      </div>
      <div className="flex-1 min-h-0">
        <Outlet />
      </div>
    </div>
  );
}
