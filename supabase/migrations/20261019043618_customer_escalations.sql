create table if not exists public.customer_escalations (
 id uuid primary key default gen_random_uuid(),
 fingerprint text not null unique,
 session_hash text not null,
 reason text not null,
 question text not null,
 answer text not null,
 status text not null default 'open' check(status in ('open','resolved')),
 notification_status text not null default 'pending' check(notification_status in ('pending','delivered')),
 attempts integer not null default 0,
 notified_owner_ids bigint[] not null default '{}',
 created_at timestamptz not null default now(),
 resolved_at timestamptz
);
alter table public.customer_escalations enable row level security;
revoke all on public.customer_escalations from anon,authenticated;
grant all on public.customer_escalations to service_role;
create index if not exists customer_escalations_pending_idx on public.customer_escalations(created_at) where status='open' and notification_status='pending';
-- Customer-derived text is operational evidence, never permanent global instructions.
select cron.schedule('essenshea-purge-customer-escalations','23 2 * * *', $$delete from public.customer_escalations where created_at < now() - interval '4 months'$$)
where not exists(select 1 from cron.job where jobname='essenshea-purge-customer-escalations');
