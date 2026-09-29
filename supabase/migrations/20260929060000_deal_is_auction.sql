-- Сделка - это торг, а не каждое место в нём.
--
-- Счёт считал сделкой выигранный лот, и торг на девять мест давал девять
-- сделок одному продавцу за один раз. Теперь сделка - торг вещи: её лоты с
-- одним сроком закрытия (так их и открывает продавец - один торг на срок).
-- Аренда по-прежнему сделка на заявку. Оценки остаются по местам: каждая
-- идёт в среднее.
--
-- Прогоны до первого настоящего торга (23 сентября) - наши проверки цикла на
-- доллар-два. Они помечаются и не идут ни в счёт, ни в оценки.

alter table lots add column rehearsal boolean not null default false;

update lots set rehearsal = true where closes_at < '2026-09-23T00:00:00Z';

create or replace view seller_scores as
with deals as (
  select t.seller, l.id as lot_id, null::uuid as request,
         l.thing_id::text || '@' || l.closes_at::text as deal
    from lots l join things t on t.id = l.thing_id
   where l.status = 'won' and t.seller is not null and not l.rehearsal
  union all
  select t.seller, null, r.id, r.id::text
    from rent_requests r
    join thing_spots s on s.id = r.spot_id
    join things t on t.id = s.thing_id
   where r.status = 'approved'
)
select d.seller,
       count(distinct d.deal)::int as deals,
       round(avg(rt.rating)::numeric, 1) as rating
  from deals d
  left join ratings rt
    on rt.side = 'buyer'
   and (rt.lot_id = d.lot_id or rt.rent_request = d.request)
 group by d.seller;

create or replace view buyer_scores as
with deals as (
  select r.buyer, null::uuid as lot_id, r.id as request, r.id::text as deal
    from rent_requests r where r.status = 'approved'
  union all
  select top.bidder, l.id, null, l.thing_id::text || '@' || l.closes_at::text
    from lots l
    join things t on t.id = l.thing_id
    cross join lateral (
      select b.bidder from lot_bids b
       where b.lot_id = l.id
       order by b.amount_cents desc, b.created_at asc
       limit 1
    ) top
   where l.status = 'won' and t.seller is not null and not l.rehearsal
)
select d.buyer,
       count(distinct d.deal)::int as deals,
       round(avg(rt.rating)::numeric, 1) as rating
  from deals d
  left join ratings rt
    on rt.side = 'seller'
   and (rt.lot_id = d.lot_id or rt.rent_request = d.request)
 group by d.buyer;

-- Прогон оценить нельзя.
create or replace function may_rate(lot uuid, request uuid, side text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when lot is not null then exists (
      select 1 from lots l join things t on t.id = l.thing_id
      where l.id = lot and l.status = 'won' and t.seller is not null and not l.rehearsal
        and (
          (side = 'seller' and t.seller = auth.uid())
          or (
            side = 'buyer'
            and auth.uid() = (
              select b.bidder from lot_bids b
              where b.lot_id = l.id
              order by b.amount_cents desc, b.created_at asc
              limit 1
            )
          )
        )
    )
    when request is not null then exists (
      select 1 from rent_requests r
      where r.id = request and r.status = 'approved' and r.starts_on <= current_date
        and (
          (side = 'buyer' and r.buyer = auth.uid())
          or (side = 'seller' and owns_spot(r.spot_id))
        )
    )
    else false
  end;
$$;
