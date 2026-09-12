-- Кто что видит в аукционе.
--
-- Лоты публичны: на них ходят смотреть. Ставки публичны по сумме и хэндлу —
-- это крипто-твиттер, тут открытый торг скорее разгоняет ставки, чем мешает.
-- А вот контакт и креатив в ставке публичными быть не должны: контакт — личные
-- данные, креатив — ещё не вышедшая реклама. Их видит продавец лота.
--
-- Разделение по колонкам, потому что политика решает, какие строки видны, а не
-- какие поля.

alter table public.auctions enable row level security;
alter table public.bids enable row level security;

create policy "auctions are public"
  on public.auctions for select to anon, authenticated
  using (true);

create policy "seller runs auctions on own listings"
  on public.auctions for insert to authenticated
  with check (exists (
    select 1 from public.listings l
    where l.id = listing_id and public.owns_seller(l.seller_id)
  ));

-- Снять лот можно только пока он открыт: после закрытия у него есть победитель.
create policy "seller cancels own open auction"
  on public.auctions for update to authenticated
  using (status = 'open' and exists (
    select 1 from public.listings l
    where l.id = listing_id and public.owns_seller(l.seller_id)
  ))
  with check (status in ('open', 'cancelled'));

create policy "bids are public"
  on public.bids for select to anon, authenticated
  using (true);

create policy "anyone can bid"
  on public.bids for insert to anon, authenticated
  with check (true);

-- Ставку не отзывают и не правят: это обязательство, а не заявка. Держится на
-- правах, а не на правиле поверх таблицы: правило do instead nothing ломает
-- каскадное удаление и через него целостность ссылок.
revoke all on public.bids from anon, authenticated;
grant select (id, created_at, auction_id, bidder_handle, amount_cents)
  on public.bids to anon, authenticated;
grant insert on public.bids to anon, authenticated;

-- Продавцу лота нужны контакт и креатив: по ним он решает, годится ли реклама.
-- Отдаёт их функция, которая сама проверяет, чей это лот.
create function public.bids_for_my_auction(lot uuid)
  returns table (
    id uuid,
    created_at timestamptz,
    bidder_handle text,
    bidder_contact text,
    amount_cents integer,
    creative_url text,
    creative_text text
  )
  language sql
  stable
  security definer
  set search_path = public
as $$
  select b.id, b.created_at, b.bidder_handle, b.bidder_contact,
         b.amount_cents, b.creative_url, b.creative_text
  from public.bids b
  join public.auctions a on a.id = b.auction_id
  join public.listings l on l.id = a.listing_id
  where b.auction_id = lot
    and public.owns_seller(l.seller_id)
  order by b.amount_cents desc, b.created_at;
$$;

revoke execute on function public.bids_for_my_auction(uuid) from public, anon;
grant execute on function public.bids_for_my_auction(uuid) to authenticated;
