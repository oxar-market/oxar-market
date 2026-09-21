-- Когда торг начинается.
--
-- До этого момента лот виден, но ставок не принимает: на экране стоит
-- голограмма вещи и сведения о торге, а не сама вещь. Зачем показывать то,
-- что ещё не началось: объявленный заранее торг собирает людей к минуте
-- открытия, а пустая страница до него - никого.
--
-- Пусто - значит начался: у лотов, заведённых до появления этого срока,
-- ждать нечего, и переписывать их незачем.
--
-- Программа на Solana про этот срок не знает - она проверяет только закрытие.
-- Значит запретом на раннюю ставку служит база, и он не последний барьер, а
-- единственный: ставку, посланную в цепочку мимо нашей формы, программа
-- примет. Для наших первых торгов этого достаточно - лот открываем мы сами,
-- и открываем его за минуты до начала. Понадобится больше - срок начала
-- придётся завести и в лоте в цепочке.

alter table lots add column opens_at timestamptz;

alter table lots add constraint lots_opens_before_closes
  check (opens_at is null or opens_at < closes_at);

-- Тот же запрет в триггере ставок: политика отвечает на «ты ли это», триггер -
-- на «можно ли так», и «торг ещё не начался» - это его вопрос.
create or replace function bids_guard()
returns trigger
language plpgsql
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
  if lot_row.closes_at - now() < make_interval(secs => lot_row.extend_seconds) then
    update lots
      set closes_at = now() + make_interval(secs => lot_row.extend_seconds)
      where id = new.lot_id;
  end if;

  return new;
end;
$$;
