-- Продавец удаляет свою вещь, пока торг на неё не открыт.
--
-- До публикации вещь - только строки в базе: снимки, места, черновики цен.
-- Удалить её и снять заново - честный способ исправить ошибку в снимках или
-- разметке. После публикации торг живёт в цепочке, и строки вещи держат
-- ставки и выплаты: удалить её уже нельзя, это и проверяется здесь.
create or replace function seller_deletes_thing(thing uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from things t where t.id = thing and t.seller = auth.uid() and not t.house
  ) then
    return false;
  end if;
  if exists (select 1 from lots l where l.thing_id = thing and l.status <> 'draft') then
    raise exception 'the auction is already published';
  end if;

  delete from lots where thing_id = thing;
  delete from things where id = thing;
  return true;
end;
$$;

revoke all on function seller_deletes_thing(uuid) from public;
grant execute on function seller_deletes_thing(uuid) to authenticated;
