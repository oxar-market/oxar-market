-- Победитель торга должен иметь возможность заплатить.
--
-- Дыра, оставленная в предыдущей миграции: бронь, созданную аукционом, пишет
-- `close_due_auctions` из security definer, где токена нет. Триггер
-- `bookings_stamp_buyer` проставлял туда `auth.jwt() ->> 'email'`, то есть
-- пустоту, и победитель не мог привязать стрим к собственной сделке: политика
-- сверяет адрес в брони с адресом в токене.
--
-- Чиним в три шага: ставка запоминает, кто её сделал; закрытие переносит это в
-- бронь; триггер перестаёт затирать уже проставленный адрес, когда токена нет.

alter table public.bids add column bidder_email text
  check (bidder_email is null or length(bidder_email) between 3 and 320);

comment on column public.bids.bidder_email is
  'Кто поставил, по адресу входа. Нужен, чтобы победитель смог оплатить';

-- Так же, как у заявки: подписывает база, поверх присланного клиентом.
create function public.bids_stamp_bidder()
  returns trigger
  language plpgsql
as $$
begin
  new.bidder_email := auth.jwt() ->> 'email';
  return new;
end;
$$;

create trigger bids_stamp_bidder
  before insert on public.bids
  for each row execute function public.bids_stamp_bidder();

-- Токен есть - адрес всегда перезаписывается, подделать нельзя. Токена нет -
-- значит пишет security definer или service_role, и присланное значение верно.
-- Анониму вставка в bookings закрыта вовсе, так что третьего случая нет.
create or replace function public.bookings_stamp_buyer()
  returns trigger
  language plpgsql
as $$
begin
  new.buyer_email := coalesce(auth.jwt() ->> 'email', new.buyer_email);
  return new;
end;
$$;

-- Закрытие торга переносит адрес победителя в бронь.
create or replace function public.close_due_auctions()
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
        start_date, end_date, price_cents, status,
        buyer_email
      ) values (
        lot.listing_id, top.bidder_handle, top.bidder_contact,
        top.creative_url, top.creative_text,
        lot.start_date, lot.end_date, top.amount_cents, 'approved',
        top.bidder_email
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
