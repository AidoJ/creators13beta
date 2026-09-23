-- Storefront catalogue: the products the public front page sells.
insert into public.products (name, description, product_type, price_cents, currency, active, billing_shape, term_months, grants_level_key, is_visible_on_storefront)
values
  ('Connect', 'Community membership — meet other Creators and join projects.', 'digital', 800, 'aud', true, 'recurring', null, 'taster', true),
  ('Creator', 'Everything in Connect plus the monthly 13 Creators Q&A call.', 'digital', 2800, 'aud', true, 'fixed_term', 13, 'creator', true),
  ('Co-Creator', 'Everything in Creator plus the monthly Co-Creator Jam, limited to 13 people.', 'digital', 8800, 'aud', true, 'fixed_term', 13, 'co_creator', true),
  ('Body Profile (Public)', 'A private one-hour body profile consultation with a certified practitioner.', 'digital', 15000, 'aud', true, 'one_off', null, 'profile_body', true),
  ('Advanced Body Profile', 'A private one-hour advanced consultation with a certified profiler, plus a detailed PDF assessment.', 'digital', 30000, 'aud', true, 'one_off', null, 'profile_adv_body', true)
on conflict do nothing;

-- Practitioner training applications (no click-to-pay: a human reviews each one).
create table if not exists public.practitioner_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text not null,
  phone text,
  level smallint not null check (level in (1,2,3)),
  message text,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_notes text
);

grant select, update on public.practitioner_applications to authenticated;
grant all on public.practitioner_applications to service_role;

alter table public.practitioner_applications enable row level security;

create policy "Staff can view applications"
  on public.practitioner_applications for select to authenticated
  using (public.has_role(auth.uid(), 'trainer') or public.has_role(auth.uid(), 'admin'));

create policy "Staff can update applications"
  on public.practitioner_applications for update to authenticated
  using (public.has_role(auth.uid(), 'trainer') or public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'trainer') or public.has_role(auth.uid(), 'admin'));

create index if not exists practitioner_applications_created_idx
  on public.practitioner_applications (created_at desc);