-- Каркас маркетплейса: кто продаёт, что продаётся, кто что просит.
--
-- Деньги — целыми центами, как в packages/core. Даты — днями, без времени:
-- товар измеряется сутками, а не часами.

create type placement_kind as enum (
  'avatar',
  'banner',
  'name_suffix',
  'bio_text',
  'bio_link',
  'location',
  'pinned_post'
);

create type booking_status as enum (
  'requested',  -- покупатель подал заявку, продавец её ещё не видел
  'approved',   -- продавец согласился, место забронировано
  'rejected',   -- продавец отказал
  'running',    -- размещение стоит
  'completed',  -- срок отстоял
  'cancelled'   -- сняли раньше срока или сделка сорвалась
);

-- Продавцы. Онбординг ручной, поэтому verified ставится нами, а не самим
-- аккаунтом. Непроверенные в витрину не попадают.
create table public.sellers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  x_handle text not null check (x_handle ~ '^[A-Za-z0-9_]{1,15}$'),
  display_name text not null check (length(display_name) between 1 and 80),
  follower_count integer not null check (follower_count >= 0),
  bio text check (bio is null or length(bio) <= 300),
  avatar_url text,
  verified boolean not null default false,
  -- организация против человека: у них разный цикл сделки и разный инвентарь
  is_org boolean not null default false
);

create unique index sellers_handle_unique on public.sellers (lower(x_handle));

-- Места в продаже. Одно место одного типа у одного продавца — один листинг.
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  seller_id uuid not null references public.sellers (id) on delete cascade,
  kind placement_kind not null,
  price_cents integer not null check (price_cents > 0),
  term_days integer not null check (term_days between 1 and 90),
  active boolean not null default true
);

create unique index listings_seller_kind_unique on public.listings (seller_id, kind);
create index listings_active_idx on public.listings (active) where active;

-- Заявки и сделки. Даты включительно: start_date = 10-е, end_date = 16-е —
-- это семь дней.
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  listing_id uuid not null references public.listings (id) on delete restrict,

  buyer_handle text not null check (buyer_handle ~ '^[A-Za-z0-9_]{1,15}$'),
  buyer_contact text check (buyer_contact is null or length(buyer_contact) between 3 and 320),

  -- что именно предлагают разместить: ссылка на картинку или текст
  creative_url text check (creative_url is null or length(creative_url) <= 500),
  creative_text text check (creative_text is null or length(creative_text) <= 500),
  note text check (note is null or length(note) <= 1000),

  start_date date not null,
  end_date date not null,
  price_cents integer not null check (price_cents > 0),
  status booking_status not null default 'requested',

  constraint bookings_dates_ordered check (end_date >= start_date)
);

create index bookings_listing_idx on public.bookings (listing_id);
create index bookings_status_idx on public.bookings (status);

-- Занятые дни. Заявка места не занимает: пока продавец не согласился, дата
-- свободна для других.
create view public.listing_busy
with (security_invoker = off) as
select listing_id, start_date, end_date
from public.bookings
where status in ('approved', 'running', 'completed');

alter table public.sellers enable row level security;
alter table public.listings enable row level security;
alter table public.bookings enable row level security;

-- Витрина публичная, но только проверенные продавцы и активные листинги.
create policy "verified sellers are public"
  on public.sellers for select to anon, authenticated
  using (verified);

create policy "active listings are public"
  on public.listings for select to anon, authenticated
  using (active and exists (
    select 1 from public.sellers s where s.id = seller_id and s.verified
  ));

-- Заявку может подать любой, читать заявки — нельзя: в них контакты
-- покупателя и суммы. Список заявок продавцу отдаёт бэкенд под service_role,
-- пока не появилась авторизация.
create policy "anyone can request a placement"
  on public.bookings for insert to anon, authenticated
  with check (status = 'requested');

comment on view public.listing_busy is 'Занятые дни по листингам, без данных покупателя';
comment on table public.bookings is 'Заявки и сделки на размещение';
