-- Место можно удалить, пока на нём ничего не висело.
--
-- До этого место только снималось с продажи, и комментарий к `setActive`
-- объяснял почему: на месте висят прошлые сделки, а удаление сделало бы их
-- сиротами. Для места, по которому сделок не было вовсе, это рассуждение не
-- работает - удалять там нечего, кроме самой строки.

-- Была ли у места хоть одна сделка или торг.
--
-- security definer по той же причине, что у owns_seller: подзапрос внутри
-- политики выполняется правами вызывающего и под его RLS. Продавец видит
-- только свои брони и свои лоты, поэтому «я ничего не вижу» означало бы для
-- него «сделок не было» - и удаление уходило бы в ошибку внешнего ключа
-- вместо честного отказа.
create function public.spot_is_untouched(spot uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select not exists (select 1 from public.bookings where listing_id = spot)
     and not exists (select 1 from public.auctions where listing_id = spot);
$$;

comment on function public.spot_is_untouched(uuid) is
  'Ни одной брони и ни одного лота: такое место можно удалить, а не только снять';

revoke execute on function public.spot_is_untouched(uuid) from public, anon;
grant execute on function public.spot_is_untouched(uuid) to authenticated;

-- Внешние ключи у броней и лотов объявлены как `on delete restrict`, то есть
-- база и так не даст удалить занятое место. Политика отвечает раньше и
-- понятнее: строки просто нет среди доступных к удалению.
create policy "seller deletes a spot nobody booked"
  on public.listings for delete to authenticated
  using (public.owns_seller(seller_id) and public.spot_is_untouched(id));

-- Право на само действие. Политика решает, к какой строке пускать, а грант -
-- разрешено ли удаление в принципе.
grant delete on public.listings to authenticated;
