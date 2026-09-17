-- Адрес покупателя проставляет база, а не клиент.
--
-- В предыдущей миграции `buyer_email` получил умолчание `auth.jwt() ->> 'email'`,
-- и на живой базе оно не сработало: заявка без явного поля падала на политике,
-- с явным - проходила. То есть умолчание вычислялось уже после проверки, и
-- полагаться на него нельзя.
--
-- Триггер надёжнее по двум причинам. Он срабатывает до проверки политики, и он
-- затирает то, что прислал клиент: подписаться чужим адресом нельзя, даже если
-- политику однажды ослабят. Клиенту это поле теперь слать не нужно вовсе.

alter table public.bookings alter column buyer_email drop default;

create function public.bookings_stamp_buyer()
  returns trigger
  language plpgsql
as $$
begin
  -- Брони, которые заводит аукцион, приходят из security definer без токена.
  -- У них покупатель известен только хэндлом ставки, и это отдельная дыра:
  -- победитель торга не сможет привязать стрим, пока у ставок нет входа.
  new.buyer_email := auth.jwt() ->> 'email';
  return new;
end;
$$;

create trigger bookings_stamp_buyer
  before insert on public.bookings
  for each row execute function public.bookings_stamp_buyer();

comment on function public.bookings_stamp_buyer is
  'Подписывает заявку адресом того, кто вошёл, поверх присланного клиентом';
