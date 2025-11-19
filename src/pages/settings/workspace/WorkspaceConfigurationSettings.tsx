interface WorkspaceConfigurationSettingsProps {
  canEdit: boolean;
}

const templates = [
  {
    title: 'Deal Templates',
    description: 'Define repeatable sets of tasks, stages, and documents for each pipeline type.'
  },
  {
    title: 'Custom Fields',
    description: 'Capture additional data points (loan type, co-borrower, transaction coordinator) across every deal.'
  },
  {
    title: 'Default Views',
    description: 'Control which boards, filters, and metrics new team members inherit on first login.'
  }
];

export default function WorkspaceConfigurationSettings({ canEdit }: WorkspaceConfigurationSettingsProps) {
  return (
    <div>
      <div className="mb-6">
        <h2 className="hig-text-heading mb-2">Shared Configuration</h2>
        <p className="text-sm text-gray-600">
          Templates, custom fields, and default views that keep your workspace aligned.
        </p>
        {!canEdit && (
          <p className="text-xs text-gray-500 mt-1">
            Ask an admin to adjust shared templates or defaults for the workspace.
          </p>
        )}
      </div>

      <div className="space-y-4">
        {templates.map((template) => (
          <div key={template.title} className="rounded-2xl border border-gray-200/70 bg-white px-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{template.title}</h3>
                <p className="text-xs text-gray-500">{template.description}</p>
              </div>
              <button
                type="button"
                className={`px-4 py-2 rounded-2xl border text-sm font-medium ${
                  canEdit
                    ? 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    : 'border-gray-100 text-gray-400 cursor-not-allowed'
                }`}
                disabled={!canEdit}
              >
                {canEdit ? 'Configure' : 'View only'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
