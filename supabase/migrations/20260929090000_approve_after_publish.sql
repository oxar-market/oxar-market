-- Вещь продавца попадает на маркет в конце, а не в начале: снял, назначил
-- цены и срок, открыл торг - и только после этого её одобряет админ.
--
-- Новая вещь теперь рождается скрытой (active = false), а экран не
-- показывает вещь продавца без открытого торга. Вещи, которые уже успели
-- стать видимыми, не открыв торга, прячутся здесь.
update things t
   set active = false
 where not t.house
   and t.seller is not null
   and not exists (select 1 from lots l where l.thing_id = t.id and l.status <> 'draft');
