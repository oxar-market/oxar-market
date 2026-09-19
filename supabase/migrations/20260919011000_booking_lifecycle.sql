-- Бронь доходит до конца сама.
--
-- До этой миграции жизнь брони обрывалась на `approved`. Окно оплаты `pay_by`
-- завели ещё в сентябре, но никто его не проставлял, поэтому одобренная бронь
-- держала даты вечно, даже если денег за ней так и не пришло. Статусы
-- `running`, `completed` и `cancelled` лежали в enum с самого начала и не
-- использовались ни разу.
--
-- Теперь всё это двигает планировщик, а не человек и не браузер: сделка
-- меряется сутками, а вкладка может быть закрыта неделю.

-- 1. Окно оплаты ставит база, а не клиент.
--
-- Проставлять его из браузера нельзя: грант на колонку у вошедшего есть, а
-- значит продавец мог бы выписать себе год на оплату, а покупатель - сдвинуть
-- срок, когда тот подходит. Триггер ставит его один раз, на переходе в
-- `approved`, и дальше его запирает bookings_freeze_terms.
--
-- Вставкой, а не только обновлением: бронь победителя торга рождается сразу
-- одобренной, и без этого она оставалась бы без срока оплаты.
create function public.bookings_set_pay_by()
  returns trigger
  language plpgsql
as $$
begin
  if new.status = 'approved' and new.pay_by is null then
    -- Сутки на оплату, но не дольше, чем до начала размещения: платить за
    -- место после того, как оно должно было встать, смысла нет.
    --
    -- Нижняя граница в час нужна для одобрений в последний момент. Без неё
    -- бронь, одобренная в день начала, оказывалась просроченной в ту же
    -- секунду, и следующий же проход планировщика её снимал.
    new.pay_by := greatest(
      least(now() + interval '24 hours', new.start_date::timestamptz),
      now() + interval '1 hour'
    );
  end if;
  return new;
end;
$$;

create trigger bookings_set_pay_by
  before insert or update on public.bookings
  for each row execute function public.bookings_set_pay_by();

-- 2. Переходы по срокам.
--
-- Три перехода, все по времени и ни одного по чьему-то нажатию:
--   не оплатили в срок  -> cancelled, дата снова свободна;
--   настал день начала  -> running;
--   срок вышел          -> completed.
--
-- Оплаченной считается бронь с привязанным платежом. Поле одно на оба способа:
-- у потока там id стрима, у разового перевода - подпись транзакции.
--
-- Даты сравниваются по UTC, потому что в UTC их и выбирали: `start_date` - это
-- полночь UTC, с неё же считает свои периоды стрим.
create function public.close_due_bookings()
  returns integer
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  touched integer := 0;
  step integer;
begin
  -- Снимаем неоплаченные. Их дата тут же освобождается: ограничение на
  -- пересечение считает занятыми только approved, running и completed.
  update public.bookings
    set status = 'cancelled'
    where status = 'approved'
      and stream_id is null
      and pay_by is not null
      and pay_by < now();
  get diagnostics step = row_count;
  touched := touched + step;

  update public.bookings
    set status = 'running'
    where status = 'approved'
      and stream_id is not null
      and start_date <= (now() at time zone 'utc')::date;
  get diagnostics step = row_count;
  touched := touched + step;

  update public.bookings
    set status = 'completed'
    where status = 'running'
      and end_date < (now() at time zone 'utc')::date;
  get diagnostics step = row_count;
  touched := touched + step;

  return touched;
end;
$$;

comment on function public.close_due_bookings() is
  'Снимает неоплаченные брони и двигает оплаченные в running и completed';

-- Из браузера не зовётся: в отличие от закрытия торгов, здесь нечего
-- показывать посетителю прямо сейчас, а права лишними не бывают.
revoke execute on function public.close_due_bookings() from public, anon, authenticated;

-- Раз в пять минут, тем же тактом, что и торги. Точность суток нам не нужна,
-- а при пустой очереди это три запроса по индексу.
select cron.schedule(
  'close-due-bookings',
  '*/5 * * * *',
  $$select public.close_due_bookings()$$
);

-- 3. Право анонима на закрытие торгов.
--
-- В close_marketplace право сняли с роли `anon`, но у функций в Postgres
-- EXECUTE есть ещё и у PUBLIC, а его не тронули - и аноним по-прежнему мог
-- звать close_due_auctions. Ущерба в этом нет, функция закрывает только лоты с
-- истёкшим сроком, но намерение той миграции осталось невыполненным.
--
-- Вошедшему право оставляем: витрина дёргает закрытие перед чтением лотов,
-- чтобы торг не зависел от того, жив ли планировщик.
revoke execute on function public.close_due_auctions() from public;
grant execute on function public.close_due_auctions() to authenticated;
