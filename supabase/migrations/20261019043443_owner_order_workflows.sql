create or replace function public.owner_apply_order_patch(p_reference text,p_expected timestamptz,p_field text,p_value text,p_actor bigint)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare o public.orders%rowtype; result jsonb; allowed text[];
begin
 select * into o from public.orders where reference=p_reference for update;
 if not found or o.updated_at is distinct from p_expected then raise exception 'Stale order preview'; end if;
 if p_actor is null or p_actor<=0 or p_value is null then raise exception 'Invalid actor or value'; end if;
 if p_field='status' then
  allowed := case o.status when 'new' then array['contacted','confirmed','cancelled'] when 'contacted' then array['confirmed','cancelled'] when 'confirmed' then array['in_preparation','cancelled'] when 'in_preparation' then array['ready_for_pickup','dispatched','cancelled'] when 'ready_for_pickup' then array['completed','cancelled'] when 'dispatched' then array['completed'] else array[]::text[] end;
  if not(p_value=any(allowed)) then raise exception 'Invalid status transition'; end if;
  if p_value='ready_for_pickup' and o.fulfilment_method<>'pickup' or p_value='dispatched' and o.fulfilment_method<>'delivery' then raise exception 'Fulfilment mismatch'; end if;
  update public.orders set status=p_value,updated_at=clock_timestamp() where id=o.id;
 elsif p_field='payment_status' then
  allowed := case o.payment_status when 'awaiting_confirmation' then array['awaiting_payment','paid','failed'] when 'awaiting_payment' then array['paid','failed'] when 'failed' then array['awaiting_payment','paid'] when 'paid' then array['refunded'] else array[]::text[] end;
  if not(p_value=any(allowed)) then raise exception 'Invalid payment transition'; end if;
  update public.orders set payment_status=p_value,updated_at=clock_timestamp() where id=o.id;
 elsif p_field='fulfilment_method' then
  if p_value not in ('delivery','pickup','discuss') or o.status in ('dispatched','completed','cancelled') then raise exception 'Invalid fulfilment update'; end if;
  update public.orders set fulfilment_method=p_value,updated_at=clock_timestamp() where id=o.id;
 elsif p_field='delivery_location' then
  if length(trim(p_value))=0 or length(p_value)>200 or o.status in ('dispatched','completed','cancelled') then raise exception 'Invalid delivery update'; end if;
  update public.orders set delivery_location=p_value,updated_at=clock_timestamp() where id=o.id;
 elsif p_field='total_amount' then
  if p_value !~ '^[0-9]+(\.[0-9]{1,2})?$' or p_value::numeric>10000000 or o.payment_status in ('paid','refunded') then raise exception 'Invalid total'; end if;
  update public.orders set total_amount=p_value::numeric,updated_at=clock_timestamp() where id=o.id;
 else raise exception 'Unsupported order field'; end if;
 select jsonb_build_object('reference',reference,'status',status,'payment_status',payment_status,'fulfilment_method',fulfilment_method,'total_amount',total_amount,'delivery_location',delivery_location,'updated_at',updated_at) into result from public.orders where id=o.id;
 insert into public.owner_agent_events(telegram_chat_id,event_type,payload) values(p_actor,'order_update',jsonb_build_object('reference',o.reference,'field',p_field,'before',to_jsonb(o)->p_field,'after',result->p_field));
 return result;
end $$;
revoke all on function public.owner_apply_order_patch(text,timestamptz,text,text,bigint) from public,anon,authenticated;
grant execute on function public.owner_apply_order_patch(text,timestamptz,text,text,bigint) to service_role;

create or replace function public.owner_order_product_totals()
returns table(title text,requested_units bigint,completed_paid_units bigint)
language sql stable security invoker set search_path = public, pg_temp as $$
 select min(i.title),sum(i.quantity)::bigint,sum(case when o.status='completed' and o.payment_status='paid' then i.quantity else 0 end)::bigint
 from public.order_items i join public.orders o on o.id=i.order_id where o.status<>'cancelled'
 group by coalesce(i.product_slug,lower(i.title)) order by sum(i.quantity) desc, min(i.title) limit 20;
$$;
revoke all on function public.owner_order_product_totals() from public,anon,authenticated;
grant execute on function public.owner_order_product_totals() to service_role;
