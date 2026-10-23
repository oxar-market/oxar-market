-- Ван от Burger: текст «What makes it special» - описание поездки на
-- шестьсот с лишним знаков, и лимит в 300 его обрезал. Лимит - тысяча, и в
-- таблице, и в функции, которой продавец его пишет.
alter table things drop constraint things_worn_about_check;
alter table things
  add constraint things_worn_about_check check (worn_about is null or length(worn_about) <= 1000);

create or replace function seller_describes_thing(thing uuid, worn_by text, worn_where text, worn_when text, worn_about text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  about text := nullif(trim(coalesce(worn_about, '')), '');
begin
  if length(trim(coalesce(worn_by, ''))) not between 1 and 120
     or length(trim(coalesce(worn_where, ''))) not between 1 and 120
     or length(trim(coalesce(worn_when, ''))) not between 1 and 120
     or length(coalesce(about, '')) > 1000 then
    return false;
  end if;
  if not exists (
    select 1 from things t where t.id = thing and t.seller = auth.uid() and not t.house
  ) then
    return false;
  end if;
  if exists (
    select 1 from things t
    where t.id = thing
      and t.worn_by = trim(seller_describes_thing.worn_by)
      and t.worn_where = trim(seller_describes_thing.worn_where)
      and t.worn_when = trim(seller_describes_thing.worn_when)
      and t.worn_about is not distinct from about
  ) then
    return true;
  end if;
  if exists (select 1 from lots l where l.thing_id = thing and l.status = 'open') then
    return false;
  end if;
  update things
  set worn_by = trim(seller_describes_thing.worn_by),
      worn_where = trim(seller_describes_thing.worn_where),
      worn_when = trim(seller_describes_thing.worn_when),
      worn_about = about
  where id = thing;
  return true;
end;
$$;


-- Цены нового вана - по списку команды: старт по панелям, шаг $250 у
-- капота, крыльев и дверей, $500 у остальных. Прежний план (старт $250 и
-- $500) был ошибкой: это были шаги. Только пока ван никому не передан: у
-- переданного цены уже в черновиках лотов.
do $$
declare
  van constant uuid := '6e7bc59b-67b3-49bd-8b19-9c621f8998b6';
begin
  if exists (select 1 from lots where thing_id = van) then
    return;
  end if;

  update spot_plans p
  set reserve_cents = v.reserve_cents, step_cents = v.step_cents
  from thing_spots s
  join (values
    ('van_hood', 150000, 25000),
    ('van_fender_r', 75000, 25000),
    ('van_fender_l', 75000, 25000),
    ('van_door_r', 100000, 25000),
    ('van_door_l', 100000, 25000),
    ('van_sliding', 200000, 50000),
    ('van_sliding_l', 200000, 50000),
    ('van_side_r', 200000, 50000),
    ('van_side_l', 200000, 50000),
    ('van_rear', 300000, 50000),
    ('van_roof', 400000, 50000)
  ) as v (code, reserve_cents, step_cents) on v.code = s.code
  where s.thing_id = van and p.spot_id = s.id;
end $$;
