-- Свежий ван для Баргера; прогон ночи на 20 октября - в архив.
--
-- Прогон по ошибке прошёл на настоящем ване: передан второму кошельку
-- Даниила, торг открыт и закрыт в цепочке, дата открытия перезаписана.
-- Открытый торг не откатить, поэтому тот ван становится записью репетиции
-- (скрыт, места - репетиция), а для Баргера заводится новый: та же модель,
-- те же одиннадцать мест и набор цен, открытие - среда, 21 октября, 16:00 UTC.
update things
set slug = 'the-van-rehearsal', title = 'The van (rehearsal)', active = false, hidden = true
where id = '1d7cc1ef-52a7-4070-b714-9d864e1e3ce6';

update lots set rehearsal = true where thing_id = '1d7cc1ef-52a7-4070-b714-9d864e1e3ce6';

insert into things (
  id, slug, title, tagline, model_url, hologram_url, photos, stage, active, house, prepared, opens_at,
  worn_by, worn_where, worn_when, worn_about
)
select
  'b3a9e7c2-4d1f-4e8a-9c5b-2f6d8a1e7c40', 'the-van', 'The van', tagline,
  model_url, hologram_url, '{}', 'ready', true, false, true, '2026-10-21 16:00:00+00',
  worn_by, worn_where, worn_when, worn_about
from things
where id = '1d7cc1ef-52a7-4070-b714-9d864e1e3ce6'
on conflict (id) do nothing;

insert into thing_spots (thing_id, code, label, sort)
select 'b3a9e7c2-4d1f-4e8a-9c5b-2f6d8a1e7c40', code, label, sort
from thing_spots
where thing_id = '1d7cc1ef-52a7-4070-b714-9d864e1e3ce6'
on conflict (thing_id, code) do nothing;

insert into spot_plans (spot_id, reserve_cents, step_cents)
select fresh.id, p.reserve_cents, p.step_cents
from thing_spots old
join spot_plans p on p.spot_id = old.id
join thing_spots fresh
  on fresh.code = old.code and fresh.thing_id = 'b3a9e7c2-4d1f-4e8a-9c5b-2f6d8a1e7c40'
where old.thing_id = '1d7cc1ef-52a7-4070-b714-9d864e1e3ce6'
on conflict (spot_id) do nothing;
