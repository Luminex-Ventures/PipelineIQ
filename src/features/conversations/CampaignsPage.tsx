import { useState, useEffect } from 'react';
import { Plus, List } from 'lucide-react';
import { PageShell } from '../../ui/PageShell';
import { PageHeader } from '../../ui/PageHeader';
import { Card } from '../../ui/Card';
import { Text } from '../../ui/Text';
import { ui } from '../../ui/tokens';
import {
  useCampaigns,
  useCampaign,
  useCampaignSteps,
  useEnrollments,
  useCreateCampaign,
  useUpdateCampaign,
  useUpsertCampaignSteps,
  useEnrollContacts,
  usePauseEnrollment,
  useResumeEnrollment,
} from '../../hooks/useConversations';
import { useContacts } from '../../hooks/useConversations';
import { CampaignEditor } from './CampaignEditor';
import { EnrollmentsTable } from './EnrollmentsTable';
import type { ThreadChannel } from '../../types/conversations';
import toast from 'react-hot-toast';

export function CampaignsPage() {
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newChannel, setNewChannel] = useState<ThreadChannel>('email');
  const [newSteps, setNewSteps] = useState<{ step_order: number; delay_days: number; subject?: string | null; body_template: string }[]>([]);
  const [enrollContactIds, setEnrollContactIds] = useState<string[]>([]);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [editingSteps, setEditingSteps] = useState<{ step_order: number; delay_days: number; subject?: string | null; body_template: string }[]>([]);

  const { data: campaigns = [], isLoading: campaignsLoading } = useCampaigns();
  const { data: campaign } = useCampaign(selectedCampaignId);
  const { data: steps = [] } = useCampaignSteps(selectedCampaignId);
  const { data: enrollments = [] } = useEnrollments(selectedCampaignId);
  const { data: contacts = [] } = useContacts();

  const createCampaign = useCreateCampaign();
  const updateCampaign = useUpdateCampaign();
  const upsertSteps = useUpsertCampaignSteps();
  const enrollContacts = useEnrollContacts();
  const pauseEnrollment = usePauseEnrollment();
  const resumeEnrollment = useResumeEnrollment();

  useEffect(() => {
    setEditingSteps([]);
  }, [selectedCampaignId]);

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error('Enter a campaign name.');
      return;
    }
    try {
      const c = await createCampaign.mutateAsync({ name: newName.trim(), channel: newChannel });
      await upsertSteps.mutateAsync({ campaignId: c.id, steps: newSteps });
      toast.success('Campaign created.');
      setSelectedCampaignId(c.id);
      setCreating(false);
      setNewName('');
      setNewChannel('email');
      setNewSteps([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create campaign');
    }
  };

  const handleSaveSteps = async () => {
    if (!selectedCampaignId) return;
    const toSave = editingSteps.length ? editingSteps : steps.map((s) => ({ step_order: s.step_order, delay_days: s.delay_days, subject: s.subject, body_template: s.body_template }));
    try {
      await upsertSteps.mutateAsync({ campaignId: selectedCampaignId, steps: toSave });
      toast.success('Steps saved.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save steps');
    }
  };

  const handleEnroll = async () => {
    if (!selectedCampaignId || !enrollContactIds.length) return;
    const stepDelays = (editingSteps.length ? editingSteps : steps.length ? steps : newSteps).map((s) => ({ delay_days: s.delay_days }));
    try {
      await enrollContacts.mutateAsync({
        campaignId: selectedCampaignId,
        contactIds: enrollContactIds,
        steps: stepDelays.length ? stepDelays : [{ delay_days: 0 }],
      });
      toast.success('Contacts enrolled.');
      setEnrollContactIds([]);
      setShowEnrollModal(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to enroll');
    }
  };

  const header = (
    <PageHeader
      label="Conversations"
      title="Drip campaigns"
      subtitle="Create time-based email or SMS sequences. Enroll contacts and let Luma send steps on schedule."
    />
  );

  return (
    <PageShell title={header}>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--app-accent)] text-white font-medium text-sm hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            New campaign
          </button>
        </div>

        {creating && (
          <Card>
            <Text as="h2" variant="h2" className="mb-4">
              New campaign
            </Text>
            <CampaignEditor
              name={newName}
              channel={newChannel}
              steps={[]}
              onNameChange={setNewName}
              onChannelChange={setNewChannel}
              onStepsChange={setNewSteps}
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleCreate}
                disabled={createCampaign.isPending}
                className="px-4 py-2 rounded-lg bg-[var(--app-accent)] text-white text-sm font-medium disabled:opacity-50"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <Text variant="micro" className={ui.tone.subtle}>
              CAMPAIGNS
            </Text>
            {campaignsLoading ? (
              <div className="mt-2 space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />
                ))}
              </div>
            ) : (
              <ul className="mt-2 space-y-1">
                {campaigns.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedCampaignId(c.id)}
                      className={[
                        'w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                        selectedCampaignId === c.id
                          ? 'bg-[#1e3a5f] text-white'
                          : 'text-[#1e3a5f] hover:bg-gray-100',
                      ].join(' ')}
                    >
                      {c.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="lg:col-span-2 space-y-4">
            {selectedCampaignId && campaign && (
              <>
                <Card>
                  <div className="flex items-center justify-between mb-4">
                    <Text as="h2" variant="h2">
                      {campaign.name}
                    </Text>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowEnrollModal(true)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50"
                      >
                        <List className="h-4 w-4" />
                        Enroll contacts
                      </button>
                    </div>
                  </div>
                  <CampaignEditor
                    name={campaign.name}
                    channel={campaign.channel}
                    steps={editingSteps.length ? editingSteps.map((s, i) => ({ id: '', campaign_id: campaign.id, step_order: i, delay_days: s.delay_days, subject: s.subject ?? null, body_template: s.body_template, created_at: '' })) : steps}
                    onNameChange={(n) => updateCampaign.mutate({ id: campaign.id, updates: { name: n } })}
                    onChannelChange={(ch) => updateCampaign.mutate({ id: campaign.id, updates: { channel: ch } })}
                    onStepsChange={setEditingSteps}
                    readOnly={false}
                  />
                  <button
                    type="button"
                    onClick={handleSaveSteps}
                    disabled={upsertSteps.isPending}
                    className="mt-3 px-4 py-2 rounded-lg bg-[var(--app-accent)] text-white text-sm font-medium disabled:opacity-50"
                  >
                    Save steps
                  </button>
                </Card>

                <Card>
                  <Text variant="micro" className={ui.tone.subtle}>
                    ENROLLMENTS
                  </Text>
                  <div className="mt-2">
                    <EnrollmentsTable
                      enrollments={enrollments}
                      onPause={(id) => pauseEnrollment.mutate(id)}
                      onResume={(id) => resumeEnrollment.mutate(id)}
                    />
                  </div>
                </Card>
              </>
            )}
            {!selectedCampaignId && !creating && (
              <div className="py-12 text-center">
                <Text variant="muted">Select a campaign or create one to get started.</Text>
              </div>
            )}
          </div>
        </div>

        {showEnrollModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <Card className="max-w-md w-full max-h-[80vh] overflow-y-auto">
              <Text as="h2" variant="h2" className="mb-4">
                Enroll contacts
              </Text>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {contacts.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enrollContactIds.includes(c.id)}
                      onChange={(e) =>
                        setEnrollContactIds((prev) =>
                          e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)
                        )
                      }
                    />
                    <span className="text-sm">
                      {c.name || c.email || c.phone || c.id}
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={handleEnroll}
                  disabled={!enrollContactIds.length || enrollContacts.isPending}
                  className="px-4 py-2 rounded-lg bg-[var(--app-accent)] text-white text-sm font-medium disabled:opacity-50"
                >
                  Enroll
                </button>
                <button
                  type="button"
                  onClick={() => { setShowEnrollModal(false); setEnrollContactIds([]); }}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </PageShell>
  );
}
