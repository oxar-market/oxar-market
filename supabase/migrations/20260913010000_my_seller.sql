-- «Кто я» для вошедшего продавца.
--
-- Витрина публична, поэтому вошедший видит строки всех проверенных продавцов и
-- свою среди них не отличить: адрес входа от API закрыт, а значит и отобрать по
-- нему нельзя. Отбор делает база, внутри функции, которая этот адрес видит.
--
-- Адрес наружу не отдаётся - только то, что кабинету нужно показать.

create function public.my_seller()
  returns table (
    id uuid,
    x_handle text,
    display_name text,
    follower_count integer,
    verified boolean
  )
  language sql
  stable
  security definer
  set search_path = public
as $$
  select s.id, s.x_handle, s.display_name, s.follower_count, s.verified
  from public.sellers s
  where s.auth_email is not null
    and lower(s.auth_email) = lower(auth.jwt() ->> 'email');
$$;

-- По умолчанию выполнять функцию может кто угодно. Анониму она вернула бы
-- пустоту, но пусть право будет только у вошедшего.
revoke execute on function public.my_seller() from public, anon;
grant execute on function public.my_seller() to authenticated;
