-- Reconcile tables used by the customer and owner agents. This migration is
-- deliberately idempotent because some production projects skipped the older
-- agent-memory migration while later phases were applied manually.

create table if not exists public.agent_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  source text not null default 'website' check (source in ('website', 'telegram')),
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  last_active_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists agent_conversation_session_idx
  on public.agent_conversation_messages (session_id, created_at desc);
create index if not exists agent_conversation_expiry_idx
  on public.agent_conversation_messages (expires_at);

create table if not exists public.owner_agent_memory (
  id uuid primary key default gen_random_uuid(),
  telegram_chat_id bigint not null,
  memory_type text not null default 'note',
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists owner_agent_memory_chat_idx
  on public.owner_agent_memory (telegram_chat_id, created_at desc);

create table if not exists public.owner_agent_events (
  id bigserial primary key,
  telegram_chat_id bigint,
  event_type text not null,
  product_slug text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists owner_agent_events_created_idx
  on public.owner_agent_events (created_at desc);

alter table public.agent_conversation_messages enable row level security;
alter table public.owner_agent_memory enable row level security;
alter table public.owner_agent_events enable row level security;

revoke all on table public.agent_conversation_messages from public, anon, authenticated;
revoke all on table public.owner_agent_memory from public, anon, authenticated;
revoke all on table public.owner_agent_events from public, anon, authenticated;
grant all on table public.agent_conversation_messages to service_role;
grant all on table public.owner_agent_memory to service_role;
grant all on table public.owner_agent_events to service_role;

create or replace function public.purge_expired_agent_conversations()
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare deleted_messages bigint;
begin
  delete from public.agent_conversation_messages where expires_at <= now();
  get diagnostics deleted_messages = row_count;
  return deleted_messages;
end;
$$;

revoke all on function public.purge_expired_agent_conversations() from public, anon, authenticated;
grant execute on function public.purge_expired_agent_conversations() to service_role;

do $$
begin
  if to_regclass('cron.job') is not null then
    if not exists (select 1 from cron.job where jobname = 'essenshea-purge-agent-conversations') then
      perform cron.schedule(
        'essenshea-purge-agent-conversations',
        '23 * * * *',
        'select public.purge_expired_agent_conversations();'
      );
    end if;
  end if;
end;
$$;
