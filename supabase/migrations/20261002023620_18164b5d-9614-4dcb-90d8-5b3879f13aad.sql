create or replace function public.emailed_link_account(_kind text, _ref text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare _email text; _status text; _paid timestamptz; _redeemed timestamptz; _found boolean := false;
begin
  if _ref is null or length(_ref) < 20 then return jsonb_build_object('state','invalid'); end if;
  if _kind = 'training' then
    select email, status, paid_at, true into _email, _status, _paid, _found from practitioner_applications where id::text = _ref;
    if not coalesce(_found,false) then return jsonb_build_object('state','invalid'); end if;
    if _paid is not null then return jsonb_build_object('state','paid'); end if;
    if _status <> 'accepted' then return jsonb_build_object('state','closed'); end if;
  elsif _kind = 'invite' then
    select email, redeemed_at, true into _email, _redeemed, _found from client_invitations where invite_token::text = _ref;
    if not coalesce(_found,false) then return jsonb_build_object('state','invalid'); end if;
    if _redeemed is not null then return jsonb_build_object('state','used'); end if;
  else
    return jsonb_build_object('state','invalid');
  end if;
  return jsonb_build_object('state','open','email', lower(_email),
    'has_account', exists (select 1 from auth.users u where lower(u.email) = lower(_email)));
end $$;
revoke all on function public.emailed_link_account(text, text) from public;
grant execute on function public.emailed_link_account(text, text) to anon, authenticated;