-- Add task linkage to deal notes so task notes roll up into deal timeline
alter table public.deal_notes
  add column if not exists task_id uuid null references public.tasks(id) on delete set null;

create index if not exists deal_notes_task_id_idx on public.deal_notes (task_id);
