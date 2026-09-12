-- Два способа назвать цену за место.
--
-- Раньше листинг умел только пакет: цена за заранее названный срок. Теперь
-- продавец может назвать ставку за сутки, а покупатель — число дней.
--
-- Отдельной колонки под минимальный срок нет: у ставки эту роль играет
-- term_days. Один смысл у колонки на каждый режим, а не две почти пустые.

create type listing_pricing as enum (
  'term',   -- price_cents за term_days, продаётся только целиком
  'daily'   -- price_cents за один день, term_days — минимум дней
);

alter table public.listings
  add column pricing listing_pricing not null default 'term';

comment on column public.listings.pricing is
  'term: цена за весь срок. daily: цена за сутки, term_days — минимальный срок';
comment on column public.listings.price_cents is
  'Пакет — цена за весь срок. Ставка — цена за один день';
comment on column public.listings.term_days is
  'Пакет — срок продажи. Ставка — минимальное число дней';
