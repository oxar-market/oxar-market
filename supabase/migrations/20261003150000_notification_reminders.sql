-- Остальные события из таблицы уведомлений: исход торга, споры и
-- напоминания по времени.
--
-- Исходы ловят триггеры на смене строки - так событие ложится в ту же
-- секунду, кто бы строку ни поменял: расчёт, приложение или арбитр.
-- Напоминания по времени («через час конец», «сутки на проверку пруфа»,
-- «до срока пруфа неделя») ставит queue_reminders: её зовёт расчёт на каждом
-- проходе, раз в десять минут. Окна узкие и ключи уникальные, поэтому старые
-- торги никому не напомнят, а свежие - ровно раз.
alter table notification_events drop constraint notification_events_kind_check;
alter table notification_events add constraint notification_events_kind_check check (kind in (
  'outbid', 'proof',
  -- покупатель
  'ending', 'won', 'appeal_last_day', 'refunded', 'decided',
  -- продавец
  'sold', 'proof_due', 'paid', 'disputed',
  -- админ
  'dispute_admin'
));

-- Верхняя ставка места: кто её держит. Один и тот же порядок, что и везде.
create function lot_leader(lot uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select b.bidder from lot_bids b
  where b.lot_id = lot
  order by b.amount_cents desc, b.created_at asc
  limit 1;
$$;

revoke all on function lot_leader(uuid) from public, anon, authenticated;

-- Исход места: выиграл, вернулась ставка, деньги дошли до продавца.
create function notify_lot_outcome()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  leader uuid := lot_leader(new.id);
  seller uuid;
begin
  select t.seller into seller from things t where t.id = new.thing_id;

  if new.status = 'won' and old.status = 'open' and leader is not null then
    insert into notification_events (user_id, kind, key, data)
    values (leader, 'won', 'won:' || new.id, jsonb_build_object('lot_id', new.id, 'proof_by', new.proof_by))
    on conflict (key) do nothing;
  end if;

  -- Продавцу - одно письмо на торг вещи, а не на каждое место.
  if new.status in ('won', 'unsold') and old.status = 'open' and seller is not null then
    insert into notification_events (user_id, kind, key, data)
    values (
      seller, 'sold', 'sold:' || new.thing_id || ':' || to_char(new.closes_at at time zone 'utc', 'YYYY-MM-DD'),
      jsonb_build_object('lot_id', new.id, 'thing_id', new.thing_id, 'proof_by', new.proof_by)
    )
    on conflict (key) do nothing;
  end if;

  if new.status = 'refunded' and old.status <> 'refunded' and leader is not null then
    insert into notification_events (user_id, kind, key, data)
    values (leader, 'refunded', 'refunded:' || new.id, jsonb_build_object('lot_id', new.id))
    on conflict (key) do nothing;
  end if;

  -- Выплата продавцу: у выигранного места появилась подпись расчёта.
  if new.status = 'won' and new.settle_signature is not null and old.settle_signature is null and seller is not null then
    insert into notification_events (user_id, kind, key, data)
    values (seller, 'paid', 'paid:' || new.id, jsonb_build_object('lot_id', new.id))
    on conflict (key) do nothing;
  end if;

  return new;
end;
$$;

create trigger lots_notify after update of status, settle_signature on lots
  for each row execute function notify_lot_outcome();

-- Спор открыт: продавцу и каждому админу. Решён: победителю и продавцу.
create function notify_dispute()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  seller uuid;
begin
  select t.seller into seller from lots l join things t on t.id = l.thing_id where l.id = new.lot_id;

  if tg_op = 'INSERT' then
    if seller is not null then
      insert into notification_events (user_id, kind, key, data)
      values (seller, 'disputed', 'disputed:' || new.lot_id, jsonb_build_object('lot_id', new.lot_id))
      on conflict (key) do nothing;
    end if;
    insert into notification_events (user_id, kind, key, data)
    select i.user_id, 'dispute_admin', 'dispute_admin:' || new.lot_id || ':' || i.user_id, jsonb_build_object('lot_id', new.lot_id)
    from admins a join identities i on i.privy_id = a.privy_id
    on conflict (key) do nothing;
  elsif new.decided_at is not null and old.decided_at is null then
    insert into notification_events (user_id, kind, key, data)
    select who, 'decided', 'decided:' || new.lot_id || ':' || who,
      jsonb_build_object('lot_id', new.lot_id, 'seller_bps', new.seller_bps)
    from unnest(array[new.winner, seller]) as who
    where who is not null
    on conflict (key) do nothing;
  end if;
  return new;
end;
$$;

create trigger disputes_notify after insert or update of decided_at on disputes
  for each row execute function notify_dispute();

-- Напоминания по времени. Зовёт расчёт (service_role) на каждом проходе.
create function queue_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  added integer := 0;
  n integer;
begin
  -- Конец торга через час: всем, кто ставил на вещь, по разу на торг.
  insert into notification_events (user_id, kind, key, data)
  select distinct on (b.bidder, l.thing_id)
    b.bidder, 'ending',
    'ending:' || l.thing_id || ':' || to_char(l.closes_at at time zone 'utc', 'YYYY-MM-DD') || ':' || b.bidder,
    jsonb_build_object('lot_id', l.id, 'closes_at', l.closes_at)
  from lots l join lot_bids b on b.lot_id = l.id
  where l.status = 'open' and l.closes_at > now() and l.closes_at <= now() + interval '1 hour'
  order by b.bidder, l.thing_id, l.closes_at
  on conflict (key) do nothing;
  get diagnostics n = row_count; added := added + n;

  -- Последние сутки окна проверки пруфа, а победитель молчит: ни спора,
  -- ни выплаты.
  insert into notification_events (user_id, kind, key, data)
  select lot_leader(l.id), 'appeal_last_day', 'appeal_last_day:' || l.id,
    jsonb_build_object('lot_id', l.id, 'until', p.proved_at + interval '72 hours')
  from lots l
  join proofs p on p.sale = l.chain_sale
  where l.status = 'won'
    and l.settle_signature is null
    and p.proved_at <= now() - interval '48 hours'
    and p.proved_at > now() - interval '72 hours'
    and not exists (select 1 from disputes d where d.lot_id = l.id)
    and lot_leader(l.id) is not null
  on conflict (key) do nothing;
  get diagnostics n = row_count; added := added + n;

  -- Продавцу: до срока пруфа неделя и сутки, а пруфа нет.
  insert into notification_events (user_id, kind, key, data)
  select distinct on (l.chain_sale, w.days)
    t.seller, 'proof_due', 'proof_due:' || l.chain_sale || ':' || w.days,
    jsonb_build_object('lot_id', l.id, 'proof_by', l.proof_by, 'days', w.days)
  from lots l
  join things t on t.id = l.thing_id
  cross join (values (7), (1)) as w(days)
  where l.status = 'won'
    and l.chain_sale is not null
    and l.proof_by is not null
    and t.seller is not null
    and l.proof_by > now()
    and l.proof_by <= now() + make_interval(days => w.days)
    and not exists (select 1 from proofs p where p.sale = l.chain_sale)
  order by l.chain_sale, w.days
  on conflict (key) do nothing;
  get diagnostics n = row_count; added := added + n;

  -- Событие, которое разносчик так и не забрал (не был выкачен, упал по
  -- дороге), - разбудить ещё раз. Забрать дважды он не может.
  perform net.http_post(
    url := 'https://islmypspqjxuhplcibam.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzbG15cHNwcWp4dWhwbGNpYmFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxNDYwMDQsImV4cCI6MjEwNDcyMjAwNH0.kSrGHN_9J_nVdH66vBfy5Ni7It2kp3BEL0wcFE8OKbo'
    ),
    body := jsonb_build_object('id', e.id)
  )
  from notification_events e
  where e.pushed_at is null
    and e.created_at < now() - interval '5 minutes'
    and e.created_at > now() - interval '1 day';

  return added;
end;
$$;

revoke all on function queue_reminders() from public, anon, authenticated;
grant execute on function queue_reminders() to service_role;
