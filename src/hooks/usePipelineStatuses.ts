import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Database } from '../lib/database.types';
import { COLOR_SWATCHES } from '../components/ui/ColorPicker';

type PipelineStatus = Database['public']['Tables']['pipeline_statuses']['Row'];
type PipelineTemplate = Database['public']['Tables']['pipeline_templates']['Row'];

const ALLOWED_COLORS = COLOR_SWATCHES.map((c) => c.value.toLowerCase());

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

const normalizeToPalette = (color: string | null | undefined): string | null => {
  if (!color) return null;
  const lowered = color.toLowerCase();
  const match = ALLOWED_COLORS.find((c) => c === lowered);
  return match || null;
};

const getColorForStatus = (name: string, index: number): string => {
  const mapped = STATUS_COLOR_MAP[name.trim().toLowerCase()];
  if (mapped) return mapped;
  return getPaletteColor(index);
};

export function usePipelineStatuses() {
  const { user } = useAuth();
  const [statuses, setStatuses] = useState<PipelineStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStatuses = useCallback(async () => {
    if (!user) {
      setStatuses([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('pipeline_statuses')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: true });

      if (fetchError) throw fetchError;

      const fetched = data || [];
      const updates: Array<{ id: string; color: string }> = [];
      const normalized = fetched.map((status, idx) => {
        const preferred = getColorForStatus(status.name, idx);
        const cleanExisting = normalizeToPalette(status.color);
        const nextColor = cleanExisting || preferred;

        if (status.color !== nextColor) {
          updates.push({ id: status.id, color: nextColor });
        }
        return { ...status, color: nextColor };
      });

      if (updates.length > 0) {
        await Promise.all(
          updates.map((u) =>
            supabase.from('pipeline_statuses').update({ color: u.color }).eq('id', u.id)
          )
        );
      }

      setStatuses(normalized);
      setError(null);
    } catch (err) {
      console.error('Error loading pipeline statuses:', err);
      setError(err instanceof Error ? err.message : 'Failed to load statuses');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadStatuses();
  }, [loadStatuses]);

  const addStatus = async (name: string, color?: string) => {
    if (!user) return;

    const maxSort = Math.max(...statuses.map(s => s.sort_order), 0);
    const slug = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const resolvedColor = normalizeToPalette(color || '') || getColorForStatus(name, maxSort);

    const { data, error: insertError } = await supabase
      .from('pipeline_statuses')
      .insert({
        user_id: user.id,
        name,
        slug,
        sort_order: maxSort + 1,
        color: resolvedColor,
        is_default: false
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
    const { data: dealsCount } = await supabase
      .from('deals')
      .select('id', { count: 'exact', head: true })
      .eq('pipeline_status_id', id);

    if (dealsCount && (dealsCount as any).count > 0) {
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

    const { error: deleteError } = await supabase
      .from('pipeline_statuses')
      .delete()
      .eq('user_id', user.id);

    if (deleteError) {
      throw deleteError;
    }

    const inserts = cleanedStages.map((name, index) => ({
      user_id: user.id,
      name,
      slug: name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
      sort_order: index + 1,
      color: getColorForStatus(name, index),
      is_default: index === 0
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

  return {
    statuses,
    loading,
    error,
    addStatus,
    updateStatus,
    deleteStatus,
    reorderStatuses,
    applyTemplate,
    createCustomWorkflow,
    reload: loadStatuses
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
