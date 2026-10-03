-- Очередь уведомлений: одно событие - одна строка, её разносит функция notify.
--
-- Раньше каждая пуш-функция сама решала, кому и что слать, по id ставки или
-- адресу торга из запроса. Звать их мог кто угодно с анонимным ключом, а
-- outbid-push не помнил, что уже слал: дёрни её сто раз - сто пушей. Теперь
-- решает база: событие кладут триггеры (и позже расчёт по расписанию),
-- ключ события уникален - дубль не ляжет, а функция берёт строку, только
-- если её ещё никто не разнёс. Звать функцию снаружи бесполезно.
--
-- Текст пуша собирает функция по виду события: так весь текст уведомлений
-- в одном месте, а в базе - только факты.
create table notification_events (
  id bigint generated always as identity primary key,
  -- Кому. Один человек - одно событие: «пришёл пруф» на три места одного
  -- победителя - три строки, у каждого места свой срок и своя кнопка.
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('outbid', 'proof')),
  -- Уникальный смысл события: 'outbid:<ставка>', 'proof:<лот>'. Второй раз
  -- то же событие не ляжет, сколько бы раз ни сработал триггер.
  key text not null unique,
  -- Факты для текста: лот, место, вещь, сумма.
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  -- Когда разнесли пуш. null - ещё нет; функция ставит отметку до отправки.
  pushed_at timestamptz
);

create index notification_events_waiting on notification_events (created_at) where pushed_at is null;

-- Клиенту в очередь ни читать, ни писать: это внутренности рассылки.
alter table notification_events enable row level security;

-- Разбудить разносчика. В запросе только id: функция перечитает строку
-- серверным ключом и возьмёт её, только если та ещё не разнесена.
create function notify_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://islmypspqjxuhplcibam.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzbG15cHNwcWp4dWhwbGNpYmFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxNDYwMDQsImV4cCI6MjEwNDcyMjAwNH0.kSrGHN_9J_nVdH66vBfy5Ni7It2kp3BEL0wcFE8OKbo'
    ),
    body := jsonb_build_object('id', new.id)
  );
  return new;
end;
$$;

create trigger notification_events_send after insert on notification_events
  for each row execute function notify_event();

-- Перебили: событие тому, чья ставка была верхней до этой. Перебил сам себя -
-- некого уведомлять.
create or replace function push_outbid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  loser uuid;
begin
  select b.bidder into loser
  from lot_bids b
  where b.lot_id = new.lot_id and b.id <> new.id and b.created_at <= new.created_at
  order by b.amount_cents desc, b.created_at asc
  limit 1;

  if loser is not null and loser <> new.bidder then
    insert into notification_events (user_id, kind, key, data)
    values (
      loser,
      'outbid',
      'outbid:' || new.id,
      jsonb_build_object('lot_id', new.lot_id, 'amount_cents', new.amount_cents)
    )
    on conflict (key) do nothing;
  end if;
  return new;
end;
$$;

-- Пришёл пруф: событие каждому победителю торга, по месту.
create or replace function push_proof()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notification_events (user_id, kind, key, data)
  select top.bidder, 'proof', 'proof:' || l.id, jsonb_build_object('lot_id', l.id, 'sale', new.sale)
  from lots l
  cross join lateral (
    select b.bidder from lot_bids b
    where b.lot_id = l.id
    order by b.amount_cents desc, b.created_at asc
    limit 1
  ) top
  where l.chain_sale = new.sale and l.status = 'won'
  on conflict (key) do nothing;
  return new;
end;
$$;
