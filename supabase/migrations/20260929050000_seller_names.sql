-- Имя продавца на маркете: никнейм, который он задал себе сам, а без него -
-- кошелёк.
--
-- Никнейм - это profiles.handle: его человек и так правит сам (грант на
-- update только этой колонки). Но профили закрыты от чужих, поэтому имя
-- наружу отдаёт представление, и только у тех, кто что-то продаёт.
--
-- Кошелька продавца в базе не было: получатель выплаты живёт в торге в
-- цепочке. Вещь продавца видна на маркете сразу, ещё до торга, поэтому
-- кошелёк записывается в саму вещь при отправке. Это подпись, а не деньги:
-- платит программа тому, кто подписал открытие торга, что бы ни стояло здесь.
alter table things
  add column seller_wallet text
    check (seller_wallet is null or seller_wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$');

create or replace view seller_cards as
select s.seller,
       p.handle,
       (select t.seller_wallet from things t
         where t.seller = s.seller and t.seller_wallet is not null
         order by t.created_at desc limit 1) as wallet
  from (select distinct seller from things where seller is not null) s
  left join profiles p on p.user_id = s.seller;

grant select on seller_cards to anon, authenticated;
