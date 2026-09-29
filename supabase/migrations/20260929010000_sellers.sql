-- Продавцы: свои вещи, места, цены, заявки на аренду и оценки.
--
-- Роль продавца по-прежнему выдаём мы, после звонка: profiles.is_seller
-- меняет только service_role (у authenticated право update есть лишь на
-- handle). Всё, что ниже разрешено продавцу, проверяет эту роль сама база, а
-- не только спрятанная кнопка.
--
-- Смарт-контракт не меняется. Аукционы продавец открывает сам своим кошельком
-- (seller_opens_sale / seller_opens_lot уже для этого), а аренда по дням -
-- пока только договорённость в базе: эскроу для неё в программе нет, и
-- деньги за аренду здесь не двигаются.

-- ── Вещь продавца ─────────────────────────────────────────────────────────

-- seller пустой у вещей площадки: их заводим мы миграциями, как футболку.
alter table things
  add column seller uuid references auth.users (id) on delete restrict,
  -- preparing - вещь ждёт нас; ready - продавец ставит цены. Вещь продавца
  -- рождается ready: модель мы прикладываем потом, торг идёт и по фото.
  add column stage text not null default 'ready'
    check (stage in ('preparing', 'ready')),
  -- Пути снимков в хранилище things, по порядку съёмки.
  add column photos text[] not null default '{}';

create policy "продавец видит свои вещи" on things for select
  using (seller = auth.uid());

-- Вещь продавца видна на маркете сразу, по снимкам, - без нашей проверки:
-- роль продавца мы и так выдаём сами. Убрать вещь с маркета может админ.
create policy "одобренный продавец заводит вещь" on things for insert
  with check (
    seller = auth.uid()
    and exists (
      select 1 from profiles p where p.user_id = auth.uid() and p.is_seller
    )
  );

-- ── Места на фото ─────────────────────────────────────────────────────────

-- Прямоугольник места на снимке: номер снимка и доли его сторон. У мест
-- футболки их нет - там геометрия живёт в модели.
alter table thing_spots
  add column photo smallint check (photo is null or photo between 0 and 9),
  add column x real,
  add column y real,
  add column w real,
  add column h real,
  add constraint thing_spots_rect_check check (
    (x is null and y is null and w is null and h is null)
    or (
      x between 0 and 1 and y between 0 and 1
      and w > 0 and h > 0 and x + w <= 1.0001 and y + h <= 1.0001
    )
  );

create policy "продавец размечает свою вещь" on thing_spots for insert
  with check (
    exists (
      select 1 from things t
      where t.id = thing_id and t.seller = auth.uid()
    )
    -- Места размечаются до торга: посреди торга новое место не появится.
    and not exists (select 1 from lots l where l.thing_id = thing_spots.thing_id)
  );

-- ── Цены: аукцион ─────────────────────────────────────────────────────────

-- Черновик лота виден продавцу вещи; всем остальным - только открытые.
create policy "продавец видит свои лоты" on lots for select
  using (exists (select 1 from things t where t.id = thing_id and t.seller = auth.uid()));

create policy "продавец заводит черновик лота" on lots for insert
  with check (
    status = 'draft'
    and exists (
      select 1 from things t
      where t.id = thing_id and t.seller = auth.uid() and t.stage = 'ready'
    )
  );

-- Черновик правится до открытия; открыть (draft -> open) продавец может сам -
-- в цепочке торг открывает его же кошелёк, а ставку без лота в цепочке
-- программа всё равно не примет.
create policy "продавец правит свой черновик" on lots for update
  using (
    status = 'draft'
    and exists (select 1 from things t where t.id = thing_id and t.seller = auth.uid())
  )
  with check (
    status in ('draft', 'open')
    and exists (select 1 from things t where t.id = thing_id and t.seller = auth.uid())
  );

create policy "продавец убирает свой черновик" on lots for delete
  using (
    status = 'draft'
    and exists (select 1 from things t where t.id = thing_id and t.seller = auth.uid())
  );

-- ── Цены: аренда по дням ──────────────────────────────────────────────────

create table rent_offers (
  spot_id uuid primary key references thing_spots (id) on delete cascade,
  price_per_day_cents integer not null check (price_per_day_cents > 0),
  min_days integer not null default 1 check (min_days between 1 and 365),
  available_from date not null,
  available_until date,
  check (available_until is null or available_until > available_from)
);

alter table rent_offers enable row level security;

create or replace function owns_spot(spot uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from thing_spots s join things t on t.id = s.thing_id
    where s.id = spot and t.seller = auth.uid()
  );
$$;

create policy "предложения аренды видны у активных вещей" on rent_offers for select
  using (
    owns_spot(spot_id)
    or exists (
      select 1 from thing_spots s join things t on t.id = s.thing_id
      where s.id = spot_id and t.active
    )
  );
create policy "продавец задаёт аренду своего места" on rent_offers for insert
  with check (owns_spot(spot_id));
create policy "продавец правит аренду своего места" on rent_offers for update
  using (owns_spot(spot_id)) with check (owns_spot(spot_id));
create policy "продавец снимает аренду своего места" on rent_offers for delete
  using (owns_spot(spot_id));

-- ── Заявки на аренду ──────────────────────────────────────────────────────

create table rent_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  spot_id uuid not null references thing_spots (id) on delete cascade,
  buyer uuid not null references auth.users (id) on delete cascade,
  buyer_wallet text not null
    check (buyer_wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  artwork_url text not null,
  starts_on date not null,
  ends_on date not null,
  price_per_day_cents integer not null check (price_per_day_cents > 0),
  status text not null default 'waiting'
    check (status in ('waiting', 'approved', 'declined')),
  -- Сутки на ответ: дольше покупатель ждать не обязан.
  answer_by timestamptz not null default now() + interval '24 hours',
  answered_at timestamptz,
  -- ends_on - последний день аренды, включительно.
  check (ends_on >= starts_on)
);

alter table rent_requests enable row level security;

create policy "покупатель видит свои заявки" on rent_requests for select
  using (buyer = auth.uid());
create policy "продавец видит заявки на свои места" on rent_requests for select
  using (owns_spot(spot_id));
create policy "покупатель просит аренду" on rent_requests for insert
  with check (
    buyer = auth.uid()
    and status = 'waiting'
    and answered_at is null
    and exists (select 1 from rent_offers o where o.spot_id = rent_requests.spot_id)
  );

-- Ответ продавца - одной функцией, а не правом на update: так продавец не
-- перепишет ни сумму, ни даты, ни чужую картинку, только решение.
create or replace function answer_rent_request(request uuid, approve boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  answered text;
begin
  update rent_requests r
     set status = case when approve then 'approved' else 'declined' end,
         answered_at = now()
   where r.id = request
     and r.status = 'waiting'
     and r.answer_by > now()
     and owns_spot(r.spot_id)
  returning r.status into answered;
  if answered is null then
    raise exception 'request is not waiting for this seller';
  end if;
  return answered;
end;
$$;

revoke all on function answer_rent_request(uuid, boolean) from public;
grant execute on function answer_rent_request(uuid, boolean) to authenticated;

-- ── Оценки в обе стороны ──────────────────────────────────────────────────

-- Оценка теперь бывает и по аренде. Сделка ровно одна: лот или заявка.
alter table ratings
  alter column lot_id drop not null,
  add column rent_request uuid references rent_requests (id) on delete cascade,
  -- Покупатель о продавце: простояло ли место.
  add column stood text check (stood is null or stood in ('yes', 'partly', 'no')),
  -- Продавец о покупателе.
  add column artwork_ok boolean,
  add column no_drama boolean,
  add constraint ratings_one_deal check ((lot_id is null) <> (rent_request is null)),
  add constraint ratings_rent_side_key unique (rent_request, side);

-- Прежняя политика пускала любого, кто вошёл, лишь бы торг состоялся. Теперь
-- оценивает только сторона сделки: покупатель - тот, чья ставка выиграла или
-- чья заявка одобрена; продавец - владелец вещи.
drop policy if exists "оценивает участник состоявшейся сделки" on ratings;

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
      where l.id = lot and l.status = 'won' and t.seller is not null
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

create policy "оценивает сторона сделки" on ratings for insert
  with check (auth.uid() = author and may_rate(lot_id, rent_request, side));

-- Счёт продавца и покупателя: средняя оценка другой стороны и число сделок.
-- Сделка - выигранный лот на вещи продавца или одобренная аренда.
create or replace view seller_scores as
with deals as (
  select t.seller, l.id as lot_id, null::uuid as request
    from lots l join things t on t.id = l.thing_id
   where l.status = 'won' and t.seller is not null
  union all
  select t.seller, null, r.id
    from rent_requests r
    join thing_spots s on s.id = r.spot_id
    join things t on t.id = s.thing_id
   where r.status = 'approved'
)
select d.seller,
       count(*)::int as deals,
       round(avg(rt.rating)::numeric, 1) as rating
  from deals d
  left join ratings rt
    on rt.side = 'buyer'
   and (rt.lot_id = d.lot_id or rt.rent_request = d.request)
 group by d.seller;

create or replace view buyer_scores as
with deals as (
  select r.buyer, null::uuid as lot_id, r.id as request
    from rent_requests r where r.status = 'approved'
  union all
  -- Выигранный торг на вещи продавца: покупатель - верхняя ставка.
  select top.bidder, l.id, null
    from lots l
    join things t on t.id = l.thing_id
    cross join lateral (
      select b.bidder from lot_bids b
       where b.lot_id = l.id
       order by b.amount_cents desc, b.created_at asc
       limit 1
    ) top
   where l.status = 'won' and t.seller is not null
)
select d.buyer,
       count(*)::int as deals,
       round(avg(rt.rating)::numeric, 1) as rating
  from deals d
  left join ratings rt
    on rt.side = 'seller'
   and (rt.lot_id = d.lot_id or rt.rent_request = d.request)
 group by d.buyer;

grant select on seller_scores, buyer_scores to anon, authenticated;

-- ── Снимки вещей ──────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('things', 'things', true)
on conflict (id) do nothing;

-- Кладёт только одобренный продавец и только в свою папку: things/<uid>/...
create policy "продавец кладёт снимки своей вещи" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'things'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from profiles p where p.user_id = auth.uid() and p.is_seller
    )
  );

-- ── Съёмка с телефона для десктопа ────────────────────────────────────────

-- Десктоп показывает QR с секретом сессии; телефон - просто камера, входить
-- ему не нужно. Десктоп (вошедший продавец) заранее готовит подписанные
-- ссылки загрузки в свою папку и кладёт их в сессию; телефон по секрету
-- получает эти ссылки функцией и заливает снимки. Секрет живёт четверть
-- часа и открывает только эту сессию.
create table capture_sessions (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Десять знаков [a-z0-9] - около 50 бит: на четверть часа хватает с запасом.
  secret text not null unique
    default substr(translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=ABCDEFGHIJKLMNOPQRSTUVWXYZ', ''), 1, 10),
  state text not null default 'waiting'
    check (state in ('waiting', 'shooting', 'landed')),
  -- Подписанные ссылки загрузки: [{path, token}], их готовит десктоп.
  uploads jsonb not null default '[]',
  photos text[] not null default '{}'
);

alter table capture_sessions enable row level security;

create policy "своя сессия съёмки" on capture_sessions for all
  using (owner = auth.uid())
  with check (owner = auth.uid());

-- Телефон по секрету открывает съёмку и получает ссылки загрузки.
create or replace function capture_open(secret text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  found jsonb;
begin
  update capture_sessions c
     set state = 'shooting'
   where c.secret = capture_open.secret
     and c.state in ('waiting', 'shooting')
     and c.created_at > now() - interval '15 minutes'
  returning c.uploads into found;
  return found;
end;
$$;

-- Телефон сдаёт снимки: сколько залил - столько первых путей и берём.
create or replace function capture_land(secret text, shots integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update capture_sessions c
     set state = 'landed',
         photos = array(
           select u ->> 'path'
             from jsonb_array_elements(c.uploads) with ordinality as t(u, n)
            where t.n <= greatest(1, least(shots, jsonb_array_length(c.uploads)))
            order by t.n
         )
   where c.secret = capture_land.secret
     and c.state = 'shooting'
     and c.created_at > now() - interval '15 minutes';
  return found;
end;
$$;

revoke all on function capture_open(text) from public;
revoke all on function capture_land(text, integer) from public;
grant execute on function capture_open(text) to anon, authenticated;
grant execute on function capture_land(text, integer) to anon, authenticated;

-- ── Админ: мы сами ────────────────────────────────────────────────────────

-- Кто даёт вещам имя, прикладывает 3D-модель, расставляет на ней места и
-- убирает вещь с маркета. Список ведётся миграциями, как и роль продавца.
--
-- Ключ - идентификатор Privy, а не user_id: так админа можно завести
-- раньше, чем он впервые войдёт, - аккаунт Supabase появляется только при
-- первом входе, а идентификатор Privy известен заранее.
create table admins (
  privy_id text primary key
);

alter table admins enable row level security;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from admins a join identities i on i.privy_id = a.privy_id
    where i.user_id = auth.uid()
  );
$$;

-- Владелец площадки: пользователь за кошельком AkC8…DtB. Ему же роль
-- продавца - чтобы проверить кабинет на своей вещи. Нет такого
-- пользователя (локальная база) - строк не будет.
insert into admins (privy_id)
select privy_id from identities where user_id = '78e0f74a-3474-4f4b-875f-7030e18234fd'
on conflict do nothing;

insert into profiles (user_id, is_seller, seller_since)
select id, true, now() from auth.users where id = '78e0f74a-3474-4f4b-875f-7030e18234fd'
on conflict (user_id) do update
  set is_seller = true, seller_since = coalesce(profiles.seller_since, now());

create policy "админ видит все вещи" on things for select
  using (is_admin());

-- Имя, этап листинга, модель и показ на маркете - за админом. Продавцу
-- права на update у вещи нет вовсе.
create policy "админ правит вещи" on things for update
  using (is_admin()) with check (is_admin());

-- Геометрия места на 3D-модели: высота (0 - низ, 1 - верх габарита), угол
-- вокруг оси и размер пятна - те же поля, что у мест футболки в коде.
alter table thing_spots
  add column height real check (height is null or height between 0 and 1),
  add column azimuth real check (azimuth is null or azimuth between -360 and 360),
  add column size_w real check (size_w is null or size_w > 0),
  add column size_h real check (size_h is null or size_h > 0);

create policy "админ правит места" on thing_spots for update
  using (is_admin()) with check (is_admin());

insert into storage.buckets (id, name, public)
values ('models', 'models', true)
on conflict (id) do nothing;

create policy "админ кладёт модели" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'models' and is_admin());
