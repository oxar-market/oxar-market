-- Ван для перезапуска 26 октября: прежний - в архив, для торгов - свежий.
--
-- Ван 6e7bc59b передан продавцу и открыт в цепочке 23 октября с закрытием
-- 27-го, потом спрятан. Сдвинуть закрытие у открытого торга нельзя, а
-- повторная передача той же вещи завела бы на ней второй комплект из
-- одиннадцати лотов. Поэтому, как после прогона 23-го: прежний ван скрыт,
-- его лоты - репетиция (ставок на них нет), и заводится новый с теми же
-- местами и описанием. Цены и шаги - от команды 26 октября. Открытие -
-- сегодня в 16:00 UTC; его подставит форма передачи продавцу, закрытие
-- (пятница, 30 октября, 21:00 UTC) админ вводит там же. Два стикера,
-- купленные на прежнем ване, не переносятся: их оплатил сам организатор.
update things
set slug = 'the-van-oct23', title = 'The van (hidden Oct 23)', active = false, hidden = true
where id = '6e7bc59b-67b3-49bd-8b19-9c621f8998b6';

update lots set rehearsal = true where thing_id = '6e7bc59b-67b3-49bd-8b19-9c621f8998b6';

insert into things (
  id, slug, title, tagline, model_url, hologram_url, photos, stage, active, house, prepared,
  opens_at, worn_by, worn_where, worn_when, worn_about
)
select
  '2ca385c0-b2a2-474a-882c-d21af3278ea2', 'the-van', 'The van', tagline,
  model_url, hologram_url, '{}', 'ready', true, false, true,
  '2026-10-26 16:00:00+00', worn_by, worn_where, worn_when, worn_about
from things
where id = '6e7bc59b-67b3-49bd-8b19-9c621f8998b6'
on conflict (id) do nothing;

insert into thing_spots (thing_id, code, label, sort)
select '2ca385c0-b2a2-474a-882c-d21af3278ea2', code, label, sort
from thing_spots
where thing_id = '6e7bc59b-67b3-49bd-8b19-9c621f8998b6'
on conflict (thing_id, code) do nothing;

-- Старт и шаг ставки по каждому месту, в центах.
insert into spot_plans (spot_id, reserve_cents, step_cents)
select s.id, p.reserve_cents, p.step_cents
from thing_spots s
join (values
  ('van_hood', 60000, 5000),
  ('van_fender_r', 30000, 2500),
  ('van_fender_l', 30000, 2500),
  ('van_door_r', 40000, 2500),
  ('van_door_l', 40000, 2500),
  ('van_sliding', 75000, 5000),
  ('van_sliding_l', 75000, 5000),
  ('van_side_r', 75000, 5000),
  ('van_side_l', 75000, 5000),
  ('van_rear', 100000, 10000),
  ('van_roof', 150000, 10000)
) as p (code, reserve_cents, step_cents) on p.code = s.code
where s.thing_id = '2ca385c0-b2a2-474a-882c-d21af3278ea2'
on conflict (spot_id) do nothing;
