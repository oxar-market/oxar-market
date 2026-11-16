-- Укрепление базы по ревью 16.11.2026: каждая закрытая дыра - отдельной
-- проверкой. Данные заводим сами: в CI база пустая.
--
-- Люди: Салли - одобренный продавец, Мэллори - просто вошедшая.

insert into auth.users (id, email) values
  ('dddddddd-0000-4000-8000-000000000004', 'sally@test.invalid'),
  ('eeeeeeee-0000-4000-8000-000000000005', 'mallory2@test.invalid');
insert into profiles (user_id, is_seller) values ('dddddddd-0000-4000-8000-000000000004', true)
  on conflict (user_id) do update set is_seller = true;

-- Наша вещь с местом и открытым торгом; вещь Салли со своим местом.
insert into things (id, slug, title, model_url, house) values
  ('aaaa0000-0000-4000-8000-0000000000a1', 'test-our-van', 'Our van', '/models/van.glb', true);
insert into things (id, slug, title, model_url, seller, active) values
  ('aaaa0000-0000-4000-8000-0000000000b1', 'test-sally-tee', 'Sally tee', '/models/shirt.glb', 'dddddddd-0000-4000-8000-000000000004', false);
insert into thing_spots (id, thing_id, code, label) values
  ('aaaa0000-0000-4000-8000-0000000000a2', 'aaaa0000-0000-4000-8000-0000000000a1', 'hood', 'Hood'),
  ('aaaa0000-0000-4000-8000-0000000000b2', 'aaaa0000-0000-4000-8000-0000000000b1', 'chest', 'Chest');
insert into lots (id, thing_id, spot_id, reserve_cents, closes_at, status) values
  ('aaaa0000-0000-4000-8000-0000000000a3', 'aaaa0000-0000-4000-8000-0000000000a1', 'aaaa0000-0000-4000-8000-0000000000a2', 1000, now() + interval '1 day', 'open');

-- ---------- Мэллори ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-000000000005","role":"authenticated"}', true);

do $$ begin
  insert into storage.objects (bucket_id, name) values ('creatives', 'junk/free-hosting.png');
  raise exception 'FAIL: креатив в произвольную папку';
exception when insufficient_privilege then null;
end $$;

-- В папку открытого торга - можно: так кладёт логотип форма ставки.
insert into storage.objects (bucket_id, name) values ('creatives', 'aaaa0000-0000-4000-8000-0000000000a3/logo.png');

do $$ begin
  insert into push_subscriptions (user_id, endpoint, p256dh, auth)
    values (auth.uid(), 'http://169.254.169.254/latest/meta-data', 'k', 'a');
  raise exception 'FAIL: пуш-подписка на произвольный адрес';
exception when check_violation then null;
end $$;

insert into push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), 'https://fcm.googleapis.com/fcm/send/test-endpoint', 'k', 'a');

do $$ begin
  perform 1 from sellers limit 1;
  raise exception 'FAIL: старая таблица продавцов читается из браузера';
exception when insufficient_privilege then null;
end $$;

-- ---------- Салли ----------
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-4000-8000-000000000004","role":"authenticated"}', true);

do $$ begin
  insert into lots (thing_id, spot_id, reserve_cents, closes_at)
    values ('aaaa0000-0000-4000-8000-0000000000b1', 'aaaa0000-0000-4000-8000-0000000000a2', 100, now() + interval '1 day');
  raise exception 'FAIL: продавец завёл лот на месте чужой вещи';
exception when insufficient_privilege then null;
end $$;

-- На месте своей вещи - можно.
insert into lots (id, thing_id, spot_id, reserve_cents, closes_at)
  values ('aaaa0000-0000-4000-8000-0000000000b3', 'aaaa0000-0000-4000-8000-0000000000b1', 'aaaa0000-0000-4000-8000-0000000000b2', 100, now() + interval '1 day');

do $$ begin
  update lots set spot_id = 'aaaa0000-0000-4000-8000-0000000000a2' where id = 'aaaa0000-0000-4000-8000-0000000000b3';
  raise exception 'FAIL: продавец перевесил свой лот на место чужой вещи';
exception when insufficient_privilege then null;
end $$;

-- ---------- Гость ----------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$ begin
  if exists (select 1 from storage.objects where bucket_id = 'creatives') then
    raise exception 'FAIL: аноним видит список креативов';
  end if;
end $$;

do $$ begin
  perform admin_decide_seller('eeeeeeee-0000-4000-8000-000000000005', true);
  raise exception 'FAIL: аноним вызвал функцию админа';
exception when insufficient_privilege then null;
end $$;

-- ---------- Без ролей: проверки самих строк ----------
reset role;

do $$ begin
  insert into proofs (sale, thing_id, hash, links)
    values ('test-sale', 'aaaa0000-0000-4000-8000-0000000000b1', repeat('a', 64), array['javascript:alert(1)']);
  raise exception 'FAIL: ссылка пруфа не https';
exception when check_violation then null;
end $$;

do $$ begin
  insert into proofs (sale, thing_id, hash, links)
    values ('test-sale-2', 'aaaa0000-0000-4000-8000-0000000000b1', repeat('b', 64), array['https://x.com/oxar_app/status/1', 'https://youtu.be/x']);
exception when others then
  raise exception 'FAIL: пруф с https-ссылками не прошёл: %', sqlerrm;
end $$;

select 'hardening: all invariants hold' as result;
