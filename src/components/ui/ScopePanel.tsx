import { Text } from '../../ui/Text';
import { Card } from '../../ui/Card';
import { MultiSelectCombobox, type MultiSelectOption } from './MultiSelectCombobox';
import { ui } from '../../ui/tokens';

type FilterChip = {
  key: string;
  label: string;
  onRemove: () => void;
};

type ScopePanelProps = {
  scopeDescription: string;
  availableAgents: Array<{ id: string; name?: string }>;
  availableStages: Array<{ id: string; label: string }>;
  availableDealTypes: string[];
  availableLeadSources: Array<{ id: string; name: string }>;
  agentOptions: MultiSelectOption[];
  stageOptions: MultiSelectOption[];
  dealTypeOptions: MultiSelectOption[];
  leadSourceOptions: MultiSelectOption[];
  selectedAgentIds: string[];
  selectedPipelineStages: string[];
  selectedDealTypes: string[];
  selectedLeadSources: string[];
  onChangeAgents: (next: string[]) => void;
  onChangePipelineStages: (next: string[]) => void;
  onChangeDealTypes: (next: string[]) => void;
  onChangeLeadSources: (next: string[]) => void;
  activeFilterChips: FilterChip[];
  showFocusOnMe: boolean;
  isFocusOnMeActive: boolean;
  onSelectMyData: () => void;
  onClearAllFilters: () => void;
  showStageFilter?: boolean;
  extraFilterChips?: FilterChip[];
};

export function ScopePanel({
  scopeDescription,
  availableAgents,
  availableStages,
  availableDealTypes,
  availableLeadSources,
  agentOptions,
  stageOptions,
  dealTypeOptions,
  leadSourceOptions,
  selectedAgentIds,
  selectedPipelineStages,
  selectedDealTypes,
  selectedLeadSources,
  onChangeAgents,
  onChangePipelineStages,
  onChangeDealTypes,
  onChangeLeadSources,
  activeFilterChips,
  showFocusOnMe,
  isFocusOnMeActive,
  onSelectMyData,
  onClearAllFilters,
  showStageFilter = true,
  extraFilterChips = []
}: ScopePanelProps) {
  const chips = [...extraFilterChips, ...activeFilterChips];

  return (
    <Card padding="cardTight" className="space-y-4">
      <div>
        <Text variant="micro" className="font-semibold text-gray-700">Scope</Text>
        <Text variant="muted">{scopeDescription}</Text>
      </div>
      {(chips.length > 0 || showFocusOnMe) && (
        <div className="flex flex-wrap items-center gap-2">
          {showFocusOnMe && (
            <button
              type="button"
              onClick={onSelectMyData}
              className={[
                ui.radius.pill,
                ui.pad.cardTight,
                'transition',
                isFocusOnMeActive
                  ? `bg-[var(--app-accent)] ${ui.tone.inverse} ${ui.shadow.card}`
                  : `bg-gray-100 ${ui.tone.primary} hover:bg-gray-200`
              ].join(' ')}
            >
              <Text as="span" variant="micro">Focus On Me</Text>
            </button>
          )}
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.onRemove}
              className={[
                'inline-flex items-center gap-1 bg-white',
                ui.radius.pill,
                ui.border.subtle,
                ui.pad.chipTight,
                ui.tone.muted
              ].join(' ')}
            >
              <Text as="span" variant="micro">{chip.label}</Text>
              <Text as="span" variant="micro" className={ui.tone.faint}>x</Text>
            </button>
          ))}
          {activeFilterChips.length > 0 && (
            <button
              type="button"
              onClick={onClearAllFilters}
              className={ui.tone.accent}
            >
              <Text as="span" variant="micro">Clear all filters</Text>
            </button>
          )}
        </div>
      )}
      {availableAgents.length > 0 && (
        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${showStageFilter ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
          <div className="min-w-0">
            <MultiSelectCombobox
              label="Agents"
              options={agentOptions}
              value={selectedAgentIds}
              onChange={onChangeAgents}
              placeholder="Search agents..."
              disabled={agentOptions.length === 0}
            />
          </div>
          {showStageFilter && (
            <div className="min-w-0">
              <MultiSelectCombobox
                label="Pipeline Stage"
                options={stageOptions}
                value={selectedPipelineStages}
                onChange={onChangePipelineStages}
                placeholder="Search stages..."
                disabled={availableStages.length === 0}
              />
            </div>
          )}
          <div className="min-w-0">
            <MultiSelectCombobox
              label="Deal Type"
              options={dealTypeOptions}
              value={selectedDealTypes}
              onChange={onChangeDealTypes}
              placeholder="Search deal types..."
              disabled={availableDealTypes.length === 0}
            />
          </div>
          <div className="min-w-0">
            <MultiSelectCombobox
              label="Lead Source"
              options={leadSourceOptions}
              value={selectedLeadSources}
              onChange={onChangeLeadSources}
              placeholder="Search lead sources..."
              disabled={availableLeadSources.length === 0}
            />
          </div>
        </div>
      )}
    </Card>
  );
}
