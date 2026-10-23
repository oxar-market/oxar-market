-- Ван после прогона 23 октября: прогон - в архив, для торгов - свежий ван.
--
-- Прогон прошёл на ване b3a9e7c2: передан кошельку 8GHtC2, торг открыт и
-- закрыт в цепочке, куплен стикер за $1. Открытый торг не откатить, поэтому
-- тот ван - запись репетиции (скрыт, места - репетиция), а для торгов
-- заводится новый: та же модель, те же одиннадцать мест, цены от команды.
-- Шаг - десятая часть старта, как и прежде. Дату открытия ставит админ при
-- передаче продавцу.
update things
set slug = 'the-van-rehearsal-oct23', title = 'The van (rehearsal Oct 23)', active = false, hidden = true
where id = 'b3a9e7c2-4d1f-4e8a-9c5b-2f6d8a1e7c40';

update lots set rehearsal = true where thing_id = 'b3a9e7c2-4d1f-4e8a-9c5b-2f6d8a1e7c40';

insert into things (
  id, slug, title, tagline, model_url, hologram_url, photos, stage, active, house, prepared,
  worn_by, worn_where, worn_when, worn_about
)
select
  '6e7bc59b-67b3-49bd-8b19-9c621f8998b6', 'the-van', 'The van', tagline,
  model_url, hologram_url, '{}', 'ready', true, false, true,
  worn_by, worn_where, worn_when, worn_about
from things
where id = 'b3a9e7c2-4d1f-4e8a-9c5b-2f6d8a1e7c40'
on conflict (id) do nothing;

insert into thing_spots (thing_id, code, label, sort)
select '6e7bc59b-67b3-49bd-8b19-9c621f8998b6', code, label, sort
from thing_spots
where thing_id = 'b3a9e7c2-4d1f-4e8a-9c5b-2f6d8a1e7c40'
on conflict (thing_id, code) do nothing;

insert into spot_plans (spot_id, reserve_cents, step_cents)
select s.id, p.reserve_cents, p.reserve_cents / 10
from thing_spots s
join (values
  ('van_hood', 25000),
  ('van_fender_r', 25000),
  ('van_fender_l', 25000),
  ('van_door_r', 25000),
  ('van_door_l', 25000),
  ('van_sliding', 50000),
  ('van_sliding_l', 50000),
  ('van_side_r', 50000),
  ('van_side_l', 50000),
  ('van_rear', 50000),
  ('van_roof', 50000)
) as p (code, reserve_cents) on p.code = s.code
where s.thing_id = '6e7bc59b-67b3-49bd-8b19-9c621f8998b6'
on conflict (spot_id) do nothing;
