/*
  # Fix analytics summary close_ts handling

  - Treat close_date as UTC midnight to avoid timezone drift
  - Keep deal_type filter cast and deal_types as text
*/

create or replace function public.get_analytics_summary(
  p_year int,
  p_user_ids uuid[],
  p_lead_source_ids uuid[] default '{}',
  p_pipeline_status_ids uuid[] default '{}',
  p_deal_types text[] default '{}',
  p_requesting_user_id uuid default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  start_ts timestamptz := make_timestamptz(p_year, 1, 1, 0, 0, 0, 'UTC');
  end_ts timestamptz := make_timestamptz(p_year + 1, 1, 1, 0, 0, 0, 'UTC');
  month_start timestamptz := date_trunc('month', now());
  month_end timestamptz := month_start + interval '1 month';
  is_current_year boolean := extract(year from now())::int = p_year;
  result jsonb;
begin
  with scoped_deals as (
    select d.*,
      coalesce((d.close_date::timestamp at time zone 'UTC'), d.closed_at) as close_ts,
      d.created_at as created_ts,
      coalesce(d.actual_sale_price, d.expected_sale_price, 0) as sale_price,
      (
        coalesce(d.actual_sale_price, d.expected_sale_price, 0)
        * coalesce(d.gross_commission_rate, 0)
      ) as gross_commission,
      (
        coalesce(d.actual_sale_price, d.expected_sale_price, 0)
        * coalesce(d.gross_commission_rate, 0)
        * (1 - coalesce(d.brokerage_split_rate, 0))
      ) as after_brokerage,
      (
        case
          when d.referral_out_rate is null then
            (
              coalesce(d.actual_sale_price, d.expected_sale_price, 0)
              * coalesce(d.gross_commission_rate, 0)
              * (1 - coalesce(d.brokerage_split_rate, 0))
            )
          else
            (
              coalesce(d.actual_sale_price, d.expected_sale_price, 0)
              * coalesce(d.gross_commission_rate, 0)
              * (1 - coalesce(d.brokerage_split_rate, 0))
              * (1 - d.referral_out_rate)
            )
        end
      ) as after_referral,
      (
        (
          case
            when d.referral_out_rate is null then
              (
                coalesce(d.actual_sale_price, d.expected_sale_price, 0)
                * coalesce(d.gross_commission_rate, 0)
                * (1 - coalesce(d.brokerage_split_rate, 0))
              )
            else
              (
                coalesce(d.actual_sale_price, d.expected_sale_price, 0)
                * coalesce(d.gross_commission_rate, 0)
                * (1 - coalesce(d.brokerage_split_rate, 0))
                * (1 - d.referral_out_rate)
              )
          end
        ) - coalesce(d.transaction_fee, 0)
      ) as net_commission
    from deals d
    where
      (coalesce(array_length(p_user_ids, 1), 0) = 0 or d.user_id = any(p_user_ids))
  ),
  filtered_deals as (
    select *
    from scoped_deals d
    where
      (coalesce(array_length(p_lead_source_ids, 1), 0) = 0 or d.lead_source_id = any(p_lead_source_ids))
      and (coalesce(array_length(p_pipeline_status_ids, 1), 0) = 0 or d.pipeline_status_id = any(p_pipeline_status_ids))
      and (coalesce(array_length(p_deal_types, 1), 0) = 0 or d.deal_type::text = any(p_deal_types))
  ),
  closed_year_deals as (
    select *
    from filtered_deals
    where status = 'closed'
      and close_ts >= start_ts
      and close_ts < end_ts
  ),
  yearly_stats as (
    select
      count(*) as closed_deals,
      coalesce(sum(sale_price), 0) as total_volume,
      coalesce(sum(net_commission), 0) as total_gci,
      coalesce(avg(sale_price), 0) as avg_sale_price,
      coalesce(avg(net_commission), 0) as avg_commission,
      sum(case when deal_type = 'buyer' then 1 when deal_type = 'buyer_and_seller' then 1 else 0 end) as buyer_deals,
      sum(case when deal_type = 'seller' then 1 when deal_type = 'buyer_and_seller' then 1 else 0 end) as seller_deals,
      coalesce(
        avg(
          case
            when close_ts is not null
              and created_ts is not null
              and close_ts >= created_ts
            then extract(epoch from (close_ts - created_ts)) / 86400
            else null
          end
        ),
        0
      ) as avg_days_to_close
    from closed_year_deals
  ),
  monthly as (
    select
      date_part('month', close_ts)::int as month,
      count(*) as deals,
      coalesce(sum(net_commission), 0) as gci
    from closed_year_deals
    group by 1
  ),
  monthly_rollup as (
    select jsonb_agg(
      jsonb_build_object(
        'month', trim(to_char(make_date(2000, m, 1), 'Mon')),
        'gci', coalesce(monthly.gci, 0),
        'deals', coalesce(monthly.deals, 0)
      )
      order by m
    ) as data
    from generate_series(1, 12) as m
    left join monthly on monthly.month = m
  ),
  lead_source_year_deals as (
    select *
    from filtered_deals
    where created_ts >= start_ts
      and created_ts < end_ts
  ),
  lead_source_stats as (
    select jsonb_agg(
      jsonb_build_object(
        'name', name,
        'total_deals', total_deals,
        'closed_deals', closed_deals,
        'conversion_rate', case when total_deals > 0 then (closed_deals::numeric / total_deals) * 100 else 0 end,
        'total_commission', total_commission
      )
      order by total_commission desc
    ) as data
    from (
      select
        coalesce(ls.name, 'Unknown') as name,
        count(*) as total_deals,
        count(*) filter (where status = 'closed') as closed_deals,
        coalesce(sum(net_commission) filter (where status = 'closed'), 0) as total_commission
      from lead_source_year_deals d
      left join lead_sources ls on ls.id = d.lead_source_id
      group by 1
    ) s
  ),
  archive_base as (
    select
      case
        when normalized = 'no response / ghosted' then 'No Response / Ghosted'
        when normalized = 'client not ready / timeline changed' then 'Client Not Ready / Timeline Changed'
        when normalized = 'chose another agent' then 'Chose Another Agent'
        when normalized = 'financing didn''t work out' then 'Financing Didn’t Work Out'
        when normalized = 'deal fell through' then 'Deal Fell Through'
        else 'Other'
      end as reason
    from (
      select lower(trim(translate(coalesce(archived_reason, ''), '’', ''''))) as normalized
      from filtered_deals
      where status = 'dead'
        and created_ts >= start_ts
        and created_ts < end_ts
    ) r
  ),
  archive_stats as (
    select
      jsonb_build_object(
        'total', total,
        'reasons', coalesce(reasons, '[]'::jsonb)
      ) as data
    from (
      select
        count(*) as total,
        jsonb_agg(
          jsonb_build_object(
            'reason', reason,
            'count', count,
            'percentage', case when total_count > 0 then (count::numeric / total_count) * 100 else 0 end
          )
          order by count desc
        ) filter (where count > 0) as reasons
      from (
        select reason, count(*) as count, sum(count(*)) over () as total_count
        from archive_base
        group by reason
      ) rc
    ) totals
  ),
  closing_this_month as (
    select jsonb_build_object(
      'count', case when is_current_year then count(*) else 0 end,
      'gci', case when is_current_year then coalesce(sum(net_commission), 0) else 0 end
    ) as data
    from filtered_deals
    where status in ('new', 'in_progress', 'closed')
      and close_ts >= month_start
      and close_ts < month_end
  ),
  funnel as (
    select jsonb_agg(
      jsonb_build_object(
        'from', from_stage,
        'to', to_stage,
        'entered', entered,
        'advanced', advanced,
        'rate', case when entered > 0 then (advanced::numeric / entered) * 100 else 0 end
      )
      order by ord
    ) as data
    from (
      select 1 as ord, 'lead' as from_stage, 'in_progress' as to_stage,
        count(*) filter (where stage_order >= 1) as entered,
        count(*) filter (where stage_order >= 2 and stage_order <> 4) as advanced
      from (
        select
          case
            when status = 'closed' then 3
            when status = 'dead' then 4
            when status in ('new', 'new_lead') then 1
            else 2
          end as stage_order
        from filtered_deals
        where created_ts >= start_ts
          and created_ts < end_ts
      ) s
      union all
      select 2 as ord, 'in_progress' as from_stage, 'closed_won' as to_stage,
        count(*) filter (where stage_order >= 2) as entered,
        count(*) filter (where stage_order >= 3 and stage_order <> 4) as advanced
      from (
        select
          case
            when status = 'closed' then 3
            when status = 'dead' then 4
            when status in ('new', 'new_lead') then 1
            else 2
          end as stage_order
        from filtered_deals
        where created_ts >= start_ts
          and created_ts < end_ts
      ) s2
    ) t
  ),
  filter_context as (
    select jsonb_build_object(
      'lead_sources', coalesce(lead_sources, '[]'::jsonb),
      'pipeline_stages', coalesce(pipeline_stages, '[]'::jsonb),
      'deal_types', coalesce(deal_types, '[]'::jsonb)
    ) as data
    from (
      select
        (
          select jsonb_agg(
            jsonb_build_object('id', ls.id, 'name', coalesce(ls.name, 'Unknown'))
            order by coalesce(ls.name, 'Unknown')
          )
          from (
            select distinct d.lead_source_id
            from scoped_deals d
            where d.created_ts >= start_ts
              and d.created_ts < end_ts
              and d.lead_source_id is not null
          ) ids
          join lead_sources ls on ls.id = ids.lead_source_id
        ) as lead_sources,
        (
          select jsonb_agg(
            jsonb_build_object('id', ps.id, 'name', ps.name, 'sort_order', ps.sort_order)
            order by ps.sort_order nulls last, ps.name
          )
          from (
            select distinct d.pipeline_status_id
            from scoped_deals d
            where d.created_ts >= start_ts
              and d.created_ts < end_ts
              and d.pipeline_status_id is not null
          ) ids
          join pipeline_statuses ps on ps.id = ids.pipeline_status_id
        ) as pipeline_stages,
        (
          select jsonb_agg(deal_type::text order by deal_type::text)
          from (
            select distinct d.deal_type
            from scoped_deals d
            where d.created_ts >= start_ts
              and d.created_ts < end_ts
              and d.deal_type is not null
          ) t
        ) as deal_types
    ) x
  ),
  annual_goal as (
    select coalesce(us.annual_gci_goal, 0) as annual_gci_goal
    from user_settings us
    where p_requesting_user_id is not null
      and us.user_id = p_requesting_user_id
  )
  select jsonb_build_object(
    'yearly_stats', jsonb_build_object(
      'closed_deals', ys.closed_deals,
      'total_volume', ys.total_volume,
      'total_gci', ys.total_gci,
      'avg_sale_price', ys.avg_sale_price,
      'avg_commission', ys.avg_commission,
      'buyer_deals', ys.buyer_deals,
      'seller_deals', ys.seller_deals,
      'avg_days_to_close', ys.avg_days_to_close
    ),
    'monthly_rollup', coalesce((select data from monthly_rollup), '[]'::jsonb),
    'lead_source_stats', coalesce((select data from lead_source_stats), '[]'::jsonb),
    'archive_stats', coalesce((select data from archive_stats), jsonb_build_object('total', 0, 'reasons', '[]'::jsonb)),
    'closing_this_month', (select data from closing_this_month),
    'funnel_transitions', coalesce((select data from funnel), '[]'::jsonb),
    'filter_context', (select data from filter_context),
    'annual_gci_goal', coalesce((select annual_gci_goal from annual_goal), 0)
  )
  into result
  from yearly_stats ys;

  return result;
end;
$$;

revoke all on function public.get_analytics_summary(int, uuid[], uuid[], uuid[], text[], uuid) from public;
grant execute on function public.get_analytics_summary(int, uuid[], uuid[], uuid[], text[], uuid) to authenticated;
