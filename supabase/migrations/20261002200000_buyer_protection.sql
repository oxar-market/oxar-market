-- Защита покупателя: пруф, спор, решение арбитра. Решает программа эскроу
-- (выплата только после пруфа и окна в 72 часа, спор замораживает место), а
-- база хранит то, что программа держать не может, и то, что надо показать:
-- сами фото и ссылки пруфа, причину спора, копию срока для экрана.
--
-- Истина о деньгах - в программе. Строка здесь без транзакции в цепочке
-- ничего не двигает: кнопки в приложении сверяются с аккаунтами торга и места.

-- Срок пруфа у места: копия того, что ушло в программу при открытии торга.
-- Его видят покупатели до ставки.
-- Выигранное место, чья ставка вернулась победителю: пруфа не было к сроку,
-- арбитр решил в его пользу или молчал тридцать дней. Не «won» - продажи не
-- было, и не «unsold» - победитель был.
alter type lot_status add value if not exists 'refunded';

alter table lots
  add column proof_by timestamptz;

-- Адрес торга в программе. Аккаунт места после выплаты закрывается, и
-- прочесть торг через него уже нельзя - а пруф и спор привязаны к торгу.
alter table lots
  add column chain_sale text;

-- Пруф торга: один на торг (адрес торга в программе), потому что вещь может
-- выставляться не раз. Хеш - sha256 того, что здесь лежит, он же ушёл в
-- программу событием: подменить пруф задним числом нельзя, хеш не сойдётся.
create table proofs (
  sale text primary key,
  thing_id uuid not null references things (id) on delete cascade,
  photos text[] not null default '{}',
  links text[] not null default '{}',
  note text check (note is null or length(note) <= 1000),
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  signature text,
  proved_at timestamptz not null default now()
);

alter table proofs enable row level security;

create policy "пруф виден всем" on proofs for select using (true);

create policy "продавец кладёт пруф своей вещи" on proofs for insert to authenticated
  with check (
    is_admin()
    or exists (select 1 from things t where t.id = thing_id and t.seller = auth.uid())
  );

-- Фото пруфа - в ту же папку proof/<вещь>/, что и раньше клал админ.
create policy "продавец кладёт пруф своей вещи в хранилище" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'things'
    and (storage.foldername(name))[1] = 'proof'
    and exists (
      select 1 from things t
      where t.id::text = (storage.foldername(name))[2] and t.seller = auth.uid()
    )
  );

-- Спор по месту: победитель говорит «пруф не тот». Решение арбитра - доля
-- продавцу в сотых процента; остальное победителю.
create table disputes (
  lot_id uuid primary key references lots (id) on delete cascade,
  winner uuid not null,
  reason text not null check (length(reason) between 3 and 1000),
  signature text,
  created_at timestamptz not null default now(),
  seller_bps integer check (seller_bps between 0 and 10000),
  decided_at timestamptz,
  decision_signature text
);

alter table disputes enable row level security;

-- Причину спора видят стороны сделки и арбитр, а не все: это переписка.
create policy "спор видят стороны и арбитр" on disputes for select using (
  winner = auth.uid()
  or is_admin()
  or exists (
    select 1 from lots l join things t on t.id = l.thing_id
    where l.id = lot_id and t.seller = auth.uid()
  )
);

-- Открыть спор может только тот, чья ставка на месте высшая.
create policy "победитель открывает спор" on disputes for insert to authenticated
  with check (
    winner = auth.uid()
    and exists (
      select 1 from lot_bids b
      where b.lot_id = disputes.lot_id
        and b.bidder = auth.uid()
        and b.amount_cents = (select max(amount_cents) from lot_bids where lot_id = disputes.lot_id)
    )
  );

create policy "арбитр записывает решение" on disputes for update to authenticated
  using (is_admin())
  with check (is_admin());

-- Новый пруф будит пуш победителям этого торга: окно на спор короткое, и
-- молчание в нём - «да». Звонок как у пуша о перебитой ставке: в запросе
-- только адрес торга, функция перечитывает всё сама серверным ключом.
create function push_proof()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://islmypspqjxuhplcibam.supabase.co/functions/v1/proof-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzbG15cHNwcWp4dWhwbGNpYmFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxNDYwMDQsImV4cCI6MjEwNDcyMjAwNH0.kSrGHN_9J_nVdH66vBfy5Ni7It2kp3BEL0wcFE8OKbo'
    ),
    body := jsonb_build_object('record', jsonb_build_object('sale', new.sale))
  );
  return new;
end;
$$;

create trigger proofs_push after insert on proofs
  for each row execute function push_proof();


-- Арбитр перенёс срок пруфа в программе - копия у мест торга догоняет её.
-- Только срок и только админ: общая правка лотов админу не нужна.
create function admin_moves_proof_by(sale text, proof_by timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    return false;
  end if;
  update lots set proof_by = admin_moves_proof_by.proof_by where chain_sale = admin_moves_proof_by.sale;
  return true;
end;
$$;

revoke all on function admin_moves_proof_by(text, timestamptz) from public;
grant execute on function admin_moves_proof_by(text, timestamptz) to authenticated;
