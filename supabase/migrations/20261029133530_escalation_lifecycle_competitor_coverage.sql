alter table public.competitor_snapshots drop constraint competitor_snapshots_competitor_id_check;
alter table public.competitor_snapshots add constraint competitor_snapshots_competitor_id_check check(competitor_id in ('ythera','cinnabar-green','organic-savanna','marini-naturals'));
alter table public.customer_escalations drop constraint customer_escalations_status_check;
alter table public.customer_escalations add constraint customer_escalations_status_check check(status in ('open','waiting','resolved','dismissed'));
alter table public.customer_escalations add column decision_history jsonb not null default '[]', add column follow_up_at timestamptz not null default (now()+interval '3 days');
create table public.owner_escalation_context (
 telegram_chat_id bigint primary key,
 selected_id uuid references public.customer_escalations(id) on delete set null,
 selected_at timestamptz,
 awaiting_details boolean not null default false,
 last_alert_at timestamptz,
 lease_until timestamptz
);
alter table public.owner_escalation_context enable row level security;
revoke all on public.owner_escalation_context from public,anon,authenticated;
grant all on public.owner_escalation_context to service_role;
create function public.decide_customer_escalation(p_id uuid,p_owner bigint,p_status text,p_note text,p_days integer default 3)
returns boolean language plpgsql security invoker set search_path=public as $$
begin
 if p_status is null or p_note is null or p_days is null or p_owner is null or p_status not in ('open','waiting','resolved','dismissed') or length(trim(p_note))=0 or length(p_note)>1600 or p_days not between 1 and 30 then raise exception 'Invalid decision'; end if;
 update customer_escalations set status=p_status,
 resolved_at=case when p_status in ('resolved','dismissed') then now() else null end,
 notification_status='delivered',
 follow_up_at=now()+make_interval(days=>p_days),
 decision_history=decision_history || jsonb_build_array(jsonb_build_object('at',now(),'owner',p_owner,'status',p_status,'note',p_note,'follow_up_days',p_days))
 where id=p_id;
 return found;
end; $$;
create function public.claim_escalation_alert(p_owner bigint,p_reminder boolean default false)
returns boolean language plpgsql security invoker set search_path=public as $$
declare claimed bigint;
begin
 insert into owner_escalation_context(telegram_chat_id) values(p_owner) on conflict do nothing;
 update owner_escalation_context set lease_until=now()+interval '2 minutes'
 where telegram_chat_id=p_owner and (lease_until is null or lease_until<now())
 and (last_alert_at is null or last_alert_at<now()-case when p_reminder then interval '3 days' else interval '1 day' end)
 and exists(select 1 from customer_escalations where status in ('open','waiting') and
 case when p_reminder then follow_up_at<=now() else notification_status='pending' and attempts<5 and next_attempt_at<=now() and not (p_owner=any(notified_owner_ids)) end)
 returning telegram_chat_id into claimed;
 return claimed is not null;
end; $$;
revoke all on function public.decide_customer_escalation(uuid,bigint,text,text,integer),public.claim_escalation_alert(bigint,boolean) from public,anon,authenticated;
grant execute on function public.decide_customer_escalation(uuid,bigint,text,text,integer),public.claim_escalation_alert(bigint,boolean) to service_role;

create function public.acknowledge_escalation_alert(p_owner bigint,p_ids uuid[],p_owners bigint[])
returns void language sql security invoker set search_path=public as $$
 update customer_escalations set
 notified_owner_ids=array(select distinct x from unnest(notified_owner_ids || array[p_owner]) x),
 notification_status=case when p_owners <@ (notified_owner_ids || array[p_owner]) then 'delivered' else 'pending' end
 where id=any(p_ids);
$$;
revoke all on function public.acknowledge_escalation_alert(bigint,uuid[],bigint[]) from public,anon,authenticated;
grant execute on function public.acknowledge_escalation_alert(bigint,uuid[],bigint[]) to service_role;
-- Never delete a still-active case merely because it is old. Closed customer
-- reports and their decisions keep the existing four-month retention window.
select cron.alter_job(jobid, command := $job$delete from public.customer_escalations where status in ('resolved','dismissed') and resolved_at < now() - interval '4 months'$job$)
from cron.job where jobname='essenshea-purge-customer-escalations';
