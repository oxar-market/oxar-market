-- Продление торга в базе разошлось с цепочкой по двум причинам разом.
--
-- Первая - старая и уже однажды чиненная. 13 сентября выяснилось, что триггер
-- двигает closes_at обычным update от имени того, кто поставил, а прав на
-- update у анонима нет: RLS отбрасывала строку молча, ставка проходила, срок
-- не двигался. Тогда функцию сделали security definer. При переписывании схемы
-- 20 сентября функцию завели заново - и без него. То есть продления в базе нет
-- снова, и снова молча.
--
-- Вторая появилась вчера, когда торг стал идти за футболку целиком. Программа
-- на Solana двигает срок всей вещи: ставка на грудь продлевает и спину, иначе
-- на соседнем месте выигрывают по таймеру. База же двигала одну строку - ту, в
-- которую поставили.
--
-- Вместе это стоит денег. Строка в базе пишется после того, как транзакция
-- прошла в цепочке, поэтому в последние минуты выходило так: цепочка торг
-- продлила и ставку приняла, деньги ушли из кошелька, а триггер ответил
-- «bidding has closed» - и ставки нет ни в ленте, ни на футболке. Деньги в
-- хранилище, следа нет.
--
-- Правило теперь одно с программой: ставка под конец двигает все живые места
-- этой вещи, и только вперёд.

create or replace function bids_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lot_row lots;
begin
  select * into lot_row from lots where id = new.lot_id for update;

  if lot_row.status <> 'open' then
    raise exception 'lot is not taking bids';
  end if;

  if lot_row.opens_at is not null and lot_row.opens_at > now() then
    raise exception 'bidding has not opened yet';
  end if;

  if lot_row.closes_at <= now() then
    raise exception 'bidding has closed';
  end if;

  if new.amount_cents < lot_min_bid_cents(new.lot_id) then
    raise exception 'bid must be at least % cents', lot_min_bid_cents(new.lot_id);
  end if;

  -- Ставка под конец двигает закрытие вперёд и никогда назад. Отсчёт от самой
  -- ставки, а не от прежнего срока: иначе ставка за секунду до конца добавляла
  -- бы почти ноль.
  --
  -- Двигаются все места вещи, как в программе. Отбор из трёх условий: места
  -- прошлых торгов той же футболки уже закрыты и трогать их незачем
  -- (`closes_at > now()`), а место, до которого дальше нового срока, укорачивать
  -- нельзя (`closes_at < now() + ...`) - программа берёт максимум, и база
  -- обязана вести себя так же.
  if lot_row.closes_at - now() < make_interval(secs => lot_row.extend_seconds) then
    update lots
      set closes_at = now() + make_interval(secs => lot_row.extend_seconds)
      where thing_id = lot_row.thing_id
        and status = 'open'
        and closes_at > now()
        and closes_at < now() + make_interval(secs => lot_row.extend_seconds);
  end if;

  return new;
end;
$$;
