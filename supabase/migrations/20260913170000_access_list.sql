-- Список тех, кого пустили дальше вейтлиста.
--
-- До этого доступ значил «есть запись в sellers», и чтобы пустить покупателя,
-- пришлось бы заводить его продавцом без мест - то есть врать данным. Теперь
-- список отдельный: одна строка - один адрес входа. Добавить и убрать можно
-- из дашборда Supabase, руками, без миграции и без деплоя.
--
-- Продавцы по-прежнему проходят сами: у них адрес уже указан в их строке, и
-- дублировать его здесь незачем.

create table public.access_list (
  email text primary key check (position('@' in email) > 1),
  -- зачем пустили: через месяц «kira@…» сам по себе ничего не скажет
  note text check (note is null or length(note) <= 200),
  created_at timestamptz not null default now()
);

create unique index access_list_email_unique on public.access_list (lower(email));

comment on table public.access_list is
  'Адреса, которым открыты цены и сделки до открытия платформы';

alter table public.access_list enable row level security;

-- Политик нет намеренно: список не читает и не пишет никто из браузера. С ним
-- работают дашборд и функция ниже, которая видит таблицу как её владелец.
revoke all on public.access_list from anon, authenticated;

create or replace function public.has_access()
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1
    from public.sellers s
    where s.auth_email is not null
      and lower(s.auth_email) = lower(auth.jwt() ->> 'email')
  ) or exists (
    select 1
    from public.access_list a
    where lower(a.email) = lower(auth.jwt() ->> 'email')
  );
$$;
