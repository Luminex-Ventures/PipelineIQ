import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Database } from '../lib/database.types';
import { COLOR_SWATCHES } from '../components/ui/colorSwatches';

type PipelineStatus = Database['public']['Tables']['pipeline_statuses']['Row'];
type PipelineTemplate = Database['public']['Tables']['pipeline_templates']['Row'];
type LifecycleStage = PipelineStatus['lifecycle_stage'];

type ColorOverrides = Record<string, string>;

const getPaletteColor = (index: number) => COLOR_SWATCHES[index % COLOR_SWATCHES.length].value;

const STATUS_COLOR_MAP: Record<string, string> = {
  'new lead': '#E8F1FF', // Ice Blue
  contacted: '#AECFFF', // Pale Azure
  'warm lead': '#FFF1E6', // Peach Wash
  'hot lead': '#FFD1AE', // Soft Tangerine
  'showing scheduled': '#98C3FF', // Soft Blue
  'offer submitted': '#87B6F9', // Bluebell
  inspection: '#B7F0D9', // Pale Green
  appraisal: '#C3DBFF', // Sky Wash
  'under contract': '#8EDCC0', // Soft Teal
  financing: '#FFE38C', // Golden Mist
  'title review': '#8DCFD9', // Muted Teal
  'clear to close': '#CFF9EA', // Soft Mint
  closed: '#E6FFF5', // Mint Wash
  lost: '#FFE5E5', // Rose Mist
  lead: '#C3DBFF', // Sky Wash
  'in progress': '#98C3FF', // Soft Blue
  pending: '#8EDCC0', // Soft Teal
  'advanced transaction pipeline': '#E5FAFF', // Aqua Mist (fallback for template label)
};

const getColorForStatus = (name: string, index: number): string => {
  const mapped = STATUS_COLOR_MAP[name.trim().toLowerCase()];
  if (mapped) return mapped;
  return getPaletteColor(index);
};

const inferLifecycleStage = (name: string, index = 0, totalCount = 1): LifecycleStage => {
  const normalized = name.trim().toLowerCase();
  if (normalized.includes('close')) return 'closed';
  if (normalized.includes('won')) return 'closed';
  if (normalized.includes('lost') || normalized.includes('dead') || normalized.includes('archive') || normalized.includes('cancel')) {
    return 'dead';
  }
  if (normalized.includes('new') || normalized.includes('lead')) return 'new';
  if (index === 0) return 'new';
  if (index === totalCount - 1) return 'closed';
  return 'in_progress';
};

export const LIFECYCLE_STAGE_OPTIONS: Array<{ value: LifecycleStage; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'closed', label: 'Closed' },
  { value: 'dead', label: 'Dead/Lost' }
];

const getOverrideStorageKey = (userId: string) => `pipeline-status-color-overrides:${userId}`;

export function usePipelineStatuses() {
  const { user, roleInfo } = useAuth();
  const [statuses, setStatuses] = useState<PipelineStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [colorOverrides, setColorOverrides] = useState<ColorOverrides>({});
  const baseColorsRef = useRef<Record<string, string>>({});
  const dbOverridesLoadedRef = useRef(false);
  const teamId = roleInfo?.teamId || null;
  const overrideStorageKey = user ? getOverrideStorageKey(user.id) : null;

  // Read from localStorage as a fast cache
  const readLocalOverrides = useCallback((): ColorOverrides => {
    if (typeof window === 'undefined' || !overrideStorageKey) return {};
    try {
      const raw = window.localStorage.getItem(overrideStorageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed as ColorOverrides;
      }
    } catch (err) {
      console.warn('Failed to read status color overrides from localStorage', err);
    }
    return {};
  }, [overrideStorageKey]);

  // Write to localStorage as a cache
  const persistLocalOverrides = useCallback((overrides: ColorOverrides) => {
    if (typeof window === 'undefined' || !overrideStorageKey) return;
    window.localStorage.setItem(overrideStorageKey, JSON.stringify(overrides));
  }, [overrideStorageKey]);

  // Read color overrides from database
  const readDbOverrides = useCallback(async (): Promise<ColorOverrides> => {
    if (!user) return {};
    try {
      const { data, error: fetchError } = await supabase
        .from('user_status_color_overrides')
        .select('pipeline_status_id, color')
        .eq('user_id', user.id);

      if (fetchError) {
        console.warn('Failed to read color overrides from database', fetchError);
        return {};
      }

      const overrides: ColorOverrides = {};
      (data || []).forEach((row: { pipeline_status_id: string; color: string }) => {
        overrides[row.pipeline_status_id] = row.color;
      });
      return overrides;
    } catch (err) {
      console.warn('Failed to read color overrides from database', err);
      return {};
    }
  }, [user]);

  // Persist a single color override to the database
  const persistDbOverride = useCallback(async (statusId: string, color: string) => {
    if (!user) return;
    try {
      await supabase
        .from('user_status_color_overrides')
        .upsert(
          { user_id: user.id, pipeline_status_id: statusId, color },
          { onConflict: 'user_id,pipeline_status_id' }
        );
    } catch (err) {
      console.warn('Failed to persist color override to database', err);
    }
  }, [user]);

  // Remove a color override from the database
  const removeDbOverride = useCallback(async (statusId: string) => {
    if (!user) return;
    try {
      await supabase
        .from('user_status_color_overrides')
        .delete()
        .eq('user_id', user.id)
        .eq('pipeline_status_id', statusId);
    } catch (err) {
      console.warn('Failed to remove color override from database', err);
    }
  }, [user]);

  // Migrate any existing localStorage overrides to the database (one-time)
  const migrateLocalToDb = useCallback(async (localOverrides: ColorOverrides, dbOverrides: ColorOverrides) => {
    if (!user) return;
    const localKeys = Object.keys(localOverrides);
    if (localKeys.length === 0) return;

    // Only migrate keys that aren't already in the database
    const toMigrate = localKeys.filter(key => !(key in dbOverrides));
    if (toMigrate.length === 0) return;

    const inserts = toMigrate.map(statusId => ({
      user_id: user.id,
      pipeline_status_id: statusId,
      color: localOverrides[statusId]
    }));

    try {
      await supabase
        .from('user_status_color_overrides')
        .upsert(inserts, { onConflict: 'user_id,pipeline_status_id' });
    } catch (err) {
      console.warn('Failed to migrate localStorage overrides to database', err);
    }
  }, [user]);

  // Combined read: database first, fall back to localStorage, migrate if needed
  const readColorOverrides = useCallback(async (): Promise<ColorOverrides> => {
    const localOverrides = readLocalOverrides();

    // If we've already loaded from DB this session, use local cache
    if (dbOverridesLoadedRef.current) {
      return localOverrides;
    }

    // Load from database
    const dbOverrides = await readDbOverrides();
    dbOverridesLoadedRef.current = true;

    // Migrate localStorage overrides to database if they exist
    if (Object.keys(localOverrides).length > 0) {
      migrateLocalToDb(localOverrides, dbOverrides);
    }

    // Merge: database wins, then localStorage fills gaps
    const merged = { ...localOverrides, ...dbOverrides };

    // Update localStorage cache with merged result
    persistLocalOverrides(merged);

    return merged;
  }, [readLocalOverrides, readDbOverrides, persistLocalOverrides, migrateLocalToDb]);

  const resolveBaseColor = useCallback((status: PipelineStatus, index: number) => {
    const stored = status.color?.trim();
    if (stored) return stored;
    return getColorForStatus(status.name, index);
  }, []);

  const loadStatuses = useCallback(async () => {
    if (!user) {
      setStatuses([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: teamStatuses, error: teamError } = teamId
        ? await supabase
            .from('pipeline_statuses')
            .select('*')
            .eq('team_id', teamId)
            .order('sort_order', { ascending: true })
        : { data: null, error: null };

      if (teamError) throw teamError;

      const shouldUseTeam = !!teamStatuses?.length;
      const { data: personalStatuses, error: personalError } = shouldUseTeam
        ? { data: null, error: null }
        : await supabase
            .from('pipeline_statuses')
            .select('*')
            .eq('user_id', user.id)
            .order('sort_order', { ascending: true });

      if (personalError) throw personalError;

      const sourceStatuses = shouldUseTeam ? teamStatuses : personalStatuses;

      if (!sourceStatuses) throw new Error('Failed to load pipeline statuses');

      const fetched = (sourceStatuses || []) as PipelineStatus[];
      const updates: Array<{ id: string; color: string }> = [];
      const overrides = await readColorOverrides();
      const baseColors: Record<string, string> = {};
      const normalized = fetched.map((status, idx) => {
        const baseColor = resolveBaseColor(status, idx);
        baseColors[status.id] = baseColor;
        const overrideColor = overrides[status.id];

        if (!status.color && baseColor) {
          updates.push({ id: status.id, color: baseColor });
        }

        return { ...status, color: overrideColor || baseColor };
      });

      if (updates.length > 0) {
        await Promise.all(
          updates.map((u) =>
            supabase.from('pipeline_statuses').update({ color: u.color }).eq('id', u.id)
          )
        );
      }

      baseColorsRef.current = baseColors;
      setColorOverrides(overrides);
      setStatuses(normalized);
      setError(null);
    } catch (err) {
      console.error('Error loading pipeline statuses:', err);
      setError(err instanceof Error ? err.message : 'Failed to load statuses');
    } finally {
      setLoading(false);
    }
  }, [user, teamId, readColorOverrides, resolveBaseColor]);

  useEffect(() => {
    loadStatuses();
  }, [loadStatuses]);

  const addStatus = async (name: string, color?: string, lifecycleStage?: LifecycleStage) => {
    if (!user) return;

    const maxSort = Math.max(...statuses.map(s => s.sort_order), 0);
    const slug = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const resolvedColor = color?.trim() || getColorForStatus(name, maxSort);
    const resolvedLifecycle = lifecycleStage || inferLifecycleStage(name, maxSort, statuses.length + 1);

    const { data, error: insertError } = await supabase
      .from('pipeline_statuses')
      .insert({
        user_id: user.id,
        team_id: teamId,
        name,
        slug,
        sort_order: maxSort + 1,
        color: resolvedColor,
        is_default: false,
        lifecycle_stage: resolvedLifecycle
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    await loadStatuses();
    return data;
  };

  const updateStatus = async (id: string, updates: Partial<PipelineStatus>) => {
    const { error: updateError } = await supabase
      .from('pipeline_statuses')
      .update(updates)
      .eq('id', id);

    if (updateError) {
      throw updateError;
    }

    await loadStatuses();
  };

  const deleteStatus = async (id: string) => {
    // Check if any deals are using this status
    const { count } = await supabase
      .from('deals')
      .select('id', { count: 'exact', head: true })
      .eq('pipeline_status_id', id);

    if ((count ?? 0) > 0) {
      throw new Error('Cannot delete status with active deals. Please reassign deals first.');
    }

    const { error: deleteError } = await supabase
      .from('pipeline_statuses')
      .delete()
      .eq('id', id);

    if (deleteError) {
      throw deleteError;
    }

    await loadStatuses();
  };

  const reorderStatuses = async (reorderedStatuses: PipelineStatus[]) => {
    const updates = reorderedStatuses.map((status, index) => ({
      id: status.id,
      sort_order: index + 1
    }));

    for (const update of updates) {
      await supabase
        .from('pipeline_statuses')
        .update({ sort_order: update.sort_order })
        .eq('id', update.id);
    }

    await loadStatuses();
  };

  const applyTemplate = async (templateName: string) => {
    if (!user) return;

    const { error: applyError } = await supabase.rpc('apply_pipeline_template', {
      p_user_id: user.id,
      p_template_name: templateName
    });

    if (applyError) {
      throw applyError;
    }

    if (teamId) {
      await supabase
        .from('pipeline_statuses')
        .update({ team_id: teamId })
        .eq('user_id', user.id)
        .is('team_id', null);
    }

    // Migrate existing deals
    const { error: migrateError } = await supabase.rpc('migrate_user_deals_to_pipeline_statuses', {
      p_user_id: user.id
    });

    if (migrateError) {
      console.error('Error migrating deals:', migrateError);
    }

    await loadStatuses();
  };

  const createCustomWorkflow = async (stages: string[]) => {
    if (!user) return;
    const cleanedStages = stages.map((stage) => stage.trim()).filter((stage) => stage.length > 0);
    if (cleanedStages.length === 0) {
      throw new Error('Please provide at least one stage.');
    }

    const deleteFilter = teamId ? { team_id: teamId } : { user_id: user.id };
    const { error: deleteError } = await supabase
      .from('pipeline_statuses')
      .delete()
      .match(deleteFilter);

    if (deleteError) {
      throw deleteError;
    }

    const inserts = cleanedStages.map((name, index) => ({
      user_id: user.id,
      team_id: teamId,
      name,
      slug: name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
      sort_order: index + 1,
      color: getColorForStatus(name, index),
      is_default: index === 0,
      lifecycle_stage: inferLifecycleStage(name, index, cleanedStages.length)
    }));

    const { error: insertError } = await supabase.from('pipeline_statuses').insert(inserts);
    if (insertError) {
      throw insertError;
    }

    const { error: migrateError } = await supabase.rpc('migrate_user_deals_to_pipeline_statuses', {
      p_user_id: user.id
    });

    if (migrateError) {
      console.error('Error migrating deals after custom workflow:', migrateError);
    }

    await loadStatuses();
  };

  const setPersonalStatusColor = (statusId: string, color: string) => {
    if (!user) return;
    // Update local state immediately for instant feedback
    const nextOverrides = { ...colorOverrides, [statusId]: color };
    persistLocalOverrides(nextOverrides);
    setColorOverrides(nextOverrides);
    setStatuses(prev => prev.map(status => status.id === statusId ? { ...status, color } : status));
    // Persist to database in background
    persistDbOverride(statusId, color);
  };

  const clearPersonalStatusColor = (statusId: string) => {
    if (!user) return;
    if (!(statusId in colorOverrides)) {
      return;
    }

    const nextOverrides = { ...colorOverrides };
    delete nextOverrides[statusId];
    persistLocalOverrides(nextOverrides);
    setColorOverrides(nextOverrides);

    setStatuses(prev => prev.map(status => {
      if (status.id !== statusId) return status;
      const fallback = baseColorsRef.current[statusId] || resolveBaseColor(status, (status.sort_order || 1) - 1);
      return { ...status, color: fallback };
    }));
    // Remove from database in background
    removeDbOverride(statusId);
  };

  return {
    statuses,
    loading,
    error,
    colorOverrides,
    addStatus,
    updateStatus,
    deleteStatus,
    reorderStatuses,
    applyTemplate,
    createCustomWorkflow,
    reload: loadStatuses,
    setPersonalStatusColor,
    clearPersonalStatusColor
  };
}

export function usePipelineTemplates() {
  const [templates, setTemplates] = useState<PipelineTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTemplates = async () => {
      const { data, error } = await supabase
        .from('pipeline_templates')
        .select('*')
        .eq('is_system', true)
        .order('name');

      if (!error && data) {
        setTemplates(data);
      }
      setLoading(false);
    };

    loadTemplates();
  }, []);

  return { templates, loading };
}
