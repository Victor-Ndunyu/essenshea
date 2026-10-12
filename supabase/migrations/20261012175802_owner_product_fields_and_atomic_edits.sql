alter table public.catalog_overrides
 add column if not exists best_for text[],
 add column if not exists concerns text[],
 add column if not exists benefits text[],
 add column if not exists ingredients text,
 add column if not exists size_text text,
 add column if not exists variants jsonb;

create or replace function public.owner_apply_catalog_patch(
 p_slug text, p_row jsonb, p_expected jsonb, p_actor bigint, p_snapshot jsonb
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
 old_row jsonb;
 new_row jsonb;
 v public.catalog_overrides%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_slug, 0));
 select to_jsonb(c) into old_row from public.catalog_overrides c where product_slug=p_slug for update;
 if old_row is distinct from p_expected then
   raise exception 'This product changed since it was read. Please request a fresh preview.';
 end if;
 if p_actor <= 0 or p_slug is null or p_slug = '' or jsonb_typeof(p_row) <> 'object' then raise exception 'Invalid product update'; end if;
 if exists(select 1 from jsonb_object_keys(p_row) k where k not in ('category_slug','product_name','description','price_text','price_value','image_url','stock','available_by_order','hidden','best_for','concerns','benefits','ingredients','size_text','variants')) then raise exception 'Unsupported product field'; end if;
 v := jsonb_populate_record(null::public.catalog_overrides, coalesce(old_row,'{}'::jsonb) || p_row);
 if v.category_slug is null or btrim(v.category_slug) = '' or v.product_name is null or btrim(v.product_name) = '' then raise exception 'Name and category are required'; end if;
 if v.price_value < 0 or v.stock < 0 then raise exception 'Price and stock cannot be negative'; end if;
 if v.variants is not null and jsonb_typeof(v.variants) <> 'array' then raise exception 'Variants must be an array'; end if;
 insert into public.catalog_overrides(product_slug,category_slug,product_name,description,price_text,price_value,image_url,stock,available_by_order,hidden,is_new,sort_order,best_for,concerns,benefits,ingredients,size_text,variants,updated_by,updated_at)
 values(p_slug,v.category_slug,v.product_name,v.description,v.price_text,v.price_value,v.image_url,v.stock,coalesce(v.available_by_order,false),coalesce(v.hidden,false),coalesce(v.is_new,false),v.sort_order,v.best_for,v.concerns,v.benefits,v.ingredients,v.size_text,v.variants,p_actor::text,now())
 on conflict(product_slug) do update set category_slug=excluded.category_slug,product_name=excluded.product_name,description=excluded.description,price_text=excluded.price_text,price_value=excluded.price_value,image_url=excluded.image_url,stock=excluded.stock,available_by_order=excluded.available_by_order,hidden=excluded.hidden,best_for=excluded.best_for,concerns=excluded.concerns,benefits=excluded.benefits,ingredients=excluded.ingredients,size_text=excluded.size_text,variants=excluded.variants,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 select to_jsonb(c) into new_row from public.catalog_overrides c where product_slug=p_slug;
 insert into public.owner_agent_events(telegram_chat_id,event_type,product_slug,payload)
 values(p_actor,'catalog_update',p_slug,jsonb_build_object('before',p_snapshot,'beforeOverride',old_row,'afterOverride',new_row,'requested',p_row));
 return new_row;
end $$;
revoke all on function public.owner_apply_catalog_patch(text,jsonb,jsonb,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.owner_apply_catalog_patch(text,jsonb,jsonb,bigint,jsonb) to service_role;
