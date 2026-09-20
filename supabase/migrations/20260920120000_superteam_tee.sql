-- Первая вещь: футболка Superteam Ukraine и её места под нанесение.
--
-- Каталог, а не демо-данные. Вещь и её места - это то, что продаётся, и они
-- обязаны быть на проде; сид из supabase/seed прогон не катит, туда уезжают
-- только миграции. Торг (строка в lots) здесь не заводится намеренно: у него
-- есть срок и резервная цена, и назначаются они под конкретное событие, а не
-- моментом, когда прогон накатил миграцию.
--
-- Коды мест повторяют разметку модели в коде (apps/app/app/auction/spots.ts).
-- Геометрии здесь нет: высота и азимут сняты лучами по самой модели и меняются
-- только вместе с ней. Совпадение кодов проверяется тестом - без него две
-- половины разъехались бы молча, и место без пары просто не нашлось бы на вещи.

insert into things (slug, title, tagline, model_url)
values (
  'superteam-ua-tee',
  'Local Event Tee',
  'Superteam Ukraine',
  '/models/shirt.glb'
)
on conflict (slug) do nothing;

insert into thing_spots (thing_id, code, label, sort)
select things.id, spot.code, spot.label, spot.sort
from things,
  (values
    ('tshirt_chest',        'Chest',       1),
    ('tshirt_stomach',      'Stomach',     2),
    ('tshirt_hem_front',    'Front hem',   3),
    ('tshirt_sleeve_left',  'Left sleeve', 4),
    ('tshirt_sleeve_right', 'Right sleeve', 5),
    ('tshirt_back',         'Back',        6),
    ('tshirt_lower_back',   'Lower back',  7),
    ('tshirt_hem_back',     'Back hem',    8),
    ('tshirt_nape',         'Nape',        9)
  ) as spot (code, label, sort)
where things.slug = 'superteam-ua-tee'
on conflict (thing_id, code) do nothing;
