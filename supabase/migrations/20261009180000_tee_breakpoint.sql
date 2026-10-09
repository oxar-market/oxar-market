-- Первая футболка едет не на Demo Day в Киеве, а на Breakpoint в Лондоне.
--
-- Demo Day перенесли, а футболку с логотипами победителей лид Superteam
-- Ukraine наденет на Breakpoint 2026 - 15-17 ноября, Olympia London.
-- Для тех, кто брал места, это повышение: площадка больше. Поэтому прежние
-- место и дату не стираем, а храним рядом - экран вещи показывает их
-- зачёркнутыми под новыми, с пометкой «Upgraded».
alter table things
  add column worn_where_was text check (worn_where_was is null or length(worn_where_was) <= 120),
  add column worn_when_was text check (worn_when_was is null or length(worn_when_was) <= 120);

update things
set worn_where_was = worn_where,
    worn_when_was = worn_when,
    worn_where = 'Breakpoint, London',
    worn_when = 'November 15-17'
where slug = 'superteam-ua-tee'
  and house
  and worn_where = 'Demo Day, Kyiv';
