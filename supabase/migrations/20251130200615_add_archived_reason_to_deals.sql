-- Add archived_reason to deals for structured closed-lost analysis
alter table public.deals
  add column if not exists archived_reason text check (
    archived_reason is null
    or archived_reason in (
      'No Response / Ghosted',
      'Client Not Ready / Timeline Changed',
      'Chose Another Agent',
      'Financing Didn’t Work Out',
      'Deal Fell Through',
      'Other'
    )
  );

create index if not exists deals_archived_reason_idx on public.deals (archived_reason);
