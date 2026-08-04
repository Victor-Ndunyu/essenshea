create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'search_no_results', 'product_view', 'request_item_added',
    'checkout_started', 'order_submitted', 'eco_rewards_interest'
  )),
  product_slug text,
  category_slug text,
  search_term text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_type_created_idx
  on public.analytics_events (event_type, created_at desc);
create index if not exists analytics_events_product_created_idx
  on public.analytics_events (product_slug, created_at desc)
  where product_slug is not null;

alter table public.analytics_events enable row level security;
revoke all on table public.analytics_events from public, anon, authenticated;
grant all on table public.analytics_events to service_role;

create or replace function public.purge_expired_essenshea_analytics()
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare deleted_events bigint;
begin
  delete from public.analytics_events where created_at <= now() - interval '13 months';
  get diagnostics deleted_events = row_count;
  return deleted_events;
end;
$$;

revoke all on function public.purge_expired_essenshea_analytics() from public, anon, authenticated;
grant execute on function public.purge_expired_essenshea_analytics() to service_role;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'essenshea-purge-expired-analytics') then
    perform cron.schedule(
      'essenshea-purge-expired-analytics',
      '41 2 * * *',
      'select public.purge_expired_essenshea_analytics();'
    );
  end if;
end;
$$;
