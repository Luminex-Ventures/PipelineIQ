import { useState } from 'react';
import { User, ShieldCheck, Bell, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getRoleLabel } from '../lib/rbac';
import ProfileSettings from './settings/personal/ProfileSettings';
import PasswordSecuritySettings from './settings/personal/PasswordSecuritySettings';
import NotificationSettings from './settings/personal/NotificationSettings';
import PersonalPreferencesSettings from './settings/personal/PersonalPreferencesSettings';

const personalSections = [
  { id: 'personal.profile' as const, label: 'Profile', description: 'Name & identity', icon: User },
  { id: 'personal.security' as const, label: 'Password & Security', description: 'Account protection', icon: ShieldCheck },
  { id: 'personal.notifications' as const, label: 'Notifications', description: 'Email + in-app alerts', icon: Bell },
  { id: 'personal.preferences' as const, label: 'Preferences', description: 'Goals & defaults', icon: SlidersHorizontal }
];

type PersonalSectionId = typeof personalSections[number]['id'];

export default function PersonalSettings() {
  const { user, roleInfo } = useAuth();
  const roleLabel = getRoleLabel(roleInfo?.globalRole);
  const [activeSection, setActiveSection] = useState<PersonalSectionId>('personal.profile');

  const renderSection = () => {
    switch (activeSection) {
      case 'personal.profile':
        return <ProfileSettings />;
      case 'personal.security':
        return <PasswordSecuritySettings />;
      case 'personal.notifications':
        return <NotificationSettings />;
      case 'personal.preferences':
      default:
        return <PersonalPreferencesSettings />;
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 rounded-[var(--app-radius)] border border-[var(--app-border)] bg-white/90 p-6 shadow-[0_15px_45px_rgba(15,23,42,0.08)]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-2xl bg-gray-100">
            <User className="w-6 h-6 text-gray-700" />
          </div>
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">Account Settings</h1>
            <p className="text-sm text-gray-500">Preferences that only apply to your login.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
          <div className="inline-flex items-center gap-2 rounded-full border border-gray-200/70 bg-white px-3 py-1">
            <span className="text-[10px] uppercase tracking-[0.4em] text-gray-400">Signed in</span>
            <span className="font-semibold text-gray-900">{user?.email}</span>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-gray-200/70 bg-white px-3 py-1">
            <span className="text-[10px] uppercase tracking-[0.4em] text-gray-400">Role</span>
            <span className="font-semibold text-gray-900">{roleLabel}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <aside className="lg:w-72 space-y-6">
          <div>
            <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-gray-400">
              Account
            </p>
            <div className="space-y-1">
              {personalSections.map((section) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      isActive
                        ? 'border-[rgb(0,122,255)] bg-[rgba(0,122,255,0.06)] shadow-[inset_0_0_0_1px_rgba(0,122,255,0.2)]'
                        : 'border-white/60 bg-white hover:border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-2xl border p-2 ${
                          isActive ? 'border-[rgba(0,122,255,0.3)] bg-white' : 'border-gray-100 bg-gray-50'
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${isActive ? 'text-[rgb(0,122,255)]' : 'text-gray-500'}`} />
                      </span>
                      <div>
                        <p className={`text-sm font-semibold ${isActive ? 'text-[rgb(0,122,255)]' : 'text-gray-800'}`}>
                          {section.label}
                        </p>
                        <p className="text-xs text-gray-500">{section.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <section className="flex-1 hig-card p-6">
          {renderSection()}
        </section>
      </div>
    </div>
  );
}
