-- Аукцион рекламных мест на физических вещах.
--
-- Старые таблицы (sellers, listings, auctions, bids, placement_catalog) не
-- трогаются вовсе. Они скроены под места на профиле X: обязательный x_handle,
-- число подписчиков, каталог мест профиля. Новый продукт про вещи, и втискивать
-- его в ту форму значило бы тащить чужие поля в каждый запрос.
--
-- Деньги живут не здесь. Их держит программа на Solana, и она же источник
-- истины: в хранилище лота в любой момент лежит ровно текущая высшая ставка.
-- Эта схема - витрина и история: что показать на экране и что было раньше.
-- Поэтому суммы тут в центах для показа, а не в базовых единицах для расчёта.

-- Вещь, на которой продаются места. Сейчас одна - футболка Superteam Ukraine,
-- но таблица, а не константа: вторая вещь не должна требовать переписывания.
create table things (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Короткое имя для адреса и для кода: по нему вид находит свою 3D-модель.
  slug text not null unique check (slug ~ '^[a-z][a-z0-9-]{1,40}$'),
  -- Имя лота на экране: «Superteam Ukraine Local Event».
  title text not null check (length(title) between 1 and 80),
  -- Тихая строка над именем.
  tagline text check (tagline is null or length(tagline) <= 80),
  -- Путь к модели. Геометрия мест лежит рядом с ней в коде, а не здесь:
  -- координаты сняты лучами по самой модели и меняются только вместе с ней.
  model_url text not null,
  active boolean not null default true
);

-- Место под нанесение. Геометрии здесь намеренно нет - только каталог, чтобы
-- лот мог сослаться на место по коду, а база знала, что такое место бывает.
create table thing_spots (
  id uuid primary key default gen_random_uuid(),
  thing_id uuid not null references things (id) on delete cascade,
  -- Тот же код, что в разметке модели в коде.
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  label text not null check (length(label) between 1 and 40),
  sort integer not null default 0,
  unique (thing_id, code)
);

-- Как продаётся место. Сейчас работает только торг, остальное заложено, чтобы
-- добавление не ломало уже открытые лоты.
create type sale_kind as enum ('auction', 'fixed');

create type lot_status as enum ('draft', 'open', 'won', 'unsold', 'cancelled');

-- Торги за одно место.
--
-- id этой строки уходит в программу как сид PDA (поле `auction` у лота, 16
-- байт uuid). Значит строка обязана появиться раньше лота в цепочке, и её id
-- менять нельзя никогда: без него лот не подпишет возврат из своего хранилища.
create table lots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  thing_id uuid not null references things (id) on delete restrict,
  spot_id uuid not null references thing_spots (id) on delete restrict,
  kind sale_kind not null default 'auction',
  status lot_status not null default 'draft',

  -- Ниже этого ставки не принимаются. В центах, как и всё для показа.
  reserve_cents integer not null check (reserve_cents > 0),
  -- Наименьшая прибавка. Процент считает core и программа, а это пол.
  min_step_cents integer not null default 100 check (min_step_cents > 0),
  closes_at timestamptz not null,
  -- На сколько ставка под конец двигает закрытие. Свойство торга, а не
  -- константа: недельному лоту пять минут в самый раз, часовому много.
  extend_seconds integer not null default 300
    check (extend_seconds between 0 and 3600),

  -- Адрес лота в цепочке. Пусто, пока торг не открыт на Solana: строка может
  -- существовать раньше, чтобы её id попал в сиды.
  chain_lot text check (chain_lot is null or length(chain_lot) between 32 and 44),
  -- Монета торга. Адрес mint, чтобы девнетный USDC и боевой не путались.
  mint text check (mint is null or length(mint) between 32 and 44),

  constraint lots_one_open_per_spot exclude (spot_id with =) where (status = 'open')
);

-- Ставка.
--
-- Строка появляется только после того, как ставка прошла в цепочке: подпись
-- транзакции обязательна. Превью логотипа до ставки живёт в браузере и сюда не
-- попадает - поэтому всё, что здесь лежит, видно всем, и отдельных прав на
-- медиа не нужно.
create table lot_bids (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lot_id uuid not null references lots (id) on delete cascade,
  bidder uuid not null references auth.users (id) on delete restrict,
  -- Кошелёк, которым платили. Он же виден в цепочке.
  bidder_wallet text not null check (length(bidder_wallet) between 32 and 44),
  amount_cents integer not null check (amount_cents > 0),
  -- Что напечатают, если ставка выиграет.
  media_url text not null,
  -- Подпись транзакции: по ней ставку можно проверить в цепочке, не веря базе.
  signature text not null unique check (length(signature) between 64 and 100)
);

create index lot_bids_by_lot on lot_bids (lot_id, amount_cents desc, created_at);

-- Роли. Две независимые: один человек может быть и тем, и другим.
--
-- Покупателем становится каждый вошедший - ставить может кто угодно. Продавцом
-- только после звонка, и выдаём его мы руками: из браузера эту колонку не
-- выставить, политики на запись сюда нет вовсе.
create table profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  handle text unique check (handle is null or handle ~ '^[A-Za-z0-9_]{1,15}$'),
  is_buyer boolean not null default true,
  is_seller boolean not null default false,
  -- Когда состоялся звонок, после которого выдана роль продавца.
  seller_since timestamptz
);

-- Взаимные оценки по состоявшейся сделке. Обе стороны по одному разу.
create table ratings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lot_id uuid not null references lots (id) on delete cascade,
  author uuid not null references auth.users (id) on delete cascade,
  -- Кем выступал автор в этой сделке.
  side text not null check (side in ('buyer', 'seller')),
  rating smallint not null check (rating between 1 and 5),
  body text check (body is null or length(body) between 1 and 1000),
  unique (lot_id, side)
);

-- RLS: от обратного. Разрешаем ровно то, что перечислено, остальное закрыто.

alter table things enable row level security;
alter table thing_spots enable row level security;
alter table lots enable row level security;
alter table lot_bids enable row level security;
alter table profiles enable row level security;
alter table ratings enable row level security;

-- Витрина открыта всем, включая не вошедших: торг должно быть видно до входа,
-- иначе на пустую страницу никто не зарегистрируется.
create policy "вещи видны всем" on things for select using (active);
create policy "места видны всем" on thing_spots for select using (true);
create policy "торги видны всем" on lots for select using (status <> 'draft');
create policy "ставки видны всем" on lot_bids for select using (true);
create policy "оценки видны всем" on ratings for select using (true);

-- Свой профиль человек читает и правит, но только хэндл.
create policy "свой профиль виден" on profiles for select using (auth.uid() = user_id);
create policy "свой профиль заводится" on profiles for insert
  with check (auth.uid() = user_id);
create policy "свой хэндл меняется" on profiles for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Роль продавца даётся только после звонка, и выдаём её мы.
--
-- Одной политики тут мало: она отвечает на «твоя ли это строка», но не на «что
-- именно ты в неё пишешь». Без этих грантов вошедший заводил бы себе профиль
-- сразу с is_seller = true, и звонок обходился бы одним запросом.
--
-- Поэтому право на запись выдано поимённо по колонкам. До is_seller и
-- seller_since из браузера не дотянуться вовсе - их ставит service_role.
revoke insert, update on profiles from anon, authenticated;
grant insert (user_id, handle) on profiles to authenticated;
grant update (handle) on profiles to authenticated;

-- Ставку пишет сам ставящий, от своего имени и только в открытый торг.
-- Сумму, шаг и срок проверяет триггер ниже, а не эта политика: политика
-- отвечает на «ты ли это», триггер - на «можно ли так».
create policy "ставит сам за себя" on lot_bids for insert
  with check (
    auth.uid() = bidder
    and exists (
      select 1 from lots
      where lots.id = lot_id and lots.status = 'open' and lots.closes_at > now()
    )
  );

-- Оценку ставит сторона завершённого торга, по одному разу. Переписать нельзя:
-- политик на update и delete нет намеренно.
create policy "оценивает участник состоявшейся сделки" on ratings for insert
  with check (
    auth.uid() = author
    and exists (select 1 from lots where lots.id = lot_id and lots.status = 'won')
  );

-- Правила торга дублируются здесь намеренно.
--
-- Те же числа живут в packages/core для интерфейса и в программе для денег.
-- Это последний барьер: ставку можно послать запросом, минуя нашу форму, и
-- тогда проверять её будет только база. Разойдутся - человек увидит один
-- минимум, а получит отказ по другому, поэтому менять их надо всюду разом.
-- Имя с приставкой lot_: min_bid_cents уже занято старой схемой, где оно
-- считает минимум для мест на профиле X. Две функции живут рядом, каждая про
-- свои таблицы, и переименование старой сломало бы работающие там политики.
create or replace function lot_min_bid_cents(lot uuid)
returns integer
language sql
stable
as $$
  select greatest(
    l.reserve_cents,
    coalesce(
      (select max(b.amount_cents) from lot_bids b where b.lot_id = l.id)
        + greatest(
            l.min_step_cents,
            round((select max(b.amount_cents) from lot_bids b where b.lot_id = l.id) * 0.05)
          ),
      l.reserve_cents
    )
  )
  from lots l where l.id = lot;
$$;

create or replace function bids_guard()
returns trigger
language plpgsql
as $$
declare
  lot_row lots;
begin
  select * into lot_row from lots where id = new.lot_id for update;

  if lot_row.status <> 'open' then
    raise exception 'lot is not taking bids';
  end if;

  if lot_row.closes_at <= now() then
    raise exception 'bidding has closed';
  end if;

  if new.amount_cents < lot_min_bid_cents(new.lot_id) then
    raise exception 'bid must be at least % cents', lot_min_bid_cents(new.lot_id);
  end if;

  -- Ставка под конец двигает закрытие вперёд и никогда назад. Отсчёт от самой
  -- ставки, а не от прежнего срока: иначе ставка за секунду до конца добавляла
  -- бы почти ноль.
  if lot_row.closes_at - now() < make_interval(secs => lot_row.extend_seconds) then
    update lots
      set closes_at = now() + make_interval(secs => lot_row.extend_seconds)
      where id = new.lot_id;
  end if;

  return new;
end;
$$;

create trigger lot_bids_guard before insert on lot_bids
  for each row execute function bids_guard();
