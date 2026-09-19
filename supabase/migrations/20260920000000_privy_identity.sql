-- Личность из Privy и проверка того, что RLS её уважает.
--
-- Первая миграция нового продукта. Старые таблицы не трогает: они остаются
-- нетронутыми до отдельного решения, что с ними делать.
--
-- Связь односторонняя и простая: у человека один аккаунт Supabase и один
-- идентификатор Privy. Настоящей почты у него может не быть вовсе - он мог
-- войти кошельком, - поэтому опознаём по privy_id, а не по адресу.

create table if not exists identities (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Идентификатор Privy вида did:privy:xxx. Уникален: два аккаунта Supabase
  -- на одного человека означали бы, что он видит только половину своих ставок.
  privy_id text not null unique,
  created_at timestamptz not null default now()
);

alter table identities enable row level security;

-- Человек видит только свою строку. Писать в таблицу из браузера нельзя
-- вовсе: связь заводит edge-функция под service_role, который RLS обходит.
-- Политики на insert и update нет намеренно - это и есть запрет.
create policy "видно только свою личность"
  on identities for select
  using (auth.uid() = user_id);

-- Пробная таблица: на ней проверяется, что сессия, выданная в обмен на токен
-- Privy, опознаётся политиками как настоящая. Удаляется вместе со спайком.
create table if not exists spike_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);

alter table spike_notes enable row level security;

create policy "видно только свои заметки"
  on spike_notes for select
  using (auth.uid() = user_id);

create policy "писать только от своего имени"
  on spike_notes for insert
  with check (auth.uid() = user_id);
