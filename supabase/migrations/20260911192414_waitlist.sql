-- Заявки с лендинга. Собираем X-хэндл, сторону (продаёт место или покупает)
-- и контакт. Хэндл — основной идентификатор: по нему же потом считается
-- оценка заработка и с ним же человек приходит продавать слоты.

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- без ведущей @, правила X: латиница, цифры, подчёркивание, до 15 символов
  x_handle text not null check (x_handle ~ '^[A-Za-z0-9_]{1,15}$'),
  side text not null check (side in ('seller', 'buyer')),

  -- на момент заявки; нужен, чтобы понимать состав спроса и предложения
  follower_count integer check (follower_count >= 0),

  -- email или телеграм, необязателен: хэндла достаточно, чтобы найти человека
  contact text check (contact is null or length(contact) between 3 and 320),

  -- откуда пришёл: utm, реферал, конкретный пост
  source text check (source is null or length(source) <= 200),

  notes text check (notes is null or length(notes) <= 1000)
);

-- Один человек — одна заявка, регистр не важен
create unique index waitlist_handle_unique on public.waitlist (lower(x_handle));

create index waitlist_created_at_idx on public.waitlist (created_at desc);
create index waitlist_side_idx on public.waitlist (side);

alter table public.waitlist enable row level security;

-- Форма на лендинге ходит с публичным anon-ключом, поэтому разрешаем ровно
-- одно действие: добавить себя. Политик на select, update и delete нет
-- намеренно — список заявок виден только через service_role, иначе любой
-- посетитель сайта смог бы его выкачать.
create policy "anyone can join the waitlist"
  on public.waitlist
  for insert
  to anon, authenticated
  with check (true);

comment on table public.waitlist is 'Заявки с лендинга oxar.app до запуска маркетплейса';
