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
  on public.agent_conversation_messages (last_active_at);

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
create index if not exists owner_agent_memory_content_idx
  on public.owner_agent_memory using gin (to_tsvector('english', content));

alter table public.agent_conversation_messages enable row level security;
alter table public.owner_agent_memory enable row level security;

revoke all on table public.agent_conversation_messages from anon, authenticated;
revoke all on table public.owner_agent_memory from anon, authenticated;

grant all on table public.agent_conversation_messages to service_role;
grant all on table public.owner_agent_memory to service_role;

drop policy if exists "agent conversation service role only" on public.agent_conversation_messages;
create policy "agent conversation service role only" on public.agent_conversation_messages
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "owner memory service role only" on public.owner_agent_memory;
create policy "owner memory service role only" on public.owner_agent_memory
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create or replace function public.purge_expired_agent_conversations()
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deleted_messages bigint;
begin
  delete from public.agent_conversation_messages
  where last_active_at <= now() - interval '24 hours'
     or expires_at <= now();
  get diagnostics deleted_messages = row_count;
  return deleted_messages;
end;
$$;
