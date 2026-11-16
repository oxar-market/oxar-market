-- Невидимые знаки в имени и бренде: вернуть [[:cntrl:]] и добавить
-- разделители строки и абзаца.
--
-- Прошлая миграция заменила [[:cntrl:]] явным списком. Что ловит [[:cntrl:]],
-- зависит от локали базы, и на проде он мог ловить больше списка - например,
-- U+2028/2029. Теперь он снова стоит рядом со списком: лишним он быть не
-- может. А U+2028/2029 добавлены и в правило экрана (core, INVISIBLE), чтобы
-- списки совпадали; тест core сверяет класс ниже с правилом экрана.

alter table public_profiles drop constraint public_profiles_display_name_check;
alter table public_profiles drop constraint public_profiles_brand_check;

alter table public_profiles add constraint public_profiles_display_name_check check (
  display_name is null or (
    display_name = normalize(display_name, NFKC)
    and display_name = btrim(display_name)
    and length(display_name) between 1 and 40
    and display_name !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
    and display_name !~ '^[1-9A-HJ-NP-Za-km-z]{2,8}(\.{2,3}|…)[1-9A-HJ-NP-Za-km-z]{2,8}$'
    and display_name !~ '[[:cntrl:]\u0001-\u001F\u007F-\u009F\u00AD\u034F\u0600-\u0605\u061C\u06DD\u070F\u0890-\u0891\u08E2\u115F-\u1160\u17B4-\u17B5\u180B-\u180F\u200B-\u200F\u2028-\u202E\u2060-\u206F\u2800\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF0-\uFFFB\U000110BD\U000110CD\U00013430-\U0001343F\U0001BCA0-\U0001BCA3\U0001D173-\U0001D17A\U000E0000-\U000E0FFF]'
  )
);

alter table public_profiles add constraint public_profiles_brand_check check (
  brand is null or (
    brand = btrim(brand)
    and length(brand) between 1 and 40
    and brand !~ '[[:cntrl:]\u0001-\u001F\u007F-\u009F\u00AD\u034F\u0600-\u0605\u061C\u06DD\u070F\u0890-\u0891\u08E2\u115F-\u1160\u17B4-\u17B5\u180B-\u180F\u200B-\u200F\u2028-\u202E\u2060-\u206F\u2800\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF0-\uFFFB\U000110BD\U000110CD\U00013430-\U0001343F\U0001BCA0-\U0001BCA3\U0001D173-\U0001D17A\U000E0000-\U000E0FFF]'
  )
);
