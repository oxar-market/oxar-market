-- Delora - ноутбук, а не чемоданы.
--
-- Наклейки уехали на крышку ноутбука, его и сняли на TOKEN2049. На
-- странице итогов вещь теперь - модель ноутбука, а места - его места: три
-- квадрата сверху и две полосы снизу, как на фото. Бренд остаётся на той
-- наклейке, где он на фото.
--
-- Логотипы - свой набор, delora-laptop: на чемодане наклейки шли вкось, и
-- картинки вырезаны с наклоном, а на крышке они стоят ровно, край к краю.

update things
   set model_url = '/models/laptop.glb'
 where slug = 'delora-suitcases';

update placements p
   set code = s.code, label = s.label, sort = s.sort,
       media_url = '/cases/delora-laptop/' || lower(s.brand) || '.webp'
  from things t,
       (values
         ('Delora',  'laptop_top_left',     'Top left',     1),
         ('Solwear', 'laptop_top_center',   'Top center',   2),
         ('OXAR',    'laptop_top_right',    'Top right',    3),
         ('Nomadz',  'laptop_bottom_left',  'Bottom left',  4),
         ('Echoes',  'laptop_bottom_right', 'Bottom right', 5)
       ) as s (brand, code, label, sort)
 where t.slug = 'delora-suitcases'
   and p.thing_id = t.id
   and p.brand = s.brand;
