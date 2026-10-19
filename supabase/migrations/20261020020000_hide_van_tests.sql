-- Прогон ночи на 20 октября кончился: тестовые ваны прячем с маркета и из
-- истории. Тестовые - подготовленные вещи, выданные второму кошельку
-- Даниила (6Wt9…), и отклонённые подготовленные; настоящий ван не трогаем.
-- Места помечаем репетицией: результаты, победители и оценки их пропускают.
-- Бот выплат на эти флаги не смотрит, недоплаченное он доплатит.
with tests as (
  select id from things
  where prepared
    and id <> '1d7cc1ef-52a7-4070-b714-9d864e1e3ce6'
    and (seller_wallet = '6Wt9ZKcXVZg9wN7VRwXQ5gUCJdBHveQBSX4Q42d1yDMw' or declined_reason is not null)
)
update lots set rehearsal = true where thing_id in (select id from tests);

update things
set active = false, hidden = true
where prepared
  and id <> '1d7cc1ef-52a7-4070-b714-9d864e1e3ce6'
  and (seller_wallet = '6Wt9ZKcXVZg9wN7VRwXQ5gUCJdBHveQBSX4Q42d1yDMw' or declined_reason is not null);
