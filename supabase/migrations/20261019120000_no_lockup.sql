-- Торг без пруфа: деньги продавцу сразу по закрытию, без окна проверки.
-- Программа принимает такой торг от любого продавца - режим пишется при
-- открытии, и сменить его потом нельзя. Кому его разрешить, решает админ
-- этим флагом: кабинет открывает торг без пруфа только у отмеченной вещи, а
-- одобрение сверяет режим торга в цепочке с флагом.
--
-- Ставит и снимает флаг только админ: правит вещи одна политика «админ
-- правит вещи» (is_admin()), у продавца update нет вовсе.
alter table things
  add column no_lockup boolean not null default false;

-- Остаётся вставка: продавец заводит вещь сам и мог бы родить её уже
-- отмеченной.
drop policy if exists "одобренный продавец заводит вещь" on things;
create policy "одобренный продавец заводит вещь" on things for insert
  with check (
    seller = auth.uid()
    and not active
    and not hidden
    and not house
    and not no_lockup
    and exists (
      select 1 from profiles p where p.user_id = auth.uid() and p.is_seller
    )
  );
