-- Ван теперь Mercedes V-Class: места - по его панелям, одиннадцать, как
-- прислала команда. Скат крыши уходит, вместо него - левая сдвижная дверь;
-- боковые панели - задние крылья с обеих сторон. Разметка на модели - в коде
-- (VAN в @oxar/stage), здесь коды, подписи и порядок. Только пока ван никому
-- не передан: у переданного места уже в черновиках.
do $$
declare
  van constant uuid := 'b3a9e7c2-4d1f-4e8a-9c5b-2f6d8a1e7c40';
begin
  if exists (select 1 from lots where thing_id = van) then
    return;
  end if;

  delete from thing_spots where thing_id = van and code = 'van_roof_front';

  insert into thing_spots (thing_id, code, label, sort)
  values (van, 'van_sliding_l', 'L sliding door', 7)
  on conflict (thing_id, code) do nothing;

  update thing_spots s
  set label = v.label, sort = v.sort
  from (values
    ('van_hood', 'Hood', 1),
    ('van_fender_r', 'R fender', 2),
    ('van_fender_l', 'L fender', 3),
    ('van_door_r', 'R door', 4),
    ('van_door_l', 'L door', 5),
    ('van_sliding', 'R sliding door', 6),
    ('van_sliding_l', 'L sliding door', 7),
    ('van_side_r', 'R side panel', 8),
    ('van_side_l', 'L side panel', 9),
    ('van_rear', 'Rear', 10),
    ('van_roof', 'Roof', 11)
  ) as v (code, label, sort)
  where s.thing_id = van and s.code = v.code;

  -- Цену левой сдвижной двери до прайса команды берём у правой.
  insert into spot_plans (spot_id, reserve_cents, step_cents)
  select l.id, p.reserve_cents, p.step_cents
  from thing_spots l
  join thing_spots r on r.thing_id = van and r.code = 'van_sliding'
  join spot_plans p on p.spot_id = r.id
  where l.thing_id = van and l.code = 'van_sliding_l'
  on conflict (spot_id) do nothing;
end $$;
