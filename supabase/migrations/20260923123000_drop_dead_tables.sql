-- Похороны прежних продуктов: из базы уходят таблицы, на которые не смотрит
-- ни одна строка кода.
--
-- Снос кодовой базы 20 сентября снёс код, но не базу, и в ней остались лежать
-- три прошлые жизни: закрытый маркетплейс по списку своих (access_list),
-- аренда мест на профилях X (sellers, listings, placement_catalog, bookings,
-- reviews и вьюхи listing_busy, seller_rating) и первый заход на аукционы
-- (auctions, bids - вытеснены нынешними lots и lot_bids). Список таблиц в
-- дашборде читался как склад, и в нём терялось живое.
--
-- Все данные - наши тестовые прогоны тех эпох, суммарно 86 строк; перед
-- удалением они сняты в архив целиком. Ни внешнего ключа, ни запроса из кода
-- в эти таблицы нет - проверено перебором по репозиторию и по связям.
--
-- Порядок: сначала вьюхи, затем таблицы от зависимых к базовым - каждый drop
-- ложится на уже свободное, и cascade ничего не тащит втихую.

drop view if exists listing_busy;
drop view if exists seller_rating;

drop table if exists reviews;
drop table if exists bookings;
drop table if exists bids;
drop table if exists auctions;
drop table if exists listings;
drop table if exists placement_catalog;
drop table if exists sellers;
drop table if exists access_list;
