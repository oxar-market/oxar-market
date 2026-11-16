-- Ставку из браузера не записать: ни на открытый торг, ни от своего имени.
-- Пишет только функция record-bid под service_role, проверив транзакцию.

insert into auth.users (id, email) values ('cccccccc-0000-4000-8000-000000000003', 'mallory@test.invalid');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-000000000003","role":"authenticated"}', true);

do $$
declare open_lot uuid;
begin
  -- Любой открытый лот; нет такого - запрет проверяем на выдуманном id.
  select id into open_lot from lots where status = 'open' limit 1;
  insert into lot_bids (lot_id, bidder, bidder_wallet, amount_cents, media_url, brand, signature)
    values (coalesce(open_lot, gen_random_uuid()), auth.uid(), '7MvLvtgvPtTN4VgjCm1kmK6dkKDMPxq2u7q9pKfz8LgV',
            2000000000, 'https://example.com/x.png', 'Fake', repeat('z', 88));
  raise exception 'FAIL: из браузера записали ставку без оплаты';
exception when insufficient_privilege then null;
end $$;

do $$
declare n int;
begin
  update lot_bids set amount_cents = 1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: из браузера переписали ставку'; end if;
exception when insufficient_privilege then null;
end $$;

-- Читать ставки по-прежнему можно всем: торг публичный.
do $$ begin
  perform 1 from lot_bids limit 1;
end $$;

reset role;
select 'bids: all invariants hold' as result;
