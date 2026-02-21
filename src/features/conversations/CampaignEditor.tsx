import { useState, useEffect } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { Text } from '../../ui/Text';
import { ui } from '../../ui/tokens';
import type { CampaignStep, ThreadChannel } from '../../types/conversations';

interface CampaignEditorProps {
  name: string;
  channel: ThreadChannel;
  steps: CampaignStep[];
  onNameChange: (value: string) => void;
  onChannelChange: (value: ThreadChannel) => void;
  onStepsChange: (steps: { step_order: number; delay_days: number; subject?: string | null; body_template: string }[]) => void;
  readOnly?: boolean;
}

export function CampaignEditor({
  name,
  channel,
  steps,
  onNameChange,
  onChannelChange,
  onStepsChange,
  readOnly,
}: CampaignEditorProps) {
  const [localSteps, setLocalSteps] = useState(
    steps.length > 0
      ? steps.map((s) => ({
          step_order: s.step_order,
          delay_days: s.delay_days,
          subject: s.subject ?? '',
          body_template: s.body_template,
        }))
      : [{ step_order: 0, delay_days: 0, subject: '', body_template: '' }]
  );

  useEffect(() => {
    onStepsChange(
      localSteps.map((s, i) => ({
        step_order: i,
        delay_days: s.delay_days,
        subject: channel === 'email' ? (s.subject || null) : null,
        body_template: s.body_template,
      }))
    );
  }, [localSteps, channel, onStepsChange]);

  const addStep = () => {
    setLocalSteps((prev) => [
      ...prev,
      {
        step_order: prev.length,
        delay_days: prev.length === 0 ? 0 : 1,
        subject: '',
        body_template: '',
      },
    ]);
  };

  const removeStep = (index: number) => {
    setLocalSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const updateStep = (index: number, updates: Partial<{ delay_days: number; subject: string; body_template: string }>) => {
    setLocalSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...updates } : s))
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-[#1e3a5f] mb-1">Campaign name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          disabled={readOnly}
          placeholder="e.g. New listing follow-up"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]/20"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[#1e3a5f] mb-1">Channel</label>
        <select
          value={channel}
          onChange={(e) => onChannelChange(e.target.value as ThreadChannel)}
          disabled={readOnly}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]/20"
        >
          <option value="email">Email</option>
          <option value="sms">SMS</option>
        </select>
      </div>
      <div>
        <Text variant="micro" className={ui.tone.subtle}>
          STEPS
        </Text>
        <p className="text-sm text-gray-500 mt-0.5">
          Each step is sent after the previous one, with a delay in days.
        </p>
        <div className="mt-2 space-y-3">
          {localSteps.map((s, i) => (
            <div
              key={i}
              className="p-3 rounded-xl border border-gray-200 bg-gray-50/50 flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-600">Step {i + 1}</span>
                <div className="flex-1" />
                {!readOnly && localSteps.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeStep(i)}
                    className="p-1 rounded text-rose-500 hover:bg-rose-50"
                    aria-label="Remove step"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500">Delay (days)</label>
                  <input
                    type="number"
                    min={0}
                    value={s.delay_days}
                    onChange={(e) => updateStep(i, { delay_days: parseInt(e.target.value, 10) || 0 })}
                    disabled={readOnly}
                    className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded"
                  />
                </div>
                {channel === 'email' && (
                  <div>
                    <label className="block text-xs text-gray-500">Subject</label>
                    <input
                      type="text"
                      value={s.subject}
                      onChange={(e) => updateStep(i, { subject: e.target.value })}
                      disabled={readOnly}
                      placeholder="Email subject"
                      className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500">Body</label>
                <textarea
                  value={s.body_template}
                  onChange={(e) => updateStep(i, { body_template: e.target.value })}
                  disabled={readOnly}
                  rows={3}
                  placeholder={channel === 'sms' ? 'SMS text…' : 'Email body…'}
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded resize-none"
                />
              </div>
            </div>
          ))}
          {!readOnly && (
            <button
              type="button"
              onClick={addStep}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 text-gray-600 text-sm hover:bg-gray-50"
            >
              <Plus className="h-4 w-4" />
              Add step
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
