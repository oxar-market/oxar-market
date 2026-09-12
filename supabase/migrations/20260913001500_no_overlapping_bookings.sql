-- Одно место нельзя продать двум покупателям на одни дни.
--
-- До этого пересечение держалось только на интерфейсе: календарь не давал
-- выбрать занятые дни. Но календарь читает занятость на момент открытия, а
-- одобряет заявки продавец позже и по одной. Две заявки на одни даты, обе
-- одобренные, ложились в базу без возражений.
--
-- Заявки (requested) не мешают друг другу: пока продавец не согласился, дата
-- свободна для всех. Отказ и отмена тоже ничего не держат. Список статусов
-- тот же, что в listing_busy, иначе календарь и база разошлись бы в том, что
-- считать занятым.

create extension if not exists btree_gist;

alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    listing_id with =,
    daterange(start_date, end_date, '[]') with &&
  )
  where (status in ('approved', 'running', 'completed'));

comment on constraint bookings_no_overlap on public.bookings is
  'Одобренные брони одного места не пересекаются по дням';
