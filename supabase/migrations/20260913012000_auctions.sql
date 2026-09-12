-- Аукцион на место.
--
-- Лот — это место и конкретные даты: продаётся баннер с первого по седьмое, а
-- не «баннер вообще». Приём ставок закрывается раньше, чем начинается
-- размещение, иначе победителю некогда прислать креатив, а продавцу — поставить.
--
-- Правила ставки продублированы здесь и в packages/core осознанно. В core они
-- нужны интерфейсу, чтобы показать «минимум столько», но интерфейс ничего не
-- защищает: ставку можно послать запросом. Источник истины — база.

create type auction_status as enum (
  'open',       -- идёт приём ставок
  'sold',       -- закрыт, победитель есть, бронь создана
  'unsold',     -- закрыт, ставок выше резерва не было
  'cancelled'   -- снят продавцом до закрытия
);

create table public.auctions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  listing_id uuid not null references public.listings (id) on delete restrict,

  -- срок самого размещения, включительно
  start_date date not null,
  end_date date not null,
  -- ниже этой цены лот не продан, даже если ставки были
  reserve_cents integer not null check (reserve_cents > 0),
  -- когда кончается приём ставок; сдвигается вперёд при ставке в последние минуты
  closes_at timestamptz not null,

  status auction_status not null default 'open',
  -- бронь победителя, появляется при закрытии
  booking_id uuid references public.bookings (id),

  constraint auctions_dates_ordered check (end_date >= start_date),
  -- сутки между концом торга и началом размещения: время на креатив и установку
  constraint auctions_closes_before_start
    check (closes_at <= (start_date::timestamptz - interval '1 day'))
);

create index auctions_listing_idx on public.auctions (listing_id);
create index auctions_open_idx on public.auctions (closes_at) where status = 'open';

-- Один лот на место и даты: два открытых аукциона на одну неделю кончились бы
-- двумя победителями и одним местом.
create unique index auctions_one_per_span
  on public.auctions (listing_id, start_date, end_date)
  where status in ('open', 'sold');

create table public.bids (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  auction_id uuid not null references public.auctions (id) on delete cascade,

  bidder_handle text not null check (bidder_handle ~ '^[A-Za-z0-9_]{1,15}$'),
  bidder_contact text check (bidder_contact is null or length(bidder_contact) between 3 and 320),
  amount_cents integer not null check (amount_cents > 0),

  -- что поставят в случае победы; продавец смотрит это до конца торга
  creative_url text check (creative_url is null or length(creative_url) <= 500),
  creative_text text check (creative_text is null or length(creative_text) <= 500)
);

create index bids_auction_idx on public.bids (auction_id, amount_cents desc, created_at);
