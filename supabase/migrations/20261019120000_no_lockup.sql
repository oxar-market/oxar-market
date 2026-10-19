-- Подготовленный аукцион и торг без пруфа.
--
-- Подготовленный аукцион: вещь, её места и черновики цен заводит админ - для
-- конкретного продавца. Продавец входит своим кошельком, проверяет и
-- публикует сам: его подпись открывает торг, он платит залог за аккаунты, и
-- выплата уходит ему. Дальше - обычное одобрение админом перед маркетом.
--
-- Торг без пруфа: деньги продавцу сразу по закрытию, без окна проверки.
-- Программа откроет такой торг только по разрешению админа, выданному в
-- цепочке на конкретный торг конкретному продавцу. permit_sale - id этого
-- торга: с ним кабинет и открывает торг. Пусто - торг обычный, с пруфом.
--
-- Оба поля ставит только админ: правит вещи одна политика «админ правит
-- вещи» (is_admin()), у продавца update нет вовсе.
alter table things
  add column prepared boolean not null default false,
  add column permit_sale uuid unique;

-- Продавец заводит вещь сам и мог бы родить её уже подготовленной или с
-- чужим разрешением.
drop policy if exists "одобренный продавец заводит вещь" on things;
create policy "одобренный продавец заводит вещь" on things for insert
  with check (
    seller = auth.uid()
    and not active
    and not hidden
    and not house
    and not prepared
    and permit_sale is null
    and exists (
      select 1 from profiles p where p.user_id = auth.uid() and p.is_seller
    )
  );

-- Админ заводит вещь, места и черновики цен за продавца.
create policy "админ заводит вещь" on things for insert
  with check (is_admin());

create policy "админ заводит места" on thing_spots for insert
  with check (is_admin());

-- Место убирается, только пока на нём не было торга.
create policy "админ убирает места" on thing_spots for delete
  using (
    is_admin()
    and not exists (select 1 from lots l where l.spot_id = thing_spots.id and l.status <> 'draft')
  );

-- Черновики админу раньше были не видны: их заводил только продавец.
create policy "админ видит все лоты" on lots for select
  using (is_admin());

create policy "админ заводит черновик лота" on lots for insert
  with check (is_admin() and status = 'draft');

create policy "админ правит черновик лота" on lots for update
  using (is_admin() and status = 'draft')
  with check (is_admin() and status = 'draft');

create policy "админ убирает черновик лота" on lots for delete
  using (is_admin() and status = 'draft');
