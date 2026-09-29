-- Название вещи даёт продавец, а не админ.
--
-- При отправке он вписывает его сам (в строку вещи, это его insert). Потом
-- поправить может, пока торг не открыт: после публикации название уже
-- стоит на маркете и в чужих ставках, и меняется только админом.
create or replace function seller_renames_thing(thing uuid, name text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if name is null or length(trim(name)) not between 1 and 60 then
    return false;
  end if;
  if not exists (
    select 1 from things t where t.id = thing and t.seller = auth.uid() and not t.house
  ) then
    return false;
  end if;
  if exists (select 1 from lots l where l.thing_id = thing and l.status <> 'draft') then
    return false;
  end if;
  update things set title = trim(name) where id = thing;
  return true;
end;
$$;

revoke all on function seller_renames_thing(uuid, text) from public;
grant execute on function seller_renames_thing(uuid, text) to authenticated;
