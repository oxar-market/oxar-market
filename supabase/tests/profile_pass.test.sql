-- Инварианты профиля и рейтинга: что человек может и чего не может.
--
-- Запуск - в одной транзакции, которую потом откатывают (scripts/sql-tests.sh):
-- тестовые люди и строки в базе не остаются. Любой провал - исключение с
-- «FAIL», и прогон падает.
--
-- Люди: Алиса (a…) и Боб (b…). Действуем от их имени так же, как браузер:
-- роль authenticated и sub в JWT.

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'alice@test.invalid'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'bob@test.invalid');

-- Роли продавца и покупателя: строка есть у каждого, правит её только сервер.
-- Боб - одобренный продавец.
insert into profiles (user_id) values ('aaaaaaaa-0000-4000-8000-000000000001')
  on conflict (user_id) do nothing;
insert into profiles (user_id, is_seller) values ('bbbbbbbb-0000-4000-8000-000000000002', true)
  on conflict (user_id) do update set is_seller = true;

-- Кошелёк Алисы привязала функция входа (service_role, то есть мимо RLS).
insert into wallet_owners (wallet, user_id)
  values ('AkC8BHHNJQ61fXVsHVnWsferBm4PC6t8oT8YwRmrwDtB', 'aaaaaaaa-0000-4000-8000-000000000001');

-- ---------- Боб ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);

-- Продавец заводит вещь, но не с охватом: охват вносим мы, и завышенный
-- охват своей вещи раздул бы пропуска её победителей.
do $$ begin
  insert into things (seller, slug, title, model_url, active, post_reach)
    values ('bbbbbbbb-0000-4000-8000-000000000002', 'bob-fake-reach', 'Bob thing', '/models/shirt.glb', false, 1000000);
  raise exception 'FAIL: продавец завёл вещь с охватом';
exception when insufficient_privilege then null;
end $$;

-- Та же вещь без охвата - можно: отбивает именно охват.
insert into things (seller, slug, title, model_url, active)
  values ('bbbbbbbb-0000-4000-8000-000000000002', 'bob-plain', 'Bob thing', '/models/shirt.glb', false);

do $$ begin
  insert into public_profiles (user_id, display_name) values ('aaaaaaaa-0000-4000-8000-000000000001', 'Not Alice');
  raise exception 'FAIL: Боб завёл профиль от имени Алисы';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  insert into wallet_owners (wallet, user_id)
    values ('7MvLvtgvPtTN4VgjCm1kmK6dkKDMPxq2u7q9pKfz8LgV', 'bbbbbbbb-0000-4000-8000-000000000002');
  raise exception 'FAIL: из браузера привязали кошелёк';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  if exists (select 1 from wallet_owners) then
    raise exception 'FAIL: из браузера видно, чей кошелёк';
  end if;
  update wallet_owners set user_id = 'bbbbbbbb-0000-4000-8000-000000000002';
exception when insufficient_privilege then null;
end $$;

-- ---------- Алиса ----------
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

insert into public_profiles (display_name, brand, x_handle, avatar_path)
  values ('Alice', 'Acme', 'alice_x', 'aaaaaaaa-0000-4000-8000-000000000001/avatar.png');

do $$ begin
  update public_profiles set avatar_path = 'bbbbbbbb-0000-4000-8000-000000000002/avatar.png';
  raise exception 'FAIL: аватар указывает в чужую папку';
exception when check_violation then null;
end $$;

do $$ begin
  update public_profiles set x_handle = 'not a handle';
  raise exception 'FAIL: X не по правилам';
exception when check_violation then null;
end $$;

do $$ begin
  update public_profiles set display_name = repeat('x', 41);
  raise exception 'FAIL: имя длиннее 40';
exception when check_violation then null;
end $$;

do $$ begin
  update public_profiles set display_name = ' Alice';
  raise exception 'FAIL: имя с пробелом по краю';
exception when check_violation then null;
end $$;

-- Имя не притворяется кошельком: ни целым адресом, ни коротким видом из
-- рейтинга.
do $$ begin
  update public_profiles set display_name = '7MvL..8LgV';
  raise exception 'FAIL: имя в виде короткого кошелька';
exception when check_violation then null;
end $$;

do $$ begin
  update public_profiles set display_name = '7MvL...8LgV';
  raise exception 'FAIL: имя в виде короткого кошелька с тремя точками';
exception when check_violation then null;
end $$;

do $$ begin
  update public_profiles set display_name = '7MvLvtgvPtTN4VgjCm1kmK6dkKDMPxq2u7q9pKfz8LgV';
  raise exception 'FAIL: имя - чужой адрес';
exception when check_violation then null;
end $$;

-- Широкими знаками короткий кошелёк выглядит так же. База хранит имя
-- только в виде NFKC, и правило кошелька видит его обычными знаками.
do $$ begin
  update public_profiles set display_name = U&'\FF17\FF2D\FF56\FF2C\FF0E\FF0E\FF18\FF2C\FF47\FF36';
  raise exception 'FAIL: короткий кошелёк широкими знаками';
exception when check_violation then null;
end $$;

-- Пустые знаки, которые не нули ширины, но и не видны: хангыль, Брайль.
do $$ begin
  update public_profiles set display_name = 'Alice' || U&'\3164';
  raise exception 'FAIL: пустой знак хангыля в имени';
exception when check_violation then null;
end $$;

do $$ begin
  update public_profiles set display_name = 'Alice' || U&'\2800';
  raise exception 'FAIL: пустой знак Брайля в имени';
exception when check_violation then null;
end $$;

-- Невидимые знаки: «Ali​ce» с пробелом нулевой ширины выглядит как «Alice».
do $$ begin
  update public_profiles set display_name = 'Ali' || U&'\200B' || 'ce';
  raise exception 'FAIL: невидимый знак в имени';
exception when check_violation then null;
end $$;

do $$
declare n int;
begin
  update profiles set is_seller = true where user_id = auth.uid();
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: выдала себе роль продавца'; end if;
-- Отказ в правах на таблицу - тоже запрет, ещё строже.
exception when insufficient_privilege then null;
end $$;

do $$
declare n int;
begin
  update things set post_reach = 999999999;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: из браузера переписан охват'; end if;
exception when insufficient_privilege then null;
end $$;

do $$ begin
  insert into storage.objects (bucket_id, name) values ('faces', 'bbbbbbbb-0000-4000-8000-000000000002/x.png');
  raise exception 'FAIL: картинка в чужую папку';
exception when insufficient_privilege then null;
end $$;

insert into storage.objects (bucket_id, name) values ('faces', 'aaaaaaaa-0000-4000-8000-000000000001/avatar.png');

-- ---------- Снова Боб ----------
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);

do $$
declare n int;
begin
  update public_profiles set display_name = 'Bob owns this' where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: Боб переписал имя Алисы'; end if;
  delete from public_profiles where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: Боб удалил профиль Алисы'; end if;
end $$;

do $$ begin
  insert into public_profiles (display_name) values ('ALICE');
  raise exception 'FAIL: занятое имя взяли другим регистром';
exception when unique_violation then null;
end $$;

-- Широкая «Ａ» - та же «A» после нормализации NFKC: имя не в NFKC база не
-- хранит вовсе, а в NFKC оно занято.
do $$ begin
  insert into public_profiles (display_name) values (U&'\FF21lice');
  raise exception 'FAIL: занятое имя взяли широкой буквой';
exception when unique_violation or check_violation then null;
end $$;

-- Своё имя - пожалуйста.
insert into public_profiles (display_name) values ('Bob');

do $$
declare n int;
begin
  -- Удалять из хранилища через SQL нельзя никому (только через его API),
  -- поэтому проверяем запись: чужой файл Бобу не переименовать.
  update storage.objects set name = 'bbbbbbbb-0000-4000-8000-000000000002/stolen.png'
    where name = 'aaaaaaaa-0000-4000-8000-000000000001/avatar.png';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: Боб забрал аватар Алисы'; end if;
end $$;

-- ---------- Гость ----------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$ begin
  if (select display_name from public_profiles where user_id = 'aaaaaaaa-0000-4000-8000-000000000001') <> 'Alice' then
    raise exception 'FAIL: имя Алисы изменилось или не видно';
  end if;
  if (select display_name from wallet_faces where wallet = 'AkC8BHHNJQ61fXVsHVnWsferBm4PC6t8oT8YwRmrwDtB') is distinct from 'Alice' then
    raise exception 'FAIL: в рейтинге у кошелька Алисы не её имя';
  end if;
  if exists (select 1 from information_schema.columns where table_name = 'wallet_faces' and column_name = 'user_id') then
    raise exception 'FAIL: рейтинг выдаёт id аккаунта';
  end if;
end $$;

do $$ begin
  insert into public_profiles (display_name) values ('Guest');
  raise exception 'FAIL: гость завёл профиль';
exception when insufficient_privilege or not_null_violation then null;
end $$;

reset role;

do $$ begin
  if (select user_id from wallet_owners where wallet = 'AkC8BHHNJQ61fXVsHVnWsferBm4PC6t8oT8YwRmrwDtB') <> 'aaaaaaaa-0000-4000-8000-000000000001' then
    raise exception 'FAIL: кошелёк Алисы переписан на другого';
  end if;
end $$;

select 'profile_pass: all invariants hold' as result;
