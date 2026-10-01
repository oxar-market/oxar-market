-- Кто носит вещь, где и когда. Покупатель места должен знать, что именно
-- покупает: не «футболку», а футболку на конкретном человеке в конкретный
-- день в конкретном месте. Это сказали на показе 1 октября 2026.
--
-- Текстом, а не датами: «конференция в Киеве, 12-14 ноября» не ложится в
-- одно поле даты, а читают это люди. Пусто - «будет объявлено».
alter table things
  add column worn_by text check (worn_by is null or length(worn_by) <= 120),
  add column worn_where text check (worn_where is null or length(worn_where) <= 120),
  add column worn_when text check (worn_when is null or length(worn_when) <= 120);

-- Что известно о первой футболке: носит один из лидов Superteam Ukraine.
-- Где и когда - допишем, когда будет известно.
update things
set worn_by = 'One of the Superteam Ukraine leads'
where slug = 'superteam-ua-tee';
