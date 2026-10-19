-- Места на ване: одиннадцать панелей из списка Superteam Georgia. Разметка -
-- в коде (VAN в @oxar/stage), здесь строки мест: по их коду лоты находят
-- своё место на модели. Порядок - как в их списке цен.
insert into thing_spots (thing_id, code, label, sort)
values
  ('1d7cc1ef-52a7-4070-b714-9d864e1e3ce6', 'van_hood', 'Hood', 1),
  ('1d7cc1ef-52a7-4070-b714-9d864e1e3ce6', 'van_fender_r', 'R fender', 2),
  ('1d7cc1ef-52a7-4070-b714-9d864e1e3ce6', 'van_fender_l', 'L fender', 3),
  ('1d7cc1ef-52a7-4070-b714-9d864e1e3ce6', 'van_door_r', 'R door', 4),
  ('1d7cc1ef-52a7-4070-b714-9d864e1e3ce6', 'van_door_l', 'L door', 5),
  ('1d7cc1ef-52a7-4070-b714-9d864e1e3ce6', 'van_sliding', 'Sliding door', 6),
  ('1d7cc1ef-52a7-4070-b714-9d864e1e3ce6', 'van_side_r', 'Side panel passenger', 7),
  ('1d7cc1ef-52a7-4070-b714-9d864e1e3ce6', 'van_side_l', 'Side panel driver', 8),
  ('1d7cc1ef-52a7-4070-b714-9d864e1e3ce6', 'van_rear', 'Rear', 9),
  ('1d7cc1ef-52a7-4070-b714-9d864e1e3ce6', 'van_roof_front', 'Front roof', 10),
  ('1d7cc1ef-52a7-4070-b714-9d864e1e3ce6', 'van_roof', 'Roof', 11)
on conflict (thing_id, code) do nothing;
