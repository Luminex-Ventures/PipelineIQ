/*
  # Add deal stage events

  - Track pipeline stage transitions for true funnel conversion metrics
  - Capture lifecycle stage changes on deal insert/update
*/

create table if not exists public.deal_stage_events (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  actor_id uuid,
  from_status_id uuid references public.pipeline_statuses(id) on delete set null,
  to_status_id uuid references public.pipeline_statuses(id) on delete set null,
  from_stage text check (from_stage in ('new', 'in_progress', 'closed', 'dead')),
  to_stage text not null check (to_stage in ('new', 'in_progress', 'closed', 'dead')),
  changed_at timestamptz not null default now()
);

alter table public.deal_stage_events enable row level security;

create index if not exists deal_stage_events_deal_changed_at_idx
  on public.deal_stage_events (deal_id, changed_at desc);
create index if not exists deal_stage_events_changed_at_idx
  on public.deal_stage_events (changed_at desc);
create index if not exists deal_stage_events_to_stage_idx
  on public.deal_stage_events (to_stage, changed_at desc);

create policy "deal_stage_events_select" on public.deal_stage_events
for select
using (
  exists (
    select 1
    from public.deals d
    where d.id = deal_stage_events.deal_id
      and d.user_id in (select user_id from public.get_accessible_agents())
  )
);

create policy "deal_stage_events_insert" on public.deal_stage_events
for insert
with check (auth.uid() = actor_id or auth.uid() is null);

create or replace function public.log_deal_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_from_stage text;
  v_to_stage text;
  v_from_status uuid;
  v_to_status uuid;
begin
  if tg_op = 'UPDATE' then
    if new.pipeline_status_id is not distinct from old.pipeline_status_id
      and new.status is not distinct from old.status then
      return new;
    end if;
  end if;

  v_from_status := case when tg_op = 'UPDATE' then old.pipeline_status_id else null end;
  v_to_status := new.pipeline_status_id;

  if v_from_status is not null then
    select lifecycle_stage into v_from_stage from public.pipeline_statuses where id = v_from_status;
  end if;
  if v_from_stage is null and tg_op = 'UPDATE' then
    v_from_stage := old.status::text;
  end if;

  if v_to_status is not null then
    select lifecycle_stage into v_to_stage from public.pipeline_statuses where id = v_to_status;
  end if;
  if v_to_stage is null then
    v_to_stage := new.status::text;
  end if;

  if v_to_stage is null then
    return new;
  end if;

  if v_from_stage is not null and v_from_stage = v_to_stage then
    return new;
  end if;

  insert into public.deal_stage_events (
    deal_id,
    actor_id,
    from_status_id,
    to_status_id,
    from_stage,
    to_stage,
    changed_at
  ) values (
    new.id,
    v_actor,
    v_from_status,
    v_to_status,
    v_from_stage,
    v_to_stage,
    now()
  );

  return new;
end;
$$;

drop trigger if exists trg_log_deal_stage_change on public.deals;
create trigger trg_log_deal_stage_change
after insert or update of pipeline_status_id, status on public.deals
for each row
execute function public.log_deal_stage_change();
