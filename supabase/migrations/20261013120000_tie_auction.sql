-- Торг на галстук Simon: одно место на весь галстук.
--
-- Simon (x.com/simonmolitor) наденет галстук в прямом эфире Solana Ecosystem
-- Call 29 октября - это и есть пруф. Один спонсор берёт весь галстук: его
-- логотип идёт узором по полотну, как значки Solana на нынешнем галстуке
-- Simon. Поэтому место одно, а разметка его - в коде (TIE в @oxar/stage):
-- узор не задаётся высотой и углом, как места продавцов.
--
-- Лот откроет скрипт open-lot.ts по коду места; здесь только строка места и
-- то, что покупатель должен знать до ставки.
insert into thing_spots (thing_id, code, label, sort)
select id, 'tie_pattern', 'Whole tie', 1
  from things
 where slug = 'shirt-xx'
   and house
on conflict (thing_id, code) do nothing;

update things
set tagline = 'One sponsor gets the whole tie.',
    worn_by = 'Simon (@simonmolitor)',
    worn_where = 'Solana Ecosystem Call, live',
    worn_when = 'October 29'
where slug = 'shirt-xx'
  and house;
