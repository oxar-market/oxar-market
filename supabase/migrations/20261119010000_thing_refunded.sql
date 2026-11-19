-- Торг закрылся, но деньги победителям вернули мимо программы: так вышло с
-- фургоном - поездка не состоялась, организатор вернул ставки сам 30-31
-- октября (переводы видны в цепочке). По лотам этого не видно: в программе
-- они выплачены продавцу. Отметка на вещи - чтобы история торга говорила
-- «Refunded», а не вечно ждала пруф.

alter table things add column refunded_at timestamptz;

-- Ставим только мы: продавец, отметивший свою вещь «возвращено», спрятал бы
-- от покупателей, что пруфа так и не было.
drop policy if exists "одобренный продавец заводит вещь" on things;
create policy "одобренный продавец заводит вещь" on things for insert
  with check (
    seller = auth.uid()
    and not active
    and not hidden
    and not house
    and not prepared
    and permit_sale is null
    and sticker_sheet is null
    and post_reach is null
    and post_reach_checked_at is null
    and refunded_at is null
    and exists (
      select 1 from profiles p where p.user_id = auth.uid() and p.is_seller
    )
  );

update things set refunded_at = '2026-10-31T20:19:00Z' where slug = 'the-van';
