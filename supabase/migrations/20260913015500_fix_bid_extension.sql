-- Продление торга не работало.
--
-- Ставку кладёт аноним, а триггер сдвигал closes_at обычным update от его же
-- имени. Права на update у анонима нет, и RLS отбрасывала строку молча: ставка
-- проходила, срок не двигался. На локальной базе этого не видно — там всё
-- делается от владельца, которого RLS не касается.
--
-- Функция становится security definer: сдвиг срока — решение правил, а не
-- право того, кто поставил.

create or replace function public.bids_guard()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
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
