-- Укрепление базы по ревью безопасности 16.11.2026. Ничего не удаляет:
-- закрывает доступ и проверяет новые строки.

-- 1. Хранилище логотипов ставок (creatives).
--    Класть мог любой вошедший куда угодно - бесплатный хостинг под нашим
--    проектом. Теперь только в папку открытого торга (логотип ставки) или
--    листа стикеров вещи (логотип стикера) - туда, куда кладёт сайт.
--    Список файлов бакета мог получить кто угодно, даже аноним, - в том числе
--    логотипы тех, кто не довёл ставку. Читать список незачем: публичный бакет
--    отдаёт файл по прямому адресу и без этой политики.
drop policy if exists "вошедший кладёт креатив" on storage.objects;
create policy "креатив: торг или стикеры" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'creatives'
    and (
      exists (
        select 1 from lots l
        where l.id::text = (storage.foldername(name))[1] and l.status = 'open' and l.closes_at > now()
      )
      or exists (
        select 1 from things t
        where 'stickers-' || t.id::text = (storage.foldername(name))[1] and t.sticker_sheet is not null
      )
    )
  );
drop policy if exists "creatives are readable" on storage.objects;

-- 2. Пуш-подписка: адрес - только пуш-служба браузера. Иначе любой вписывал
--    свой адрес, и функция notify стучалась туда от нашего имени. Старые строки
--    не проверяем (not valid): их писали браузеры, а не руки.
alter table push_subscriptions add constraint push_endpoint_is_push_service check (
  endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/'
) not valid;

-- 3. Ссылки пруфа - только https: их открывают победитель и админ, чужая
--    схема в ссылке - путь к фишингу. Сайт проверяет это до подписи.
alter table proofs add constraint proof_links_are_https check (
  cardinality(links) = 0
  or array_to_string(links, E'\n') ~ '^https://[^\n]+(\nhttps://[^\n]+)*$'
) not valid;

-- 4. Продавец заводит и правит лот только на месте своей же вещи. Прежде
--    spot_id мог быть местом чужой вещи - например, нашего фургона, и тогда
--    наш торг на это место уже не открылся бы.
drop policy if exists "продавец заводит черновик лота" on lots;
create policy "продавец заводит черновик лота" on lots for insert
  with check (
    status = 'draft'
    and exists (
      select 1 from things t
      where t.id = lots.thing_id and t.seller = auth.uid() and t.stage = 'ready'
        and t.declined_reason is null
    )
    and exists (select 1 from thing_spots s where s.id = lots.spot_id and s.thing_id = lots.thing_id)
  );

drop policy if exists "продавец правит свой черновик" on lots;
create policy "продавец правит свой черновик" on lots for update
  using (
    status = 'draft'
    and exists (select 1 from things t where t.id = lots.thing_id and t.seller = auth.uid())
  )
  with check (
    status in ('draft', 'open')
    and exists (
      select 1 from things t
      where t.id = lots.thing_id and t.seller = auth.uid() and t.declined_reason is null
    )
    and exists (select 1 from thing_spots s where s.id = lots.spot_id and s.thing_id = lots.thing_id)
  );

-- 5. Функции админа и продавца анониму вызывать незачем. Внутри у них стоят
--    проверки is_admin() и auth.uid(), но «revoke from public» не снимал
--    отдельный грант Supabase для anon - снимаем явно. Рекорды старой игры
--    (submit_score) больше нигде не показываются и брали счёт на веру.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'admin\_%' or p.proname like 'seller\_%' or p.proname = 'submit_score')
  loop
    execute format('revoke execute on function %s from anon', f.sig);
  end loop;
end $$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'submit_score'
  loop
    execute format('revoke execute on function %s from public, authenticated', f.sig);
  end loop;
end $$;

-- 6. Старая схема маркетплейса (до 20.09.2026): таблицы и функции, которые
--    доверяли почте из JWT. Сайт их не читает. Данные не трогаем, закрываем
--    доступ из браузера целиком.
revoke all on sellers, listings, bookings, auctions, bids, access_list, reviews from anon, authenticated;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('has_access', 'owns_seller', 'my_last_bid', 'close_due_auctions')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
