-- Заявка описывает место, а не аккаунт в X.
--
-- Хэндл был основным полем формы, потому что мы начинали с одной площадки. Но
-- продаётся поверхность, а не твиттер: у человека может быть ютуб, подкаст,
-- телеграм-канал или стена в кофейне. Пусть пишет словами, что и где сдаёт, -
-- разбираем мы это всё равно руками.
--
-- Старые заявки с хэндлами остаются как есть: колонка живёт, просто перестаёт
-- быть обязательной, и уникальность по ней больше не нужна.

alter table public.waitlist add column pitch text
  check (pitch is null or length(pitch) between 3 and 500);

comment on column public.waitlist.pitch is
  'Что и на какой площадке человек продаёт или ищет, своими словами';

alter table public.waitlist alter column x_handle drop not null;

-- Уникальность по хэндлу теряет смысл, когда хэндла может не быть вовсе.
drop index if exists public.waitlist_handle_unique;

-- Контакт теперь обязателен: без него заявку некуда вернуть. Правило стоит с
-- not valid - в таблице есть заявка, поданная до этого требования, и терять её
-- ради ровной схемы незачем. Новые строки проверяются полностью.
alter table public.waitlist
  add constraint waitlist_contact_present check (contact is not null) not valid;
