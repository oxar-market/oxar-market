-- Что можно со ставкой и что происходит, когда торг кончается.

-- Минимальная ставка: первая равна резерву, дальше шаг пять процентов, но не
-- мельче доллара. Те же числа лежат в packages/core для интерфейса.
create function public.min_bid_cents(auction uuid)
  returns integer
  language sql
  stable
as $$
  select case
    when top.amount_cents is null then a.reserve_cents
    else top.amount_cents + greatest(100, round(top.amount_cents * 0.05)::integer)
  end
  from public.auctions a
  left join lateral (
    select b.amount_cents
    from public.bids b
    where b.auction_id = a.id
    order by b.amount_cents desc, b.created_at
    limit 1
  ) top on true
  where a.id = auction;
$$;

-- Ставка проходит, только если торг открыт и сумма не ниже минимума. Ставка в
-- последние пять минут продлевает приём — иначе весь аукцион сводится к одной
-- ставке в последнюю секунду.
create function public.bids_guard()
  returns trigger
  language plpgsql
as $$
declare
  lot public.auctions;
  need integer;
begin
  select * into lot from public.auctions where id = new.auction_id for update;

  if lot.status <> 'open' then
    raise exception 'this lot is not taking bids';
  end if;
  if now() >= lot.closes_at then
    raise exception 'bidding on this lot has closed';
  end if;

  need := public.min_bid_cents(new.auction_id);
  if new.amount_cents < need then
    raise exception 'bid must be at least % cents', need;
  end if;

  if lot.closes_at - now() < interval '5 minutes' then
    update public.auctions
      set closes_at = now() + interval '5 minutes'
      where id = lot.id;
  end if;

  return new;
end;
$$;

create trigger bids_guard
  before insert on public.bids
  for each row execute function public.bids_guard();

-- Закрытие. Победитель — высшая ставка не ниже резерва; при равных суммах тот,
-- кто поставил раньше. Победа сразу становится бронью: выставив лот, продавец
-- уже согласился продать, и торг не может кончиться «я передумал».
--
-- Если даты к этому моменту заняты другой бронью, лот закрывается как снятый:
-- обещать место, которого нет, нельзя.
create function public.close_due_auctions()
  returns integer
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  lot public.auctions;
  top public.bids;
  fresh uuid;
  closed integer := 0;
begin
  for lot in
    select * from public.auctions
    where status = 'open' and closes_at <= now()
    order by closes_at
    for update skip locked
  loop
    select * into top
    from public.bids
    where auction_id = lot.id and amount_cents >= lot.reserve_cents
    order by amount_cents desc, created_at
    limit 1;

    if top.id is null then
      update public.auctions set status = 'unsold' where id = lot.id;
      closed := closed + 1;
      continue;
    end if;

    begin
      insert into public.bookings (
        listing_id, buyer_handle, buyer_contact,
        creative_url, creative_text,
        start_date, end_date, price_cents, status
      ) values (
        lot.listing_id, top.bidder_handle, top.bidder_contact,
        top.creative_url, top.creative_text,
        lot.start_date, lot.end_date, top.amount_cents, 'approved'
      )
      returning id into fresh;

      update public.auctions
        set status = 'sold', booking_id = fresh
        where id = lot.id;
    exception when exclusion_violation then
      update public.auctions set status = 'cancelled' where id = lot.id;
    end;

    closed := closed + 1;
  end loop;

  return closed;
end;
$$;

comment on function public.close_due_auctions is
  'Закрывает аукционы с истёкшим сроком и создаёт брони победителям';

-- Вызывать может кто угодно: функция ничего не принимает и делает только то,
-- что и так должно было случиться по времени. Так закрытие не зависит от того,
-- работает ли планировщик.
grant execute on function public.close_due_auctions() to anon, authenticated;
