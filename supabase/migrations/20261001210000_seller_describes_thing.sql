-- Продавец сам пишет, кто носит вещь, где и когда. Без этого покупатель не
-- знает, что покупает, - поэтому кабинет не даёт опубликовать торг с пустыми
-- полями, а база не даёт их менять, пока торг открыт: ставки делали под
-- те слова, что стояли на момент ставки. Те же слова повторно - не правка:
-- так публикация, открывшая часть мест и упавшая, проходит со второго раза.
create or replace function seller_describes_thing(thing uuid, worn_by text, worn_where text, worn_when text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(trim(coalesce(worn_by, ''))) not between 1 and 120
     or length(trim(coalesce(worn_where, ''))) not between 1 and 120
     or length(trim(coalesce(worn_when, ''))) not between 1 and 120 then
    return false;
  end if;
  if not exists (
    select 1 from things t where t.id = thing and t.seller = auth.uid() and not t.house
  ) then
    return false;
  end if;
  if exists (
    select 1 from things t
    where t.id = thing
      and t.worn_by = trim(seller_describes_thing.worn_by)
      and t.worn_where = trim(seller_describes_thing.worn_where)
      and t.worn_when = trim(seller_describes_thing.worn_when)
  ) then
    return true;
  end if;
  if exists (select 1 from lots l where l.thing_id = thing and l.status = 'open') then
    return false;
  end if;
  update things
  set worn_by = trim(seller_describes_thing.worn_by),
      worn_where = trim(seller_describes_thing.worn_where),
      worn_when = trim(seller_describes_thing.worn_when)
  where id = thing;
  return true;
end;
$$;

revoke all on function seller_describes_thing(uuid, text, text, text) from public;
grant execute on function seller_describes_thing(uuid, text, text, text) to authenticated;
