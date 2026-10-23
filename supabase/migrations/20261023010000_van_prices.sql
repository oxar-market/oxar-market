-- Цены вана от команды, 22 октября: старт по каждой панели. Шаг команда не
-- прислала - берём десятую часть старта; при передаче продавцу его можно
-- поправить в форме. Только пока ван никому не передан: у переданного цены
-- уже в черновиках лотов.
do $$
declare
  van constant uuid := 'b3a9e7c2-4d1f-4e8a-9c5b-2f6d8a1e7c40';
begin
  if exists (select 1 from lots where thing_id = van) then
    return;
  end if;

  insert into spot_plans (spot_id, reserve_cents, step_cents)
  select s.id, p.reserve_cents, p.reserve_cents / 10
  from thing_spots s
  join (values
    ('van_hood', 150000),
    ('van_fender_r', 75000),
    ('van_fender_l', 75000),
    ('van_door_r', 100000),
    ('van_door_l', 100000),
    ('van_sliding', 200000),
    ('van_sliding_l', 200000),
    ('van_side_r', 200000),
    ('van_side_l', 200000),
    ('van_rear', 300000),
    ('van_roof', 400000)
  ) as p (code, reserve_cents) on p.code = s.code
  where s.thing_id = van
  on conflict (spot_id) do update
    set reserve_cents = excluded.reserve_cents, step_cents = excluded.step_cents;
end $$;
