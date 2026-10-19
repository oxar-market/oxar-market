-- Стикеры на ване: пятьдесят штук по $100, без торга.
--
-- Деньги и лимит держит программа: лист стикеров в цепочке знает цену,
-- сколько всего и сколько продано, а покупка в одной транзакции отдаёт $90
-- продавцу и $10 площадке. Здесь - только то, что печатать: логотип,
-- название и размер.
--
-- Строка заводится до оплаты, и её id уходит в покупку тегом. Витрина
-- показывает строку, только если в цепочке есть покупка с этим тегом: без
-- оплаты строка - черновик, который никто не видит. Заводить строку раньше
-- оплаты - не прихоть: заведи её после, и подсмотревший покупку в цепочке
-- успел бы занять её тег своей строкой со своим логотипом.
--
-- sticker_sheet - id листа в цепочке; ставит только админ, как и permit_sale.
alter table things
  add column sticker_sheet uuid unique;

-- Продавец заводит вещь сам и мог бы родить её уже с листом стикеров.
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
    and exists (
      select 1 from profiles p where p.user_id = auth.uid() and p.is_seller
    )
  );

create table stickers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  thing_id uuid not null references things (id) on delete cascade,
  buyer uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 40),
  -- Сантиметры: квадрат 10 на 10 или полоса 12 на 6. Цена одна.
  size text not null check (size in ('10x10', '12x6')),
  logo_url text not null
);

alter table stickers enable row level security;

create policy "стикеры видны всем" on stickers for select using (true);

-- Правок и удаления нет: оплаченную строку не переписать задним числом.
create policy "покупатель заводит свой стикер" on stickers for insert
  with check (
    auth.uid() = buyer
    and exists (
      select 1 from things t where t.id = thing_id and t.sticker_sheet is not null
    )
  );
