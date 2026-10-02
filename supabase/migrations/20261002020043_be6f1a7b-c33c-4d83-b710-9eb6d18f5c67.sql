create or replace function public.emailed_link_account(_kind text, _ref text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare _email text;
begin
  if _kind = 'training' then
    select email into _email from practitioner_applications
     where id::text = _ref and status = 'accepted' and paid_at is null;
  elsif _kind = 'invite' then
    select email into _email from client_invitations
     where invite_token::text = _ref and redeemed_at is null;
  end if;
  if _email is null or length(_ref) < 20 then return null; end if;
  return jsonb_build_object('email', lower(_email),
    'has_account', exists (select 1 from auth.users u where lower(u.email) = lower(_email)));
end $$;
revoke all on function public.emailed_link_account(text, text) from public;
grant execute on function public.emailed_link_account(text, text) to anon, authenticated;