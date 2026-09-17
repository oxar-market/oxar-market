-- Ставки снова читаются, а ставящий не вводит себя дважды.
--
-- Первое - починка. В auction_access права на таблицу были отозваны целиком и
-- возвращена только вставка, а политика чтения осталась. Политика без права
-- ничего не даёт: запрос падает на `permission denied for table bids`, клиент
-- молча получает пустой массив, и в торгах всегда «no bids yet». То есть
-- участник не видит, что перебивает.
--
-- Возвращаем право по колонкам, а не целиком: с тех пор в таблице появился
-- `bidder_email`, и раздавать его всем, кого пустили, незачем. Контакт и
-- креатив по-прежнему видит только продавец лота, через bids_for_my_auction.
grant select (id, created_at, auction_id, bidder_handle, amount_cents)
  on public.bids to authenticated;

-- Второе - удобство, которое решает, будут ли вообще ставить. На футболке
-- одиннадцать зон, и один участник ставит на несколько подряд. Заставлять его
-- каждый раз вводить хэндл и грузить логотип - причина закрыть вкладку.
--
-- Отдельная функция, а не запрос с фильтром: фильтровать по `bidder_email`
-- клиент не может, права на эту колонку у него нет и не будет.
create function public.my_last_bid()
  returns table (bidder_handle text, creative_url text)
  language sql
  stable
  security definer
  set search_path = public
as $$
  select b.bidder_handle, b.creative_url
  from public.bids b
  where b.bidder_email is not null
    and lower(b.bidder_email) = lower(auth.jwt() ->> 'email')
  order by b.created_at desc
  limit 1;
$$;

comment on function public.my_last_bid is
  'Чем этот человек ставил в прошлый раз: хэндл и логотип для подстановки';

revoke execute on function public.my_last_bid() from public, anon;
grant execute on function public.my_last_bid() to authenticated;
