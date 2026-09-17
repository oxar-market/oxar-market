-- Сетевой рубеж: до открытия платформы из браузера можно создавать только
-- девнетовые брони.
--
-- Сайт собирается статикой, поэтому весь код оплаты уезжает в бандл к любому
-- посетителю. Спрятанная кнопка ничего не защищает: бандл читается, REST
-- дёргается напрямую. Значит рубеж должен стоять в базе, и он должен стоять
-- раньше, чем появится первая строчка кода оплаты, а не после.
--
-- Колонка заодно решает вторую задачу, скучную и не менее важную: тестовые
-- сделки на девнете не должны перепутаться с настоящими. Без явного признака
-- через месяц никто не скажет, что это была за бронь на $620.

alter table public.bookings
  add column network text not null default 'devnet'
  check (network in ('devnet', 'mainnet'));

comment on column public.bookings.network is
  'Сеть Solana, в которой идут деньги по этой брони. Из браузера пишется только devnet';

-- Две брони, которые уже лежат в таблице, заведены до всякой оплаты, и денег
-- за ними нет ни в одной сети. Умолчание проставит им devnet, и это ближе к
-- правде, чем mainnet: трогать их нельзя, а считать настоящими - тем более.

-- Заявку по-прежнему подаёт только тот, кого пустили дальше вейтлиста. К этому
-- добавляется сеть: mainnet из браузера не создать никому, пока мы сами не
-- перепишем эту политику.
drop policy "insiders can request a placement" on public.bookings;

create policy "insiders can request a devnet placement"
  on public.bookings for insert to authenticated
  with check (
    status = 'requested'
    and network = 'devnet'
    and public.has_access()
  );

-- Сеть - такое же условие сделки, как цена и даты: после подачи не меняется.
-- Без этой строки продавец мог бы одобрить девнетовую бронь, переписав её в
-- mainnet, и обойти политику выше через update.
create or replace function public.bookings_freeze_terms()
  returns trigger
  language plpgsql
as $$
begin
  if new.listing_id is distinct from old.listing_id
    or new.buyer_handle is distinct from old.buyer_handle
    or new.buyer_contact is distinct from old.buyer_contact
    or new.creative_url is distinct from old.creative_url
    or new.creative_text is distinct from old.creative_text
    or new.start_date is distinct from old.start_date
    or new.end_date is distinct from old.end_date
    or new.price_cents is distinct from old.price_cents
    or new.network is distinct from old.network
  then
    raise exception 'only status can change on a filed booking';
  end if;
  return new;
end;
$$;
