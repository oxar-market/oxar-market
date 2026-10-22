-- Прогон утра 20 октября на Test van кончился: с маркета и из истории.
-- Места - репетиция: результаты, победители и оценки их пропускают.
update lots set rehearsal = true where thing_id = '7e5a0c3e-9f4b-4d2a-8c1e-5b6f7a8d9e01';

update things set active = false, hidden = true
where id = '7e5a0c3e-9f4b-4d2a-8c1e-5b6f7a8d9e01';
