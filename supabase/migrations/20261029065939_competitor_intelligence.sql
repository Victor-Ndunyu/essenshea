create table public.competitor_snapshots (
 id uuid primary key default gen_random_uuid(), run_id uuid not null,
 competitor_id text not null check (competitor_id in ('ythera','cinnabar-green')),
 captured_at timestamptz not null default now(),
 status text not null check(status in ('ok','unavailable')), evidence jsonb,
 unique(run_id,competitor_id),
 check ((status='ok' and evidence is not null) or (status='unavailable' and evidence is null))
);
create index competitor_snapshots_recent on public.competitor_snapshots(captured_at desc);
create table public.competitor_scan_control (id boolean primary key default true check(id), next_scan_after timestamptz not null);
create table public.owner_competitor_preferences (
 telegram_chat_id bigint primary key check(telegram_chat_id>0), nudges_enabled boolean not null default true,
 first_seen_at timestamptz not null default now(), last_reviewed_at timestamptz, last_nudged_at timestamptz, snoozed_until timestamptz
);
alter table public.competitor_snapshots enable row level security;
alter table public.competitor_scan_control enable row level security;
alter table public.owner_competitor_preferences enable row level security;
revoke all on public.competitor_snapshots, public.competitor_scan_control, public.owner_competitor_preferences from anon, authenticated;
grant all on public.competitor_snapshots, public.competitor_scan_control, public.owner_competitor_preferences to service_role;
create function public.claim_competitor_scan() returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare claimed boolean;
begin
 insert into competitor_scan_control(id,next_scan_after) values(true,now()+interval '15 minutes')
 on conflict(id) do update set next_scan_after=excluded.next_scan_after where competitor_scan_control.next_scan_after<=now()
 returning id into claimed;
 if claimed then
  delete from competitor_snapshots where captured_at<now()-interval '180 days';
  return gen_random_uuid();
 end if;
 return null;
end;$$;
create function public.claim_competitor_nudge(p_chat_id bigint) returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare claimed bigint;
begin
 insert into owner_competitor_preferences(telegram_chat_id) values(p_chat_id) on conflict do nothing;
 update owner_competitor_preferences set last_nudged_at=now()
 where telegram_chat_id=p_chat_id and nudges_enabled
 and coalesce(last_reviewed_at,first_seen_at)<=now()-interval '14 days'
 and (last_nudged_at is null or last_nudged_at<=now()-interval '14 days')
 and (snoozed_until is null or snoozed_until<=now())
 and exists(select 1 from competitor_snapshots where status='ok' and captured_at between now()-interval '8 days' and now())
 returning telegram_chat_id into claimed;
 return claimed is not null;
end;$$;
revoke all on function public.claim_competitor_scan(), public.claim_competitor_nudge(bigint) from public,anon,authenticated;
grant execute on function public.claim_competitor_scan(), public.claim_competitor_nudge(bigint) to service_role;
