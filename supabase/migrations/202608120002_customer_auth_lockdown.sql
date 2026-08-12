-- Customer data is served only by authenticated, same-origin API routes.
-- Keep RLS policies as defense in depth, but do not expose these tables directly.
revoke all on table public.customer_profiles from anon, authenticated;
revoke all on table public.customer_carts from anon, authenticated;
revoke select on table public.orders, public.order_items from authenticated;

-- Replace the unrelated legacy signup hook that classified every new user as an agent.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.customer_profiles (user_id, full_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120)
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

