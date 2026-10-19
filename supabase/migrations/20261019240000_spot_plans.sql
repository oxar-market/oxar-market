-- Плановые цены мест подготовленной вещи.
--
-- Цены вещи известны заранее, а продавец - нет: у вана места и цены по
-- списку Superteam Georgia есть, а войти своим кошельком Баргер ещё не успел.
-- Чтобы в день передачи не набирать одиннадцать цен руками, план лежит здесь,
-- а админка при передаче вещи продавцу заводит из него черновики лотов.
--
-- Видит и правит план только админ: до публикации цены публике не видны, как
-- и сами черновики.
create table spot_plans (
  spot_id uuid primary key references thing_spots (id) on delete cascade,
  reserve_cents integer not null check (reserve_cents > 0),
  step_cents integer not null check (step_cents > 0)
);

alter table spot_plans enable row level security;

create policy "админ ведёт планы цен" on spot_plans for all
  using (is_admin()) with check (is_admin());

-- Ван: старт и шаг каждой панели, в центах.
insert into spot_plans (spot_id, reserve_cents, step_cents)
select s.id, p.reserve_cents, p.step_cents
from thing_spots s
join (values
  ('van_hood', 200000, 25000),
  ('van_fender_r', 200000, 25000),
  ('van_fender_l', 200000, 25000),
  ('van_door_r', 200000, 25000),
  ('van_door_l', 200000, 25000),
  ('van_sliding', 300000, 50000),
  ('van_side_r', 300000, 50000),
  ('van_side_l', 500000, 50000),
  ('van_rear', 400000, 50000),
  ('van_roof_front', 200000, 25000),
  ('van_roof', 200000, 25000)
) as p (code, reserve_cents, step_cents) on p.code = s.code
where s.thing_id = '1d7cc1ef-52a7-4070-b714-9d864e1e3ce6'
on conflict (spot_id) do nothing;
