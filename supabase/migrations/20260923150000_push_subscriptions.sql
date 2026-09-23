-- Подписки на пуши: куда стучаться браузеру перебитого.
--
-- Строка - одно устройство одного человека: у endpoint нет второго хозяина,
-- поэтому он и ключ уникальности. Ключи шифрования (p256dh, auth) выдаёт сам
-- браузер при подписке; без них пуш-службе нельзя отдать даже байта полезной
-- нагрузки - она шифруется под конкретное устройство.
--
-- Читать подписки не может никто, кроме сервера: адреса пуш-служб с ключами -
-- это возможность слать человеку что угодно. Своё можно завести и удалить.

create table push_subscriptions (
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

create policy "свою подписку заводят"
  on push_subscriptions for insert to authenticated
  with check (user_id = auth.uid());

create policy "свою подписку убирают"
  on push_subscriptions for delete to authenticated
  using (user_id = auth.uid());

-- Свои подписки видны себе: без select не работает upsert при повторном
-- включении колокольчика на том же устройстве.
create policy "свои подписки видны"
  on push_subscriptions for select to authenticated
  using (user_id = auth.uid());

-- Сетевые вызовы из базы живут в расширении pg_net, и его никто не включает
-- за нас: без этой строки первый же триггер падал бы «schema net does not
-- exist» - что он на локальном стенде и сделал.
create extension if not exists pg_net;

-- Каждая новая ставка будит функцию уведомлений. Звонок - свой, на голом
-- pg_net: готовая обёртка supabase_functions живёт в схеме, которая на боевом
-- проекте появляется только вместе с их вебхуками из дашборда - деплой упал
-- ровно на её отсутствии. Своя функция зависит только от расширения строкой
-- выше.
--
-- В запросе - только id ставки: функция перечитает всё сама серверным
-- ключом, поэтому подделка вызова бесполезна, а секретов здесь нет -
-- анонимный ключ публичен по своей природе, он уезжает в браузер каждому.
create function push_outbid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://islmypspqjxuhplcibam.supabase.co/functions/v1/outbid-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzbG15cHNwcWp4dWhwbGNpYmFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxNDYwMDQsImV4cCI6MjEwNDcyMjAwNH0.kSrGHN_9J_nVdH66vBfy5Ni7It2kp3BEL0wcFE8OKbo'
    ),
    body := jsonb_build_object('record', jsonb_build_object('id', new.id))
  );
  return new;
end;
$$;

create trigger lot_bids_push after insert on lot_bids
  for each row execute function push_outbid();
