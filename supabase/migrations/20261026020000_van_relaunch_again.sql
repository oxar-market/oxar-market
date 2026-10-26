-- Ван для торга 26 октября - заново.
--
-- Ван 2ca385c0-b2a2-474a-882c-d21af3278ea2 из утренней миграции уже прошёл тестовый торг (13:29-13:40 UTC),
-- переименован в «Breakpoint Roadtrip» и скрыт. Закрытый торг второй раз не
-- открыть, поэтому - как и прежде: тест в архив, его лоты - репетиция, и
-- новый ван с теми же местами. Название и «кто, где, когда» - с тестового:
-- их поправили там. Цены и шаги - по таблице команды. Открытие - сегодня в
-- 16:00 UTC; его подставит форма передачи продавцу.
update things
set slug = 'the-van-oct26-test', active = false, hidden = true
where id = '2ca385c0-b2a2-474a-882c-d21af3278ea2';

update lots set rehearsal = true where thing_id = '2ca385c0-b2a2-474a-882c-d21af3278ea2';

insert into things (
  id, slug, title, tagline, model_url, hologram_url, photos, stage, active, house, prepared,
  opens_at, worn_by, worn_where, worn_when, worn_about
)
select
  '043a25be-8214-43d3-bca1-b5bd740d784c', 'the-van', title, tagline,
  model_url, hologram_url, '{}', 'ready', true, false, true,
  '2026-10-26 16:00:00+00', worn_by, worn_where, worn_when, worn_about
from things
where id = '2ca385c0-b2a2-474a-882c-d21af3278ea2'
on conflict (id) do nothing;

insert into thing_spots (thing_id, code, label, sort)
select '043a25be-8214-43d3-bca1-b5bd740d784c', code, label, sort
from thing_spots
where thing_id = '2ca385c0-b2a2-474a-882c-d21af3278ea2'
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
where s.thing_id = '043a25be-8214-43d3-bca1-b5bd740d784c'
on conflict (spot_id) do nothing;
