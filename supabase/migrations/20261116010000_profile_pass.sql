-- Кабинет: пропуск охвата и профиль человека.
--
-- 1. Охват вещи - сколько людей увидели наши посты о её торге. Пока его вносим
--    мы (post_reach_checked_at пусто - это оценка); когда цифры начнёт
--    подтягивать функция из статистики постов, она же проставит время.
-- 2. Кошелёк человека. Рейтинг строится по кошелькам, а имя - у аккаунта.
--    Связь «кошелёк - аккаунт» заводит только функция входа по identity-токену
--    Privy, где кошелёк подтверждён подписью Privy. Из браузера сюда не
--    записать ничего: иначе любой подписался бы чужим кошельком в рейтинге.
-- 3. Публичный профиль: имя, бренд, X, аватар и логотип. Пишет только сам
--    человек и только свою строку, читают все. Имя занятое - занято: два
--    «Phantom» в рейтинге - это уже подделка.

alter table things
  add column post_reach integer check (post_reach is null or post_reach >= 0),
  add column post_reach_checked_at timestamptz;

-- Охват ставим только мы. Продавец заводит вещь сам и родил бы её с
-- охватом в миллион - а это раздуло бы пропуска её победителей.
drop policy if exists "одобренный продавец заводит вещь" on things;
create policy "одобренный продавец заводит вещь" on things for insert
  with check (
    seller = auth.uid()
    and not active
    and not hidden
    and not house
    and not prepared
    and permit_sale is null
    and sticker_sheet is null
    and post_reach is null
    and post_reach_checked_at is null
    and exists (
      select 1 from profiles p where p.user_id = auth.uid() and p.is_seller
    )
  );

-- Тестовые охваты, пока статистика постов не подключена: экран помечает их
-- как оценку.
update things set post_reach = 50000 where slug = 'the-van';
update things set post_reach = 18000 where slug = 'shirt-xx';
update things set post_reach = 6000 where slug = 'superteam-ua-tee';

create table wallet_owners (
  wallet text primary key check (wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index wallet_owners_by_user on wallet_owners (user_id);

-- Политик нет намеренно: ни читать, ни писать из браузера. Функция входа
-- работает под service_role, который RLS обходит.
alter table wallet_owners enable row level security;

-- Имя в рейтинге стоит на месте кошелька, поэтому оно не может выглядеть
-- кошельком - ни целым адресом, ни коротким видом «7MvL..8LgV», - и не может
-- прятать невидимые знаки: «Ali​ce» с пробелом нулевой ширины выглядит как
-- «Alice». Занятость имени - после нормализации NFKC без учёта регистра:
-- широкая «Ａlice» - та же «Alice».
create table public_profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text check (
    display_name is null or (
      display_name = btrim(display_name)
      and length(display_name) between 1 and 40
      and display_name !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
      and display_name !~ '^[1-9A-HJ-NP-Za-km-z]{2,8}(\.{2,3}|…)[1-9A-HJ-NP-Za-km-z]{2,8}$'
      and display_name !~ '[[:cntrl:]\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]'
    )
  ),
  brand text check (
    brand is null or (
      brand = btrim(brand)
      and length(brand) between 1 and 40
      and brand !~ '[[:cntrl:]\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]'
    )
  ),
  x_handle text check (x_handle is null or x_handle ~ '^[A-Za-z0-9_]{1,15}$'),
  -- Пути в bucket faces, и только в своей папке.
  avatar_path text check (avatar_path is null or avatar_path like user_id::text || '/%'),
  logo_path text check (logo_path is null or logo_path like user_id::text || '/%'),
  updated_at timestamptz not null default now()
);

create unique index public_profiles_name_once on public_profiles (lower(normalize(display_name, NFKC))) where display_name is not null;

alter table public_profiles enable row level security;

create policy "профили видны всем" on public_profiles for select to anon, authenticated using (true);

create policy "свой профиль заводит сам" on public_profiles for insert to authenticated
  with check (user_id = auth.uid());

create policy "свой профиль правит сам" on public_profiles for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "свой профиль удаляет сам" on public_profiles for delete to authenticated
  using (user_id = auth.uid());

-- Лицо кошелька для рейтинга: кошелёк и то, что человек сам решил показать.
-- Владелец вида - postgres, поэтому wallet_owners читается в обход RLS, но
-- наружу уходят только публичные поля профиля.
create view wallet_faces as
  select w.wallet, p.display_name, p.brand, p.x_handle, p.avatar_path, p.logo_path
  from wallet_owners w
  join public_profiles p on p.user_id = w.user_id;

grant select on wallet_faces to anon, authenticated;

-- Аватары и логотипы: картинки до 2 МБ, каждый - только в свою папку.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('faces', 'faces', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "лица видны всем" on storage.objects for select to anon, authenticated
  using (bucket_id = 'faces');

create policy "своё лицо кладёт сам" on storage.objects for insert to authenticated
  with check (bucket_id = 'faces' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "своё лицо меняет сам" on storage.objects for update to authenticated
  using (bucket_id = 'faces' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'faces' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "своё лицо удаляет сам" on storage.objects for delete to authenticated
  using (bucket_id = 'faces' and (storage.foldername(name))[1] = auth.uid()::text);
