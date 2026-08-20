alter table public.orders
  add column if not exists total_amount numeric(12, 2)
    check (total_amount is null or total_amount >= 0),
  add column if not exists payment_method text
    check (payment_method is null or payment_method in ('mpesa', 'manual'));

create table if not exists public.mpesa_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  checkout_request_id text not null unique,
  merchant_request_id text,
  amount numeric(12, 2) not null check (amount > 0),
  phone_number text not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  result_code integer,
  result_description text,
  mpesa_receipt_number text unique,
  transaction_date text,
  callback_payload jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mpesa_payments_order_id_idx on public.mpesa_payments (order_id, created_at desc);
create index if not exists mpesa_payments_pending_idx on public.mpesa_payments (created_at)
  where status = 'pending';

alter table public.mpesa_payments enable row level security;
revoke all on table public.mpesa_payments from anon, authenticated;
grant all on table public.mpesa_payments to service_role;

