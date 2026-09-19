-- Личность из Privy.
--
-- Первая миграция нового продукта. Старые таблицы не трогает: они остаются
-- нетронутыми до отдельного решения, что с ними делать.
--
-- Supabase доверяет чужим токенам только от пяти провайдеров, и Privy среди
-- них нет. Поэтому токен Privy меняется на настоящую сессию Supabase в
-- edge-функции privy-session, а здесь хранится связь между двумя личностями.
-- Дальше всё работает обычным auth.uid().
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
-- Политик на insert и update нет намеренно - это и есть запрет.
create policy "видно только свою личность"
  on identities for select
  using (auth.uid() = user_id);
