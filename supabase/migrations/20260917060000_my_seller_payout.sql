-- Кабинет должен показывать кошелёк выплат, значит функция «кто я» обязана
-- его отдавать. Тип возврата у табличной функции не меняется на месте, поэтому
-- пересоздаём: права после drop не наследуются и выдаются заново.

drop function if exists public.my_seller();

create function public.my_seller()
  returns table (
    id uuid,
    x_handle text,
    display_name text,
    follower_count integer,
    verified boolean,
    payout_wallet text
  )
  language sql
  stable
  security definer
  set search_path = public
as $$
  select s.id, s.x_handle, s.display_name, s.follower_count, s.verified,
         s.payout_wallet
  from public.sellers s
  where s.auth_email is not null
    and lower(s.auth_email) = lower(auth.jwt() ->> 'email');
$$;

revoke execute on function public.my_seller() from public, anon;
grant execute on function public.my_seller() to authenticated;
