-- Поля оплаты и права на них.
--
-- Порядок сделки после этой миграции: покупатель подаёт заявку, продавец
-- одобряет и тем самым запускает окно оплаты `pay_by`, покупатель привязывает
-- свой кошелёк и созданный стрим. Стрим создаётся после одобрения, а не при
-- заявке: открытие контракта в Streamflow стоит 0.117 SOL невозвратно, и отказ
-- продавца сжигал бы их впустую. Решение записано в docs/plan-payments.md.
--
-- Каждое новое поле получает права здесь же. Сайт - статика, код оплаты уедет
-- в бандл к любому, и защищает не интерфейс, а база.

-- Кошелёк для выплат. Адрес Solana одинаков в девнете и мейннете, поэтому
-- поле одно. Проверка - алфавит base58 и длина, большего регулярка не может.
alter table public.sellers add column payout_wallet text
  check (payout_wallet is null or payout_wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$');

comment on column public.sellers.payout_wallet is
  'Куда течёт стрим. Ставит сам продавец, в отличие от auth_email и verified';

-- Покупатель в брони до сих пор был только хэндлом и контактом, то есть
-- строкой без связи с тем, кто вошёл. Для оплаты этого мало: привязать стрим
-- должен ровно тот, кто подавал заявку, и проверить это можно только по
-- адресу из токена.
alter table public.bookings add column buyer_email text
  default (auth.jwt() ->> 'email')
  check (buyer_email is null or length(buyer_email) between 3 and 320);

comment on column public.bookings.buyer_email is
  'Кто подал заявку, по адресу входа. Пусто у броней, созданных аукционом';

alter table public.bookings add column buyer_wallet text
  check (buyer_wallet is null or buyer_wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$');

alter table public.bookings add column stream_id text
  check (stream_id is null or length(stream_id) between 32 and 88);

alter table public.bookings add column pay_by timestamptz;

comment on column public.bookings.pay_by is
  'До какого момента ждём стрим. Ставится при одобрении, дальше бронь снимает крон';

create index bookings_unpaid_idx on public.bookings (pay_by)
  where status = 'approved' and stream_id is null;

-- Условия сделки по-прежнему не переписываются. К ним добавились сеть и
-- покупатель, а поля оплаты заполняются ровно один раз: иначе покупатель мог
-- бы переставить бронь на другой, более дешёвый стрим, а продавец - продлить
-- себе окно оплаты.
create or replace function public.bookings_freeze_terms()
  returns trigger
  language plpgsql
as $$
begin
  if new.listing_id is distinct from old.listing_id
    or new.buyer_handle is distinct from old.buyer_handle
    or new.buyer_contact is distinct from old.buyer_contact
    or new.buyer_email is distinct from old.buyer_email
    or new.creative_url is distinct from old.creative_url
    or new.creative_text is distinct from old.creative_text
    or new.start_date is distinct from old.start_date
    or new.end_date is distinct from old.end_date
    or new.price_cents is distinct from old.price_cents
    or new.network is distinct from old.network
  then
    raise exception 'only status can change on a filed booking';
  end if;

  if old.stream_id is not null and new.stream_id is distinct from old.stream_id then
    raise exception 'stream is attached once';
  end if;
  if old.buyer_wallet is not null and new.buyer_wallet is distinct from old.buyer_wallet then
    raise exception 'buyer wallet is attached once';
  end if;
  if old.pay_by is not null and new.pay_by is distinct from old.pay_by then
    raise exception 'payment window is set once';
  end if;

  return new;
end;
$$;

-- Заявку подаёт тот, кто вошёл, и подписывается своим адресом. Умолчание его
-- и проставит, но полагаться на умолчание нельзя: его можно перебить в теле
-- запроса, поэтому проверка стоит в политике.
drop policy "insiders can request a devnet placement" on public.bookings;

create policy "insiders can request a devnet placement"
  on public.bookings for insert to authenticated
  with check (
    status = 'requested'
    and network = 'devnet'
    and buyer_email is not null
    and lower(buyer_email) = lower(auth.jwt() ->> 'email')
    and public.has_access()
  );

-- Покупатель привязывает кошелёк и стрим к своей же одобренной брони. Статус
-- он не двигает: сделку закрывает продавец или срок.
create policy "buyer attaches own payment"
  on public.bookings for update to authenticated
  using (
    status = 'approved'
    and buyer_email is not null
    and lower(buyer_email) = lower(auth.jwt() ->> 'email')
    and public.has_access()
  )
  with check (status = 'approved');

-- Продавец ставит себе кошелёк для выплат. Политика пускает к своей строке,
-- грант ниже - только к этому полю.
create policy "seller sets own payout wallet"
  on public.sellers for update to authenticated
  using (
    auth_email is not null
    and lower(auth_email) = lower(auth.jwt() ->> 'email')
  )
  with check (
    auth_email is not null
    and lower(auth_email) = lower(auth.jwt() ->> 'email')
  );

-- Права по колонкам. Политика решает, к какой строке пускать, а грант - какие
-- поля вообще можно назвать в UPDATE. Без него у вошедшего остаётся право
-- писать всё подряд, и единственной защитой оказывается триггер.
revoke update on public.sellers from authenticated;
grant update (payout_wallet) on public.sellers to authenticated;

revoke update on public.bookings from authenticated;
grant update (status, pay_by, buyer_wallet, stream_id) on public.bookings to authenticated;
