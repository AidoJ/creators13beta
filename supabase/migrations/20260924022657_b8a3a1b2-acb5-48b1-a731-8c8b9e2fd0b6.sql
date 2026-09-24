create or replace function public.get_access_summary(_user_ids uuid[])
returns table (
  user_id uuid,
  level_key text,
  display_name text,
  sort_order int,
  source text,
  billing_shape text,
  product_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  stripe_ref text
)
language sql
stable
security definer
set search_path = public
as $$
  select e.user_id, e.level_key, al.display_name, al.sort_order, e.source::text,
         p.billing_shape, p.name, e.starts_at, e.ends_at, e.stripe_ref
  from public.entitlements e
  join public.access_levels al on al.key = e.level_key
  left join lateral (
    select pr.billing_shape, pr.name
    from public.products pr
    where pr.grants_level_key = e.level_key
    order by pr.is_visible_on_storefront desc nulls last, pr.price_cents desc
    limit 1
  ) p on true
  where e.user_id = any(_user_ids)
    and e.status = 'active'
    and e.level_key <> 'free'
    and (e.ends_at is null or e.ends_at > now())
    and (
      e.user_id = auth.uid()
      or public.has_role(auth.uid(), 'admin')
      or public.has_role(auth.uid(), 'trainer')
      or exists (
        select 1 from public.client_practitioner cp
        where cp.client_id = e.user_id and cp.practitioner_id = auth.uid() and cp.active
      )
    )
  order by e.user_id, al.sort_order desc;
$$;

revoke all on function public.get_access_summary(uuid[]) from public, anon;
grant execute on function public.get_access_summary(uuid[]) to authenticated, service_role;