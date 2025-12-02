import { useState } from 'react';
import { X, Check, Plus, Trash2 } from 'lucide-react';
import { usePipelineTemplates } from '../hooks/usePipelineStatuses';

interface TemplateSelectionModalProps {
  onClose: () => void;
  onSelect: (templateName: string) => Promise<void>;
  onCreateCustomWorkflow?: (stages: string[]) => Promise<void>;
  title?: string;
}

const TEMPLATE_DETAILS: Record<string, { stages: string[]; description: string }> = {
  'Basic Pipeline': {
    description: 'Simple 6-stage pipeline ideal for new agents',
    stages: ['New Lead', 'Contacted', 'Showing Scheduled', 'Offer Submitted', 'Under Contract', 'Closed']
  },
  'Advanced Transaction Pipeline': {
    description: 'Comprehensive 13-stage pipeline covering all transaction phases',
    stages: ['New Lead', 'Warm Lead', 'Hot Lead', 'Showing Scheduled', 'Offer Submitted', 'Inspection', 'Appraisal', 'Under Contract', 'Financing', 'Title Review', 'Clear to Close', 'Closed', 'Lost']
  },
  Minimalist: {
    description: 'Streamlined 4-stage pipeline for quick deal tracking',
    stages: ['Lead', 'In Progress', 'Pending', 'Closed']
  }
};

export default function TemplateSelectionModal({
  onClose,
  onSelect,
  onCreateCustomWorkflow,
  title = 'Choose Your Pipeline Workflow'
}: TemplateSelectionModalProps) {
  const { templates } = usePipelineTemplates();
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [showCustomBuilder, setShowCustomBuilder] = useState(false);
  const [customStages, setCustomStages] = useState<string[]>(['New Lead', 'Contacted', 'Closed']);
  const [newStageName, setNewStageName] = useState('');
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApply = async () => {
    if (showCustomBuilder) {
      if (!onCreateCustomWorkflow) {
        setError('Custom workflows are not supported here.');
        return;
      }
      if (customStages.length < 2) {
        setError('Add at least two stages to create a custom workflow.');
        return;
      }

      setApplying(true);
      setError(null);

      try {
        await onCreateCustomWorkflow(customStages);
        onClose();
      } catch (err) {
        console.error('Error creating custom workflow:', err);
        setError(err instanceof Error ? err.message : 'Failed to create workflow');
      } finally {
        setApplying(false);
      }
      return;
    }

    if (!selectedTemplate) return;

    setApplying(true);
    setError(null);

    try {
      await onSelect(selectedTemplate);
      onClose();
    } catch (err) {
      console.error('Error applying template:', err);
      setError(err instanceof Error ? err.message : 'Failed to apply template');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="app-surface w-full max-w-4xl max-h-[92vh] overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-500">
              Pipeline
            </p>
            <h2 className="text-2xl font-semibold text-gray-900">{title}</h2>
            <p className="mt-1 text-sm text-gray-600">
              Start from a proven template or create a custom workflow tailored to your team.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-gray-200/80 bg-white p-2 text-gray-500 hover:text-gray-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Recommended workflows</h3>
              <p className="text-xs text-gray-500">
                Choose the pipeline structure that mirrors your current process.
              </p>
            </div>
            {onCreateCustomWorkflow && (
              <button
                onClick={() => setShowCustomBuilder((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/60 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-[0_2px_8px_rgba(15,23,42,0.08)] transition hover:border-[var(--app-accent)]/30 hover:text-[var(--app-accent)]"
              >
                <Plus className="h-4 w-4" />
                Custom workflow
              </button>
            )}
          </div>

          {showCustomBuilder ? (
            <div className="rounded-2xl border border-[var(--app-border)] bg-white/90 p-5 shadow-inner">
              <h4 className="text-lg font-semibold text-gray-900">Custom workflow</h4>
              <p className="text-xs text-gray-500">
                Define the stages that reflect your team’s unique process. Drag to reorder later in settings.
              </p>
              <div className="mt-4 space-y-3">
                {customStages.map((stage, index) => (
                  <div key={stage} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                    <span className="text-xs font-semibold text-gray-500">Stage {index + 1}</span>
                    <span className="flex-1 text-sm font-medium text-gray-900">{stage}</span>
                    <button
                      onClick={() => setCustomStages((prev) => prev.filter((_, idx) => idx !== index))}
                      className="text-gray-400 hover:text-red-500"
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <input
                    value={newStageName}
                    onChange={(e) => setNewStageName(e.target.value)}
                    placeholder="Add a stage..."
                    className="hig-input flex-1 text-sm"
                  />
                  <button
                    onClick={() => {
                      if (newStageName.trim()) {
                        setCustomStages((prev) => [...prev, newStageName.trim()]);
                        setNewStageName('');
                      }
                    }}
                    className="hig-btn-primary"
                    type="button"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates
                .filter((template) => template.name !== 'Buyer/Seller Split Pipeline')
                .map((template) => {
                  const details = TEMPLATE_DETAILS[template.name];
                  const isSelected = selectedTemplate === template.name;

                  return (
                    <button
                      key={template.id}
                      onClick={() => setSelectedTemplate(template.name)}
                      className={`rounded-2xl border px-5 py-4 text-left transition ${
                        isSelected
                          ? 'border-[var(--app-accent)]/40 bg-[var(--app-surface-muted)] shadow-[inset_0_0_0_1px_rgba(10,132,255,0.08)]'
                          : 'border-white/70 bg-white hover:border-[var(--app-accent)]/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-lg font-semibold text-gray-900">{template.name}</p>
                          <p className="text-sm text-gray-600">
                            {details?.description || template.description}
                          </p>
                        </div>
                        {isSelected && (
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--app-accent)] text-white">
                            <Check className="h-4 w-4" />
                          </span>
                        )}
                      </div>
                      {details && (
                        <div className="mt-3 space-y-1 text-xs text-gray-500">
                          <p className="font-semibold">Stages ({details.stages.length})</p>
                          <div className="flex flex-wrap gap-1.5">
                            {details.stages.map((stage, idx) => (
                              <span key={idx} className="rounded-full border border-gray-200/70 px-2 py-0.5 text-[11px] text-gray-600">
                                {stage}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/60 px-6 py-4">
          <button
            onClick={onClose}
            disabled={applying}
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={(showCustomBuilder && customStages.length < 2) || (!showCustomBuilder && !selectedTemplate) || applying}
            className="hig-btn-primary min-w-[140px] justify-center"
          >
            {applying ? 'Applying…' : showCustomBuilder ? 'Create Workflow' : 'Apply Template'}
          </button>
        </div>
      </div>
    </div>
  );
}
