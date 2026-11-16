-- Имя в рейтинге: строже к подделкам.
--
-- 1. Имя хранится только в виде NFKC. Иначе «７ＭｖＬ．．８ＬｇＶ» широкими знаками
--    выглядело бы коротким кошельком, а правило кошелька его бы не узнало:
--    оно видит обычные знаки. Экран и так приводит имя к NFKC перед записью.
-- 2. Невидимые знаки - не только нулевой ширины. Пустые знаки хангыля,
--    пустая клетка Брайля, селекторы вариантов, теги - всё это рисуется
--    пустотой и прячет разницу между похожими именами. Postgres не знает
--    свойства Default_Ignorable_Code_Point, поэтому список - явный, по нему.
--
-- Остаётся риск похожих букв из других алфавитов («Аlice» с кириллической
-- «А»). Против него в рейтинге рядом с именем всегда стоит короткий кошелёк:
-- имя выбирает человек, кошелёк - нет.

alter table public_profiles drop constraint public_profiles_display_name_check;
alter table public_profiles drop constraint public_profiles_brand_check;

alter table public_profiles add constraint public_profiles_display_name_check check (
  display_name is null or (
    display_name = normalize(display_name, NFKC)
    and display_name = btrim(display_name)
    and length(display_name) between 1 and 40
    and display_name !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
    and display_name !~ '^[1-9A-HJ-NP-Za-km-z]{2,8}(\.{2,3}|…)[1-9A-HJ-NP-Za-km-z]{2,8}$'
    and display_name !~ '[[:cntrl:]­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯⠀ㅤ︀-️﻿ﾠ￰-￸\U0001BCA0-\U0001BCA3\U0001D173-\U0001D17A\U000E0000-\U000E0FFF]'
  )
);

alter table public_profiles add constraint public_profiles_brand_check check (
  brand is null or (
    brand = btrim(brand)
    and length(brand) between 1 and 40
    and brand !~ '[[:cntrl:]­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯⠀ㅤ︀-️﻿ﾠ￰-￸\U0001BCA0-\U0001BCA3\U0001D173-\U0001D17A\U000E0000-\U000E0FFF]'
  )
);
