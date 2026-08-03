-- Phase 1 security hardening: plaintext secrets are removed and every private
-- table is explicitly inaccessible to browser-facing database roles.

alter table if exists public.eco_reward_accounts
  drop column if exists access_code;

do $$
declare
  private_table text;
begin
  foreach private_table in array array[
    'orders',
    'order_items',
    'notification_attempts',
    'api_rate_limits',
    'operational_events',
    'telegram_sessions',
    'eco_reward_accounts',
    'eco_reward_refills',
    'eco_reward_benefits',
    'catalog_overrides',
    'owner_agent_events',
    'agent_conversation_messages',
    'owner_agent_memory'
  ]
  loop
    if to_regclass('public.' || private_table) is not null then
      execute format('alter table public.%I enable row level security', private_table);
      execute format('revoke all on table public.%I from public, anon, authenticated', private_table);
      execute format('grant all on table public.%I to service_role', private_table);
    end if;
  end loop;
end
$$;

comment on column public.eco_reward_accounts.access_code_hash is
  'One-way HMAC of the phone-bound access code. Never store the readable code.';
