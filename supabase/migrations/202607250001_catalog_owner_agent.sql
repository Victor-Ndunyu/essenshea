create table if not exists public.catalog_overrides (
  product_slug text primary key,
  category_slug text not null,
  product_name text,
  description text,
  price_text text,
  price_value numeric,
  image_url text,
  stock integer check (stock is null or stock >= 0),
  available_by_order boolean default false,
  hidden boolean default false,
  is_new boolean default false,
  sort_order integer,
  updated_by text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists catalog_overrides_category_slug_idx on public.catalog_overrides(category_slug);

alter table public.catalog_overrides enable row level security;

drop policy if exists "catalog overrides service role only" on public.catalog_overrides;
create policy "catalog overrides service role only" on public.catalog_overrides
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create table if not exists public.owner_agent_events (
  id bigserial primary key,
  telegram_chat_id bigint,
  event_type text not null,
  product_slug text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.owner_agent_events enable row level security;

drop policy if exists "owner events service role only" on public.owner_agent_events;
create policy "owner events service role only" on public.owner_agent_events
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
