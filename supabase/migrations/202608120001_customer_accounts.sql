create table if not exists public.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text check (phone is null or char_length(phone) between 7 and 24),
  preferred_contact text not null default 'whatsapp'
    check (preferred_contact in ('phone', 'whatsapp', 'email')),
  default_fulfilment_method text not null default 'delivery'
    check (default_fulfilment_method in ('delivery', 'pickup', 'discuss')),
  default_delivery_location text check (
    default_delivery_location is null or char_length(default_delivery_location) <= 200
  ),
  delivery_notes text check (delivery_notes is null or char_length(delivery_notes) <= 500),
  marketing_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_carts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  updated_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists customer_user_id uuid references auth.users(id) on delete set null;

alter table public.eco_reward_accounts
  add column if not exists customer_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists eco_reward_accounts_customer_user_idx
  on public.eco_reward_accounts (customer_user_id)
  where customer_user_id is not null;

create index if not exists orders_customer_user_created_idx
  on public.orders (customer_user_id, created_at desc)
  where customer_user_id is not null;

alter table public.customer_profiles enable row level security;
alter table public.customer_carts enable row level security;

revoke all on table public.customer_profiles from anon, authenticated;
revoke all on table public.customer_carts from anon, authenticated;
grant select, insert, update on table public.customer_profiles to authenticated;
grant select, insert, update, delete on table public.customer_carts to authenticated;
grant all on table public.customer_profiles to service_role;
grant all on table public.customer_carts to service_role;

drop policy if exists "Customers read their profile" on public.customer_profiles;
create policy "Customers read their profile"
  on public.customer_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Customers create their profile" on public.customer_profiles;
create policy "Customers create their profile"
  on public.customer_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Customers update their profile" on public.customer_profiles;
create policy "Customers update their profile"
  on public.customer_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Customers read their cart" on public.customer_carts;
create policy "Customers read their cart"
  on public.customer_carts for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Customers create their cart" on public.customer_carts;
create policy "Customers create their cart"
  on public.customer_carts for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Customers update their cart" on public.customer_carts;
create policy "Customers update their cart"
  on public.customer_carts for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Customers clear their cart" on public.customer_carts;
create policy "Customers clear their cart"
  on public.customer_carts for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select on table public.orders, public.order_items to authenticated;

drop policy if exists "Customers read their orders" on public.orders;
create policy "Customers read their orders"
  on public.orders for select to authenticated
  using ((select auth.uid()) = customer_user_id);

drop policy if exists "Customers read items from their orders" on public.order_items;
create policy "Customers read items from their orders"
  on public.order_items for select to authenticated
  using (
    exists (
      select 1
      from public.orders
      where orders.id = order_items.order_id
        and orders.customer_user_id = (select auth.uid())
    )
  );
