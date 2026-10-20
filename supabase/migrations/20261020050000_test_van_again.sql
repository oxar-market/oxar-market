-- Test van - снова в наборы, чистым: показать Баргеру прогон перед его
-- ваном. Только пока торг на нём не открывали: открытый не откатить.
delete from lots
where thing_id = '7e5a0c3e-9f4b-4d2a-8c1e-5b6f7a8d9e01'
  and status = 'draft'
  and not exists (
    select 1 from lots l
    where l.thing_id = '7e5a0c3e-9f4b-4d2a-8c1e-5b6f7a8d9e01' and l.status <> 'draft'
  );

update things
set seller = null, seller_wallet = null, opens_at = null, permit_sale = null, sticker_sheet = null,
    active = false, hidden = false, declined_reason = null
where id = '7e5a0c3e-9f4b-4d2a-8c1e-5b6f7a8d9e01'
  and not exists (
    select 1 from lots l
    where l.thing_id = '7e5a0c3e-9f4b-4d2a-8c1e-5b6f7a8d9e01' and l.status <> 'draft'
  );
