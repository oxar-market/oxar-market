-- Delora - вещь в базе, а не в коде.
--
-- Пилот с Delora был первым размещением, и ему нужно то же, что торгу:
-- «кто, где, когда», пруф и победители по местам - всё из админки. Для этого
-- вещь и её размещения должны лежать в базе. Попросили 2 октября 2026.
--
-- Ставок и денег у пилота не было, поэтому лотов и ставок у него нет: у
-- ставки обязательны подпись транзакции и кошелёк, и выдумывать их значило бы
-- врать в таблице денег. Размещения без торга - своя таблица: место, бренд,
-- логотип. Экран итогов показывает их теми же строками, что победителей.

-- День, когда места отдали без торга. Для маркета это признак пилота: вещь
-- без лотов, но с этой датой - прошедшее размещение, а не анонс. Партнёр -
-- кто взял вещь; имя ведёт по ссылке.
alter table things
  add column placed_on date,
  add column partner text check (partner is null or length(partner) <= 80),
  add column partner_url text check (partner_url is null or length(partner_url) <= 200);

create table placements (
  id uuid primary key default gen_random_uuid(),
  thing_id uuid not null references things (id) on delete cascade,
  -- Код места на модели, как в разметке в коде.
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  label text not null check (length(label) between 1 and 40),
  brand text not null check (length(brand) between 1 and 80),
  -- Логотип: путь в хранилище things или путь от корня приложения.
  media_url text not null,
  sort integer not null default 0,
  unique (thing_id, code)
);

alter table placements enable row level security;

-- Читают все: размещение - витрина, как и ставки.
create policy "размещения видны всем" on placements for select
  to anon, authenticated using (true);

-- Пишет только админ: размещения без торга заводим мы.
create policy "админ правит размещения" on placements for all
  to authenticated using (is_admin()) with check (is_admin());

insert into things (slug, title, tagline, model_url, house, seller, placed_on, partner, partner_url, worn_by, worn_where, worn_when, worn_about)
values (
  'delora-suitcases',
  'Delora suitcases',
  null,
  '/models/suitcase.glb',
  true,
  -- Владелец площадки, как у остальных наших вещей. Нет такого пользователя
  -- (локальная база) - продавец пустой.
  (select u.id from auth.users u where u.id = '78e0f74a-3474-4f4b-875f-7030e18234fd'),
  '2026-09-24',
  'Delora',
  'https://x.com/deloraprotocol',
  'The Delora team',
  'On the road',
  'From Sep 24',
  'Our first placement off a shirt. We printed the stickers, Delora put them on their suitcases. No auction and no payment - a first test that both sides want this.'
)
on conflict (slug) do nothing;

insert into placements (thing_id, code, label, brand, media_url, sort)
select t.id, s.code, s.label, s.brand, s.media_url, s.sort
  from things t
  cross join (values
    ('suitcase_panel',       'Main panel',  'Nomadz',  '/cases/delora/nomadz.webp',  1),
    ('suitcase_upper_left',  'Upper left',  'Delora',  '/cases/delora/delora.webp',  2),
    ('suitcase_upper_right', 'Upper right', 'OXAR',    '/cases/delora/oxar.webp',    3),
    ('suitcase_lower_left',  'Lower left',  'Solwear', '/cases/delora/solwear.webp', 4),
    ('suitcase_lower_right', 'Lower right', 'Echoes',  '/cases/delora/echoes.webp',  5)
  ) as s (code, label, brand, media_url, sort)
 where t.slug = 'delora-suitcases'
on conflict (thing_id, code) do nothing;
