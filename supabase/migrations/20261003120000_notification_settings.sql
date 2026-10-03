-- Куда и о чём писать человеку.
--
-- Почту кладёт только функция privy-session: она берёт её из identity-токена
-- Privy, подписанного Privy, то есть адрес подтверждён кодом. Свой адрес
-- человек сюда не впишет - иначе любой подписал бы чужую почту на наши
-- письма. Переключатели - его, их он правит сам.
create table notification_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- null - почты нет: вошёл кошельком и не привязал.
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+$'),
  -- Письма вообще. Выключил - не пишем ничего, кроме пушей.
  email_on boolean not null default true,
  -- «Вас перебили» письмом: самое частое, его отключают отдельно.
  email_outbid boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table notification_settings enable row level security;

create policy "свои настройки видит сам" on notification_settings for select
  to authenticated using (user_id = auth.uid());

create policy "свои переключатели правит сам" on notification_settings for update
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Почту и строку целиком пишет только сервер; человеку - два переключателя.
revoke insert, update on notification_settings from anon, authenticated;
grant update (email_on, email_outbid) on notification_settings to authenticated;
