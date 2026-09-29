-- Отзывы о продавце видны всем: что написали покупатели после сделки.
--
-- Оценки и так открыты (политика «оценки видны всем»), но по ним одним не
-- понять, чей это продавец: связь идёт через лот или заявку на аренду, а
-- заявки закрыты от чужих. Представление отдаёт ровно то, что нужно экрану
-- отзывов, - продавца, звёзды, текст, дату, вещь и место - и ничего о
-- покупателе.
create or replace view seller_reviews as
select t.seller, r.rating, r.stood, r.body, r.created_at, t.title as thing, s.label as spot
  from ratings r
  join lots l on l.id = r.lot_id
  join things t on t.id = l.thing_id
  join thing_spots s on s.id = l.spot_id
 where r.side = 'buyer' and t.seller is not null
union all
select t.seller, r.rating, r.stood, r.body, r.created_at, t.title, s.label
  from ratings r
  join rent_requests q on q.id = r.rent_request
  join thing_spots s on s.id = q.spot_id
  join things t on t.id = s.thing_id
 where r.side = 'buyer';

grant select on seller_reviews to anon, authenticated;

-- Снимок футболки: тот же кадр, что в фото-режиме маркета. Лежит в самом
-- приложении, а не в хранилище, - путь от корня. Нужен карточке оценки:
-- без него победитель оценивал вещь, которой не видно.
update things set photos = '{/things/local-event-tee.webp}'
 where slug = 'superteam-ua-tee' and photos = '{}';
