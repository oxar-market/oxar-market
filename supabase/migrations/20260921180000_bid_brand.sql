-- Чьё это лого.
--
-- Картинка без имени - картинка без хозяина: по кошельку понять, чей логотип
-- стоит на футболке, нельзя, а смысл торга в том, чтобы это было видно.
-- Поэтому имя обязательно, и обязательно оно здесь, а не только в форме:
-- ставку можно послать запросом мимо нашего экрана.
--
-- Тремя шагами, а не одним not null: на момент миграции ставок нет ни одной,
-- но сломать выкатку из-за ставки, пришедшей за минуту до неё, было бы глупо.
-- Прочерк в такой строке честнее отказа катить всё остальное.

alter table lot_bids add column brand text;

update lot_bids set brand = '-' where brand is null;

alter table lot_bids alter column brand set not null;

alter table lot_bids add constraint lot_bids_brand_length
  check (length(brand) between 1 and 40);
