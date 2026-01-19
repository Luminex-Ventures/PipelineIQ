import {
  Settings as SettingsIcon,
  Building,
  List,
  Tag,
  PlugZap,
  Layers,
  Users,
  Mail,
  FolderTree
} from 'lucide-react';
import PipelineStatusesSettings from './settings/PipelineStatusesSettings';
import LeadSourcesSettings from './settings/LeadSourcesSettings';
import WorkspaceInfoSettings from './settings/workspace/WorkspaceInfoSettings';
import IntegrationsSettings from './settings/workspace/IntegrationsSettings';
import WorkspaceConfigurationSettings from './settings/workspace/WorkspaceConfigurationSettings';
import WorkspaceMembersSettings from './settings/workspace/WorkspaceMembersSettings';
import WorkspaceInvitesSettings from './settings/workspace/WorkspaceInvitesSettings';
import WorkspaceTeamsSettings from './settings/workspace/WorkspaceTeamsSettings';
import { useAuth } from '../contexts/AuthContext';
import { canInviteAgents, canManageTeams, canManageWorkspaceMembers, getRoleLabel, isAdmin, isTeamLead, isSalesManagerOrAdmin } from '../lib/rbac';
import { useMemo, useState } from 'react';

const baseSections = [
  { id: 'workspace.info' as const, label: 'Workspace Info', description: 'Identity, locale, and defaults', icon: Building },
  { id: 'workspace.pipeline-statuses' as const, label: 'Pipeline Statuses', description: 'Shared stage definitions', icon: List },
  { id: 'workspace.lead-sources' as const, label: 'Lead Sources', description: 'Partner & portal sources', icon: Tag },
  { id: 'workspace.integrations' as const, label: 'Integrations', description: 'CRM & email connections', icon: PlugZap },
  { id: 'workspace.configuration' as const, label: 'Shared Configuration', description: 'Templates & custom fields', icon: Layers }
] as const;

type WorkspaceSectionId =
  | 'workspace.info'
  | 'workspace.pipeline-statuses'
  | 'workspace.lead-sources'
  | 'workspace.integrations'
  | 'workspace.configuration'
  | 'workspace.teams'
  | 'workspace.members'
  | 'workspace.invites';

export default function WorkspaceSettings() {
  const { roleInfo } = useAuth();
  const roleLabel = getRoleLabel(roleInfo?.globalRole);
  const canEditWorkspace = isAdmin(roleInfo);
  const canEditTeamScoped = isAdmin(roleInfo) || isSalesManagerOrAdmin(roleInfo) || isTeamLead(roleInfo);
  const canManageMembers = canManageWorkspaceMembers(roleInfo);
  const canInvite = canInviteAgents(roleInfo);
  const canEditTeams = canManageTeams(roleInfo);
  const [activeSection, setActiveSection] = useState<WorkspaceSectionId>('workspace.info');

  const workspaceSections = useMemo(() => {
    const sections = [...baseSections];
    if (canEditTeams) {
      sections.push({
        id: 'workspace.teams' as const,
        label: 'Teams',
        description: 'Create teams for routing',
        icon: FolderTree
      });
    }
    if (canManageMembers) {
      sections.push({
        id: 'workspace.members' as const,
        label: 'Members',
        description: 'Roles, status, and access',
        icon: Users
      });
    }
    if (canInvite) {
      sections.push({
        id: 'workspace.invites' as const,
        label: 'Invitations',
        description: 'Pending & sent invites',
        icon: Mail
      });
    }
    return sections;
  }, [canManageMembers, canInvite, canEditTeams]);

  const renderSection = () => {
    switch (activeSection) {
      case 'workspace.info':
        return <WorkspaceInfoSettings canEdit={canEditWorkspace} />;
      case 'workspace.pipeline-statuses':
        return <PipelineStatusesSettings canEdit={canEditTeamScoped} />;
      case 'workspace.lead-sources':
        return <LeadSourcesSettings canEdit={canEditTeamScoped} />;
      case 'workspace.integrations':
        return <IntegrationsSettings canEdit={canEditWorkspace} />;
      case 'workspace.teams':
        return <WorkspaceTeamsSettings />;
      case 'workspace.members':
        return <WorkspaceMembersSettings />;
      case 'workspace.invites':
        return <WorkspaceInvitesSettings />;
      case 'workspace.configuration':
      default:
        return <WorkspaceConfigurationSettings canEdit={canEditWorkspace} />;
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 rounded-[var(--app-radius)] border border-[var(--app-border)] bg-white/90 p-6 shadow-[0_15px_45px_rgba(15,23,42,0.08)]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-2xl bg-gray-100">
            <SettingsIcon className="w-6 h-6 text-gray-700" />
          </div>
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">Workspace Settings</h1>
            <p className="text-sm text-gray-500">Configuration shared across your entire workspace</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
          <div className="inline-flex items-center gap-2 rounded-full border border-gray-200/70 bg-white px-3 py-1">
            <span className="text-[10px] uppercase tracking-[0.4em] text-gray-400">Role</span>
            <span className="font-semibold text-gray-900">{roleLabel}</span>
          </div>
          {!canEditWorkspace && (
            <span className="text-xs text-gray-500">
              Workspace configuration is managed by admins. You have read-only access.
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <aside className="lg:w-72 space-y-6">
          <div>
            <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-gray-400">
              Workspace
            </p>
            <div className="space-y-1">
              {workspaceSections.map((section) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`group w-full rounded-2xl border px-4 py-3 text-left transition-all duration-200 ${
                      isActive
                        ? 'border-[rgb(0,122,255)] bg-[rgba(0,122,255,0.06)] shadow-[inset_0_0_0_1px_rgba(0,122,255,0.2)]'
                        : 'border-white/60 bg-white hover:-translate-y-[1px] hover:border-[rgba(0,122,255,0.25)] hover:bg-[rgba(0,122,255,0.04)] hover:shadow-[0_12px_30px_rgba(0,0,0,0.06)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(0,122,255,0.35)]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-2xl border p-2 ${
                          isActive
                            ? 'border-[rgba(0,122,255,0.3)] bg-white'
                            : 'border-gray-100 bg-gray-50 group-hover:border-[rgba(0,122,255,0.2)] group-hover:bg-white'
                        }`}
                      >
                        <Icon
                          className={`w-4 h-4 ${
                            isActive ? 'text-[rgb(0,122,255)]' : 'text-gray-500 group-hover:text-[rgb(0,122,255)]'
                          }`}
                        />
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
