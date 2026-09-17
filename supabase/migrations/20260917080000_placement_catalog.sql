-- Каталог мест: новый товар становится строками данных, а не миграцией.
--
-- До этого тип места был перечислением из семи поверхностей профиля X. Чтобы
-- продать зону на футболке, платье или чемодане, пришлось бы каждый раз править
-- тип в базе и выкладывать код. Это ровно то, что мешает быстро подключать
-- новые товары.
--
-- Теперь место - строка в каталоге. Футболка заводится одиннадцатью insert'ами,
-- платье - тринадцатью, и ни аукцион, ни фикс-прайс, ни поденная оплата об этом
-- знать не обязаны: они смотрят на листинг, а не на тип места.
--
-- Оговорка про архитектуру. В CLAUDE.md перечень мест назван правилом домена и
-- отнесён в packages/core. Здесь он уезжает в базу, и это сознательно: перечень
-- товаров - это данные, а не правило. В core остаётся то, что считает и решает,
-- то есть деньги, календарь и способ проверки; каталог - то, что продаётся.

create table public.placement_catalog (
  -- Имя уникально на весь каталог, поэтому у новых поверхностей оно с
  -- приставкой: «грудь» есть и у футболки, и у платья. Семь имён профиля X
  -- остаются без приставки - они уже лежат в листингах и в коде, и
  -- переименование стоило бы дороже, чем эта неровность.
  kind text primary key check (kind ~ '^[a-z][a-z0-9_]{1,30}$'),
  surface text not null check (surface ~ '^[a-z][a-z0-9_]{1,20}$'),
  label text not null check (length(label) between 1 and 40),
  -- Чем доказывается, что место занято. У ткани нет ни строки, ни картинки
  -- профиля, ни id поста - только фотография, и проверяет её человек.
  proof text not null check (proof in ('image', 'text', 'post_id', 'photo')),
  default_days integer not null check (default_days between 1 and 365),
  sort integer not null default 0
);

comment on table public.placement_catalog is
  'Что вообще можно продать. Новый товар заводится строками, без миграции';

insert into public.placement_catalog (kind, surface, label, proof, default_days, sort) values
  ('bio_link',      'x_profile', 'Bio link',      'text',     30,  1),
  ('location',      'x_profile', 'Location',      'text',     30,  2),
  ('name_suffix',   'x_profile', 'Name suffix',   'text',     14,  3),
  ('bio_text',      'x_profile', 'Bio text',      'text',     14,  4),
  ('pinned_post',   'x_profile', 'Pinned post',   'post_id',   7,  5),
  ('banner',        'x_profile', 'Banner',        'image',     7,  6),
  ('avatar',        'x_profile', 'Avatar',        'image',     7,  7),
  ('tshirt_chest',      'tshirt', 'Chest',       'photo', 3, 11),
  ('tshirt_stomach',    'tshirt', 'Stomach',     'photo', 3, 12),
  ('tshirt_hem_front',  'tshirt', 'Front hem',   'photo', 3, 13),
  ('tshirt_side_left',  'tshirt', 'Left side',   'photo', 3, 14),
  ('tshirt_side_right', 'tshirt', 'Right side',  'photo', 3, 15),
  ('tshirt_sleeve_left','tshirt', 'Left sleeve', 'photo', 3, 16),
  ('tshirt_sleeve_right','tshirt','Right sleeve','photo', 3, 17),
  ('tshirt_nape',       'tshirt', 'Nape',        'photo', 3, 18),
  ('tshirt_back',       'tshirt', 'Back',        'photo', 3, 19),
  ('tshirt_lower_back', 'tshirt', 'Lower back',  'photo', 3, 20),
  ('tshirt_hem_back',   'tshirt', 'Back hem',    'photo', 3, 21);

-- Листинг ссылается на каталог, а не на перечисление. Существующие строки
-- проходят: их семь имён уже в каталоге.
alter table public.listings alter column kind type text using kind::text;

alter table public.listings add constraint listings_kind_known
  foreign key (kind) references public.placement_catalog (kind);

-- Перечисление осталось без единой ссылки. Если что-то на него ещё смотрит,
-- эта строка упадёт, и это лучше, чем мёртвый тип в схеме.
drop type public.placement_kind;

alter table public.placement_catalog enable row level security;

-- Каталог публичен: без подписей и сроков витрина не нарисуется, а секретов в
-- нём нет - это перечень того, что мы вообще продаём. Писать из браузера
-- нельзя, товары заводим мы.
grant select on public.placement_catalog to anon, authenticated;
revoke insert, update, delete on public.placement_catalog from anon, authenticated;

create policy "catalogue is public"
  on public.placement_catalog for select to anon, authenticated
  using (true);
