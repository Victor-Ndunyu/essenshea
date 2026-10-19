alter table public.customer_escalations add column if not exists next_attempt_at timestamptz not null default now();
