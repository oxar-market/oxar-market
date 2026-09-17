-- Чемодан, на котором можно нажать все кнопки.
--
-- Каталог мест сам по себе ничего не показывает: витрина ищет лоты, а лотов
-- без продавца и листингов не бывает. Пока их нет, окно чемодана честно пишет
-- «ничего не продаётся» - и проверить ни покупку, ни торги нельзя.
--
-- Продавец привязан к почте владельца намеренно. Онбординг у нас ручной, и
-- другого способа открыть кабинет продавца на живом проекте нет: без строки в
-- sellers вход даёт «вошли, но мест на этом аккаунте нет». С этой строкой тот
-- же вход открывает кабинет с пятью местами, где можно менять цены, запускать
-- торги и подключать кошелёк выплат.
--
-- Оплата разовым переводом, как у футболки. Поток отдаёт деньги за время,
-- которое размещение простояло, а простой наклейки на чемодане проверить
-- нечем: ни строки, ни картинки профиля, ни id поста. И печать - невозвратная
-- трата продавца до начала.
--
-- Всё со `on conflict do nothing`: миграция должна пережить повторный прогон,
-- и она же не должна затирать цены, если их уже поправили руками.

insert into public.sellers
  (x_handle, display_name, follower_count, bio, verified, is_org, auth_email)
values
  ('demo_case', 'Demo suitcase', 4200,
   'A carry-on that spends its life in airports.', true, false,
   'loga4evdaniil@gmail.com')
on conflict do nothing;

insert into public.listings (seller_id, kind, price_cents, term_days, active, payment)
select s.id, c.kind, c.price, 7, true, 'transfer'
from public.sellers s
cross join (values
  ('suitcase_panel',       24000),
  ('suitcase_upper_left',   9000),
  ('suitcase_upper_right',  9000),
  ('suitcase_lower_left',   7000),
  ('suitcase_lower_right',  7000)
) as c(kind, price)
where s.x_handle = 'demo_case'
on conflict do nothing;

-- Один открытый торг - на главной панели. Приём ставок трое суток, размещение
-- начинается ещё через двое: между концом торга и началом нужны сутки на
-- креатив, это проверяет сама таблица.
insert into public.auctions (listing_id, start_date, end_date, reserve_cents, closes_at)
select l.id,
       (now() + interval '5 days')::date,
       (now() + interval '12 days')::date,
       24000,
       now() + interval '3 days'
from public.listings l
join public.sellers s on s.id = l.seller_id
where s.x_handle = 'demo_case'
  and l.kind = 'suitcase_panel'
  and not exists (
    select 1 from public.auctions a where a.listing_id = l.id and a.status = 'open'
  );
