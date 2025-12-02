import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Trash2, Edit2, Loader2, MessageSquare } from 'lucide-react';

interface Note {
  id: string;
  deal_id: string;
  user_id: string;
  content: string;
  task_id: string | null;
  created_at: string;
  updated_at: string;
  user_email?: string;
  user_name?: string;
}

interface DealNotesProps {
  dealId: string;
  taskId?: string;
  showTaskBadge?: boolean;
}

export default function DealNotes({ dealId, taskId, showTaskBadge = false }: DealNotesProps) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [noteContent, setNoteContent] = useState('');

  useEffect(() => {
    loadNotes();
  }, [dealId, taskId, user?.id]); // reload when context changes

  const loadNotes = async () => {
    try {
      const { data, error } = await supabase
        .from('deal_notes')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const scoped = taskId ? (data || []).filter((note: any) => note.task_id === taskId) : data || [];

      const notesWithUser = scoped.map((note: any) => ({
        ...note,
        user_email: user?.email,
        user_name: note.user_id === user?.id
          ? (user?.user_metadata?.name || user?.email?.split('@')[0] || 'You')
          : 'Team Member'
      }));

      setNotes(notesWithUser);
    } catch (err) {
      console.error('Error loading notes:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNote = async () => {
    if (!user || !noteContent.trim()) return;

    setSaving(true);
    try {
      if (editingNote) {
        const { error } = await (supabase
          .from('deal_notes') as any)
          .update({
            content: noteContent,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingNote.id);

        if (error) throw error;
      } else {
        const { error } = await (supabase
          .from('deal_notes') as any)
          .insert({
            deal_id: dealId,
            user_id: user.id,
            content: noteContent,
            task_id: taskId || null
          });

        if (error) throw error;
      }

      setNoteContent('');
      setEditingNote(null);
      setShowAddForm(false);
      loadNotes();
    } catch (err) {
      console.error('Error saving note:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note?')) return;

    try {
      const { error } = await supabase
        .from('deal_notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;

      loadNotes();
    } catch (err) {
      console.error('Error deleting note:', err);
    }
  };

  const handleEditNote = (note: Note) => {
    setEditingNote(note);
    setNoteContent(note.content);
    setShowAddForm(true);
  };

  const handleCancelEdit = () => {
    setEditingNote(null);
    setNoteContent('');
    setShowAddForm(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-[rgb(0,122,255)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-gray-600" strokeWidth={2} />
          <h3 className="font-semibold text-gray-900">Notes</h3>
          <span className="text-sm text-gray-500">({notes.length})</span>
        </div>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="hig-btn-secondary text-sm py-2"
          >
            <Plus className="w-4 h-4" strokeWidth={2} />
            <span>Add Note</span>
          </button>
        )}
      </div>

      {showAddForm && (
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200/60">
          <textarea
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            placeholder="Write a note..."
            className="hig-input min-h-[100px] resize-y"
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={handleCancelEdit}
              className="hig-btn-secondary text-sm py-2"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              onClick={handleSaveNote}
              disabled={saving || !noteContent.trim()}
              className="hig-btn-primary text-sm py-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                  <span>Saving...</span>
                </>
              ) : (
                <span>{editingNote ? 'Update' : 'Add'} Note</span>
              )}
            </button>
          </div>
        </div>
      )}

      {notes.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          No notes yet. Add your first note to track important information.
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className="bg-white border border-gray-200/60 rounded-xl p-4 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-sm mb-1">
                    <span className="font-medium text-gray-900">{note.user_name}</span>
                    <span className="text-gray-400">•</span>
                    <span className="text-gray-500">{formatDate(note.created_at)}</span>
                    {note.updated_at !== note.created_at && (
                      <>
                        <span className="text-gray-400">•</span>
                        <span className="text-gray-500 text-xs">edited</span>
                      </>
                    )}
                    {showTaskBadge && note.task_id && (
                      <>
                        <span className="text-gray-400">•</span>
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                          Task note
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {note.user_id === user?.id && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEditNote(note)}
                      className="p-1.5 text-gray-600 hover:text-[rgb(0,122,255)] hover:bg-blue-50 rounded-lg transition"
                      title="Edit note"
                    >
                      <Edit2 className="w-4 h-4" strokeWidth={2} />
                    </button>
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                      title="Delete note"
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={2} />
                    </button>
                  </div>
                )}
              </div>
              <p className="text-[15px] text-gray-700 whitespace-pre-wrap leading-relaxed">
                {note.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
