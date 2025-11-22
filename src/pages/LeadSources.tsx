import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Edit2, Trash2 } from 'lucide-react';

type PayoutStructure = 'standard' | 'partnership';

interface LeadSource {
  id: string;
  team_id: string | null;
  name: string;
  category: string | null;
  brokerage_split_rate: number;
  payout_structure: PayoutStructure;
  partnership_split_rate: number | null;
  partnership_notes: string | null;
}

interface LeadSourceFormState {
  name: string;
  category: string;
  brokerage_split_rate: number;
  payout_structure: PayoutStructure;
  partnership_split_rate: number;
  partnership_notes: string;
}

const createDefaultFormState = (): LeadSourceFormState => ({
  name: '',
  category: '',
  brokerage_split_rate: 20,
  payout_structure: 'standard',
  partnership_split_rate: 35,
  partnership_notes: ''
});

export default function LeadSources() {
  const { user, roleInfo } = useAuth();
  const teamId = roleInfo?.teamId || null;
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSource, setEditingSource] = useState<LeadSource | null>(null);
  const [formData, setFormData] = useState<LeadSourceFormState>(createDefaultFormState());

  useEffect(() => {
    loadSources();
  }, [user?.id, teamId]);

  const loadSources = async () => {
    if (!user) return;

    const { data: teamSources, error: teamError } = teamId
      ? await supabase
          .from('lead_sources')
          .select('*')
          .eq('team_id', teamId)
          .order('name')
      : ({ data: null, error: null } as any);

    if (teamError) {
      setLoading(false);
      return;
    }

    const { data } = teamSources?.length
      ? ({ data: teamSources } as any)
      : await supabase
          .from('lead_sources')
          .select('*')
          .eq('user_id', user.id)
          .order('name');

    if (data) setSources(data);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const payload = {
      name: formData.name,
      category: formData.category || null,
      team_id: teamId,
      brokerage_split_rate: formData.brokerage_split_rate / 100,
      payout_structure: formData.payout_structure,
      partnership_split_rate: formData.payout_structure === 'partnership' ? formData.partnership_split_rate / 100 : null,
      partnership_notes: formData.payout_structure === 'partnership' ? formData.partnership_notes.trim() || null : null
    };

    if (editingSource) {
      await supabase
        .from('lead_sources')
        .update(payload)
        .eq('id', editingSource.id);
    } else {
      await supabase
        .from('lead_sources')
        .insert({
          user_id: user.id,
          ...payload
        });
    }

    setShowModal(false);
    setFormData(createDefaultFormState());
    setEditingSource(null);
    loadSources();
  };

  const handleEdit = (source: LeadSource) => {
    setEditingSource(source);
    setFormData({
      name: source.name,
      category: source.category || '',
      brokerage_split_rate: source.brokerage_split_rate * 100,
      payout_structure: source.payout_structure,
      partnership_split_rate: (source.partnership_split_rate ?? 0.35) * 100,
      partnership_notes: source.partnership_notes || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this lead source?')) return;

    await supabase
      .from('lead_sources')
      .delete()
      .eq('id', id);

    loadSources();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Lead Sources</h1>
          <p className="text-gray-600 mt-2">Manage where your leads come from</p>
        </div>
        <button
          onClick={() => {
            setEditingSource(null);
            setFormData(createDefaultFormState());
            setShowModal(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
        >
          <Plus className="w-5 h-5" />
          <span>New Source</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Structure
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Broker Split
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sources.map(source => {
              const isPartnership = source.payout_structure === 'partnership';
              const partnerRate = ((source.partnership_split_rate ?? 0) * 100).toFixed(1);

              return (
                <tr key={source.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{source.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                      {source.category || 'uncategorized'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {isPartnership ? 'Partnership' : 'Standard'}
                    </div>
                    {isPartnership && (
                      <div className="text-xs text-gray-500">
                        {partnerRate}% to partner first
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{(source.brokerage_split_rate * 100).toFixed(1)}%</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleEdit(source)}
                      className="text-blue-600 hover:text-blue-900 mr-4"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(source.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {sources.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  No lead sources yet. Create your first one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {editingSource ? 'Edit Lead Source' : 'New Lead Source'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Zillow, Past Client Referral"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Deal Structure
                </label>
                <select
                  value={formData.payout_structure}
                  onChange={(e) => setFormData({ ...formData, payout_structure: e.target.value as PayoutStructure })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="standard">Standard – split directly with brokerage</option>
                  <option value="partnership">Partnership – partner paid first</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Partnerships are ideal for programs like Zillow Flex or Redfin, where their fee is paid before your team split.
                </p>
              </div>

              {formData.payout_structure === 'partnership' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Partner Split (% of gross commission)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="100"
                        value={formData.partnership_split_rate}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            partnership_split_rate: Number.isNaN(parseFloat(e.target.value))
                              ? 0
                              : parseFloat(e.target.value)
                          })
                        }
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="35"
                      />
                      <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      This amount is taken off the top before any brokerage split is calculated.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Partner Notes
                    </label>
                    <textarea
                      value={formData.partnership_notes}
                      onChange={(e) => setFormData({ ...formData, partnership_notes: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[80px]"
                      placeholder="e.g., Pay Zillow within 5 days, then 50/50 split with brokerage"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Brokerage Split (% to broker) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={formData.brokerage_split_rate}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        brokerage_split_rate: Number.isNaN(parseFloat(e.target.value))
                          ? 0
                          : parseFloat(e.target.value)
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="20"
                    required
                  />
                  <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Applied after any partnership payout.
                </p>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingSource(null);
                    setFormData(createDefaultFormState());
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
                >
                  {editingSource ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
