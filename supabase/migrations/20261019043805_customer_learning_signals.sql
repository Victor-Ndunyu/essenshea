create table if not exists public.customer_learning_signals (
 fingerprint text primary key,
 topic text not null check(topic in ('mens_care','turmeric','fragrance','delivery','price','ingredients','haircare')),
 created_at timestamptz not null default now()
);
alter table public.customer_learning_signals enable row level security;
revoke all on public.customer_learning_signals from anon,authenticated;
grant all on public.customer_learning_signals to service_role;
create index if not exists customer_learning_signals_created_idx on public.customer_learning_signals(created_at);
create or replace function public.owner_customer_signal_totals()
returns table(topic text,mentions bigint) language sql stable security invoker set search_path=public,pg_temp as $$
 select topic,count(*) from public.customer_learning_signals where created_at>now()-interval '30 days' group by topic order by count(*) desc,topic;
$$;
revoke all on function public.owner_customer_signal_totals() from public,anon,authenticated;
grant execute on function public.owner_customer_signal_totals() to service_role;
select cron.schedule('essenshea-purge-customer-signals','27 2 * * *', $$delete from public.customer_learning_signals where created_at < now() - interval '90 days'$$)
where not exists(select 1 from cron.job where jobname='essenshea-purge-customer-signals');
