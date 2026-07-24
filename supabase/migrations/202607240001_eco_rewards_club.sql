create table if not exists public.eco_reward_accounts (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null check (char_length(customer_name) between 2 and 120),
  phone text not null unique check (phone ~ '^254[17][0-9]{8}$'),
  access_code_hash text not null,
  current_punches integer not null default 0 check (current_punches between 0 and 7),
  consented_at timestamptz not null,
  consent_source text not null default 'shop' check (consent_source in ('shop', 'website', 'whatsapp')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.eco_reward_refills (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.eco_reward_accounts(id) on delete restrict,
  order_id uuid references public.orders(id) on delete set null,
  submitted_containers integer not null check (submitted_containers between 1 and 25),
  accepted_containers integer not null default 0 check (
    accepted_containers between 0 and submitted_containers
  ),
  status text not null check (status in ('approved', 'rejected')),
  rejection_reason text check (
    rejection_reason is null or rejection_reason in ('damaged', 'missing_label', 'not_eligible', 'other')
  ),
  payment_confirmed boolean not null default false,
  product_name text,
  fulfilment_method text not null default 'pickup' check (fulfilment_method in ('pickup', 'delivery')),
  notes text,
  approved_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.eco_reward_benefits (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.eco_reward_accounts(id) on delete restrict,
  refill_id uuid not null references public.eco_reward_refills(id) on delete restrict,
  reward_type text not null check (reward_type in ('five_percent', 'free_sample', 'fifty_percent')),
  status text not null default 'available' check (status in ('available', 'redeemed', 'voided')),
  earned_at timestamptz not null default now(),
  redeemed_at timestamptz,
  redeemed_on_product text,
  check (
    (status = 'redeemed' and redeemed_at is not null)
    or (status <> 'redeemed' and redeemed_at is null)
  )
);

create index if not exists eco_reward_refills_account_idx
  on public.eco_reward_refills (account_id, created_at desc);
create index if not exists eco_reward_benefits_account_idx
  on public.eco_reward_benefits (account_id, status, earned_at desc);

alter table public.eco_reward_accounts enable row level security;
alter table public.eco_reward_refills enable row level security;
alter table public.eco_reward_benefits enable row level security;

revoke all on table public.eco_reward_accounts from anon, authenticated;
revoke all on table public.eco_reward_refills from anon, authenticated;
revoke all on table public.eco_reward_benefits from anon, authenticated;
grant all on table public.eco_reward_accounts to service_role;
grant all on table public.eco_reward_refills to service_role;
grant all on table public.eco_reward_benefits to service_role;

create or replace function public.record_eco_reward_refill(
  p_account_id uuid,
  p_submitted_containers integer,
  p_accepted_containers integer,
  p_payment_confirmed boolean,
  p_product_name text,
  p_fulfilment_method text,
  p_approved_by text,
  p_rejection_reason text default null,
  p_notes text default null,
  p_order_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_row public.eco_reward_accounts%rowtype;
  refill_id uuid;
  punch integer;
  reward text;
  rewards text[] := array[]::text[];
  refill_status text;
begin
  if p_submitted_containers < 1 or p_submitted_containers > 25 then
    raise exception 'Submitted containers must be between 1 and 25';
  end if;
  if p_accepted_containers < 0 or p_accepted_containers > p_submitted_containers then
    raise exception 'Accepted containers are invalid';
  end if;
  if p_accepted_containers > 0 and not p_payment_confirmed then
    raise exception 'Payment must be confirmed before punches are awarded';
  end if;
  if p_accepted_containers = 0 and p_rejection_reason is null then
    raise exception 'A rejection reason is required';
  end if;

  select * into account_row
  from public.eco_reward_accounts
  where id = p_account_id and active = true
  for update;
  if not found then raise exception 'Active Eco-Rewards account not found'; end if;

  refill_status := case when p_accepted_containers > 0 then 'approved' else 'rejected' end;
  insert into public.eco_reward_refills (
    account_id, order_id, submitted_containers, accepted_containers, status,
    rejection_reason, payment_confirmed, product_name, fulfilment_method, notes, approved_by
  ) values (
    p_account_id, p_order_id, p_submitted_containers, p_accepted_containers, refill_status,
    case when p_accepted_containers = 0 then p_rejection_reason else null end,
    p_payment_confirmed, nullif(trim(p_product_name), ''), p_fulfilment_method,
    nullif(trim(p_notes), ''), p_approved_by
  ) returning id into refill_id;

  punch := account_row.current_punches;
  for counter in 1..p_accepted_containers loop
    punch := punch + 1;
    reward := case punch
      when 2 then 'five_percent'
      when 5 then 'free_sample'
      when 8 then 'fifty_percent'
      else null
    end;
    if reward is not null then
      insert into public.eco_reward_benefits (account_id, refill_id, reward_type)
      values (p_account_id, refill_id, reward);
      rewards := array_append(rewards, reward);
    end if;
    if punch = 8 then punch := 0; end if;
  end loop;

  update public.eco_reward_accounts
  set current_punches = punch, updated_at = now()
  where id = p_account_id;

  return jsonb_build_object(
    'refill_id', refill_id,
    'current_punches', punch,
    'rewards_earned', to_jsonb(rewards)
  );
end;
$$;

revoke all on function public.record_eco_reward_refill(
  uuid, integer, integer, boolean, text, text, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.record_eco_reward_refill(
  uuid, integer, integer, boolean, text, text, text, text, text, uuid
) to service_role;

-- Eco-Rewards and customer order history are retained until a customer asks
-- Essenshea to remove them. Continue expiring only transient operational data.
do $$
declare job_id bigint;
begin
  select jobid into job_id from cron.job
  where jobname = 'essenshea-purge-expired-customer-data';
  if job_id is not null then perform cron.unschedule(job_id); end if;
end
$$;

alter table public.orders alter column data_retention_until drop not null;
alter table public.orders alter column data_retention_until drop default;
update public.orders set data_retention_until = null;

create or replace function public.purge_expired_essenshea_data()
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare deleted_limits bigint;
begin
  delete from public.api_rate_limits where expires_at <= now();
  get diagnostics deleted_limits = row_count;
  delete from public.operational_events where created_at <= now() - interval '12 months';
  return deleted_limits;
end;
$$;
