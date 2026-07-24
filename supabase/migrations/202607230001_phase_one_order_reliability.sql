create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  order_type text not null check (
    order_type in (
      'cart',
      'product_request',
      'custom_request',
      'wholesale',
      'retail',
      'general',
      'agent_handoff'
    )
  ),
  source text not null default 'website',
  status text not null default 'new' check (
    status in (
      'new',
      'contacted',
      'confirmed',
      'in_preparation',
      'ready_for_pickup',
      'dispatched',
      'completed',
      'cancelled'
    )
  ),
  customer_name text not null,
  customer_phone text,
  customer_email text,
  customer_contact text not null,
  preferred_contact text not null default 'phone' check (
    preferred_contact in ('phone', 'whatsapp', 'email', 'telegram')
  ),
  fulfilment_method text not null default 'discuss' check (
    fulfilment_method in ('delivery', 'pickup', 'discuss')
  ),
  delivery_location text,
  customer_notes text,
  currency text not null default 'KES',
  payment_status text not null default 'awaiting_confirmation' check (
    payment_status in ('awaiting_confirmation', 'awaiting_payment', 'paid', 'failed', 'refunded')
  ),
  eco_rewards_opt_in boolean not null default false,
  eco_rewards_eligible_until timestamptz,
  notification_status text not null default 'pending' check (
    notification_status in ('pending', 'delivered', 'failed')
  ),
  notified_at timestamptz,
  data_retention_until timestamptz not null default (now() + interval '4 months'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_slug text,
  title text not null,
  quantity integer not null check (quantity between 1 and 100),
  price_text text not null default 'Price on request',
  unit_price numeric(12, 2) check (unit_price is null or unit_price >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.notification_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  channel text not null check (channel in ('telegram', 'whatsapp', 'email')),
  status text not null check (status in ('accepted', 'delivered', 'failed')),
  provider_message_id text,
  error_message text,
  attempted_at timestamptz not null default now()
);

create table if not exists public.api_rate_limits (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null,
  window_start timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  expires_at timestamptz not null,
  unique (key_hash, window_start)
);

create table if not exists public.operational_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  severity text not null default 'error' check (severity in ('warning', 'error', 'critical')),
  fingerprint text,
  safe_message text not null,
  metadata jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_customer_phone_idx on public.orders (customer_phone)
  where customer_phone is not null;
create index if not exists orders_customer_email_idx on public.orders (customer_email)
  where customer_email is not null;
create index if not exists orders_eco_rewards_idx
  on public.orders (eco_rewards_eligible_until)
  where eco_rewards_opt_in = true;
create index if not exists orders_notification_status_idx
  on public.orders (notification_status, created_at desc);
create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists notification_attempts_order_id_idx
  on public.notification_attempts (order_id, attempted_at desc);
create index if not exists operational_events_unresolved_idx
  on public.operational_events (created_at desc)
  where resolved_at is null;
create index if not exists api_rate_limits_expiry_idx on public.api_rate_limits (expires_at);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.notification_attempts enable row level security;
alter table public.api_rate_limits enable row level security;
alter table public.operational_events enable row level security;

alter table if exists public.telegram_sessions enable row level security;

revoke all on table public.orders from anon, authenticated;
revoke all on table public.order_items from anon, authenticated;
revoke all on table public.notification_attempts from anon, authenticated;
revoke all on table public.api_rate_limits from anon, authenticated;
revoke all on table public.operational_events from anon, authenticated;
revoke all on table public.telegram_sessions from anon, authenticated;

grant all on table public.orders to service_role;
grant all on table public.order_items to service_role;
grant all on table public.notification_attempts to service_role;
grant all on table public.api_rate_limits to service_role;
grant all on table public.operational_events to service_role;
grant all on table public.telegram_sessions to service_role;

create or replace function public.purge_expired_essenshea_data()
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deleted_orders bigint;
begin
  delete from public.orders
  where data_retention_until <= now();
  get diagnostics deleted_orders = row_count;

  delete from public.api_rate_limits
  where expires_at <= now();

  delete from public.operational_events
  where created_at <= now() - interval '4 months';

  return deleted_orders;
end;
$$;

revoke all on function public.purge_expired_essenshea_data() from public, anon, authenticated;
grant execute on function public.purge_expired_essenshea_data() to service_role;

do $$
begin
  if not exists (
    select 1 from cron.job where jobname = 'essenshea-purge-expired-customer-data'
  ) then
    perform cron.schedule(
      'essenshea-purge-expired-customer-data',
      '17 2 * * *',
      'select public.purge_expired_essenshea_data();'
    );
  end if;
end
$$;
