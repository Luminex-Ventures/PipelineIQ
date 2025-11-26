import { useState, useEffect } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Database } from '../lib/database.types';

type Deal = Database['public']['Tables']['deals']['Row'];

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated: () => void;
}

export default function CreateTaskModal({ isOpen, onClose, onTaskCreated }: CreateTaskModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [formData, setFormData] = useState({
    deal_id: '',
    title: '',
    description: '',
    due_date: ''
  });

  useEffect(() => {
    if (isOpen && user) {
      loadDeals();
    }
  }, [isOpen, user]);

  const loadDeals = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('deals')
      .select('*')
      .eq('user_id', user.id)
      .order('client_name');

    if (!error && data) {
      setDeals(data);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.deal_id || !formData.title.trim()) {
      return;
    }

    setLoading(true);

    const { error } = await supabase
      .from('tasks')
      .insert({
        deal_id: formData.deal_id,
        user_id: user.id,
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        due_date: formData.due_date || null,
        completed: false
      });

    setLoading(false);

    if (!error) {
      setFormData({
        deal_id: '',
        title: '',
        description: '',
        due_date: ''
      });
      onTaskCreated();
      onClose();
    } else {
      console.error('Error creating task:', error);
      alert('Failed to create task. Please try again.');
    }
  };

  const handleClose = () => {
    setFormData({
      deal_id: '',
      title: '',
      description: '',
      due_date: ''
    });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create new task" size="md">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="deal_id" className="block text-sm font-semibold text-gray-700 mb-2">
            Deal <span className="text-red-500">*</span>
          </label>
          <select
            id="deal_id"
            value={formData.deal_id}
            onChange={(e) => setFormData({ ...formData, deal_id: e.target.value })}
            required
            className="w-full rounded-xl border border-gray-200/70 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm focus:border-[var(--app-accent)]/40 focus:ring-2 focus:ring-[var(--app-accent)]/15"
          >
            <option value="">Select a deal...</option>
            {deals.map((deal) => (
              <option key={deal.id} value={deal.id}>
                {deal.client_name} - {deal.property_address}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="title" className="block text-sm font-semibold text-gray-700 mb-2">
            Task title <span className="text-red-500">*</span>
          </label>
          <input
            id="title"
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            required
            placeholder="e.g., Schedule home inspection"
            className="w-full rounded-xl border border-gray-200/70 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm focus:border-[var(--app-accent)]/40 focus:ring-2 focus:ring-[var(--app-accent)]/15"
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-semibold text-gray-700 mb-2">
            Description (optional)
          </label>
          <textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Add any additional details..."
            rows={3}
            className="w-full rounded-xl border border-gray-200/70 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm focus:border-[var(--app-accent)]/40 focus:ring-2 focus:ring-[var(--app-accent)]/15"
          />
        </div>

        <div>
          <label htmlFor="due_date" className="block text-sm font-semibold text-gray-700 mb-2">
            Due date (optional)
          </label>
          <input
            id="due_date"
            type="date"
            value={formData.due_date}
            onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
            className="w-full rounded-xl border border-gray-200/70 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm focus:border-[var(--app-accent)]/40 focus:ring-2 focus:ring-[var(--app-accent)]/15"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200/60">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={loading || !formData.deal_id || !formData.title.trim()}
          >
            {loading ? 'Creating...' : 'Create task'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

