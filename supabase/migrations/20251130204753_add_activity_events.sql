-- Activity feed for manager notifications
create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  target_user_id uuid not null,
  event_type text not null check (event_type in ('deal_status_change', 'deal_deleted', 'task_created')),
  deal_id uuid,
  task_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);

alter table public.activity_events enable row level security;

create index if not exists activity_events_created_at_idx on public.activity_events (created_at desc);
create index if not exists activity_events_actor_idx on public.activity_events (actor_id);
create index if not exists activity_events_target_idx on public.activity_events (target_user_id);

create policy "activity_events_select" on public.activity_events
for select
using (
  auth.uid() = actor_id
  or auth.uid() = target_user_id
  or auth.uid() in (select user_id from get_accessible_agents())
);

create policy "activity_events_insert" on public.activity_events
for insert
with check (auth.uid() = actor_id);

create or replace function public.log_deal_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.activity_events (actor_id, target_user_id, event_type, deal_id, payload)
    values (
      v_actor,
      new.user_id,
      'deal_status_change',
      new.id,
      jsonb_build_object(
        'client_name', coalesce(new.client_name, ''),
        'property_address', coalesce(new.property_address, ''),
        'from_status', coalesce(old.status, ''),
        'to_status', coalesce(new.status, '')
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_deal_status_change on public.deals;
create trigger trg_log_deal_status_change
after update on public.deals
for each row
execute function public.log_deal_status_change();

create or replace function public.log_deal_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    return old;
  end if;

  insert into public.activity_events (actor_id, target_user_id, event_type, deal_id, payload)
  values (
    v_actor,
    old.user_id,
    'deal_deleted',
    old.id,
    jsonb_build_object(
      'client_name', coalesce(old.client_name, ''),
      'property_address', coalesce(old.property_address, '')
    )
  );
  return old;
end;
$$;

drop trigger if exists trg_log_deal_deleted on public.deals;
create trigger trg_log_deal_deleted
before delete on public.deals
for each row
execute function public.log_deal_deleted();

create or replace function public.log_task_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    return new;
  end if;

  insert into public.activity_events (actor_id, target_user_id, event_type, task_id, deal_id, payload)
  values (
    v_actor,
    new.user_id,
    'task_created',
    new.id,
    new.deal_id,
    jsonb_build_object(
      'title', coalesce(new.title, ''),
      'due_date', new.due_date,
      'deal_id', new.deal_id
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_log_task_created on public.tasks;
create trigger trg_log_task_created
after insert on public.tasks
for each row
execute function public.log_task_created();
