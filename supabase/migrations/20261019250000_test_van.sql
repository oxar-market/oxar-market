-- Копия вана для прогона на маленьких деньгах.
--
-- Настоящий ван передаётся Баргеру завтра, и пробовать передачу на нём
-- нельзя: торг в цепочке открывается один раз и откатить его нечем. Копия -
-- та же модель, те же одиннадцать мест и тот же план цен, только по доллару и
-- без даты открытия: ставки идут сразу после публикации. До одобрения админом
-- её не видно на маркете (active = false), после прогона её прячут.
insert into things (
  id, slug, title, tagline, model_url, hologram_url, photos, stage, active, house, prepared,
  worn_by, worn_where, worn_when, worn_about
)
select
  '7e5a0c3e-9f4b-4d2a-8c1e-5b6f7a8d9e01', 'test-van', 'Test van', 'Rehearsal of the van auction on a dollar',
  model_url, hologram_url, '{}', 'ready', false, false, true,
  worn_by, worn_where, worn_when, worn_about
from things
where id = '1d7cc1ef-52a7-4070-b714-9d864e1e3ce6'
on conflict (id) do nothing;

insert into thing_spots (thing_id, code, label, sort)
select '7e5a0c3e-9f4b-4d2a-8c1e-5b6f7a8d9e01', code, label, sort
from thing_spots
where thing_id = '1d7cc1ef-52a7-4070-b714-9d864e1e3ce6'
on conflict (thing_id, code) do nothing;

insert into spot_plans (spot_id, reserve_cents, step_cents)
select id, 100, 100
from thing_spots
where thing_id = '7e5a0c3e-9f4b-4d2a-8c1e-5b6f7a8d9e01'
on conflict (spot_id) do nothing;
