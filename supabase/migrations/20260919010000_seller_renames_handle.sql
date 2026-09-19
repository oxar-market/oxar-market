-- Продавец меняет свой хэндл из кабинета.
--
-- Политика "seller sets own payout wallet" уже пускает продавца к своей
-- строке; грант добавляет колонку x_handle к списку того, что в этой строке
-- можно назвать в UPDATE. Уникальность решает существующий индекс
-- sellers_handle_unique (lower(x_handle)) - повтор вернёт 23505.
grant update (x_handle) on public.sellers to authenticated;

-- Смена хэндла снимает галочку. Чей это аккаунт X, мы проверяем руками, и
-- проверка привязана к имени: продавец, переименовавшийся в чужой хэндл, не
-- должен продавать чужой профиль под нашей галочкой. После переименования
-- места уходят из витрины (её политика пускает только verified) до повторной
-- проверки.
create or replace function public.sellers_unverify_on_rename()
  returns trigger
  language plpgsql
as $$
begin
  if new.x_handle is distinct from old.x_handle then
    new.verified := false;
  end if;
  return new;
end;
$$;

create trigger sellers_unverify_on_rename
  before update of x_handle on public.sellers
  for each row execute function public.sellers_unverify_on_rename();
