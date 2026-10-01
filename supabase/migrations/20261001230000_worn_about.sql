-- В чём особенность: что происходит с вещью там, где её носят. «Кто, где,
-- когда» отвечают на вопрос «что покупаю», а это - «почему это стоит
-- внимания»: на сцене во время питча, на глазах у трёхсот фаундеров. До сих
-- пор такая фраза была написана в коде страницы торга про первую футболку
-- и показывалась на любой вещи. Сказали на показе 1 октября 2026.
--
-- Необязательно: не у всякой вещи есть история, а пустого абзаца на
-- странице торга не нужно. Пусто - абзаца нет.
alter table things
  add column worn_about text check (worn_about is null or length(worn_about) <= 300);

-- Та же функция с четвёртым словом. Прежнюю сигнатуру убираем: иначе в базе
-- жили бы две, и вызов по имени стал бы неоднозначным.
drop function seller_describes_thing(uuid, text, text, text);

create function seller_describes_thing(thing uuid, worn_by text, worn_where text, worn_when text, worn_about text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  about text := nullif(trim(coalesce(worn_about, '')), '');
begin
  if length(trim(coalesce(worn_by, ''))) not between 1 and 120
     or length(trim(coalesce(worn_where, ''))) not between 1 and 120
     or length(trim(coalesce(worn_when, ''))) not between 1 and 120
     or length(coalesce(about, '')) > 300 then
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
      and t.worn_about is not distinct from about
  ) then
    return true;
  end if;
  if exists (select 1 from lots l where l.thing_id = thing and l.status = 'open') then
    return false;
  end if;
  update things
  set worn_by = trim(seller_describes_thing.worn_by),
      worn_where = trim(seller_describes_thing.worn_where),
      worn_when = trim(seller_describes_thing.worn_when),
      worn_about = about
  where id = thing;
  return true;
end;
$$;

revoke all on function seller_describes_thing(uuid, text, text, text, text) from public;
grant execute on function seller_describes_thing(uuid, text, text, text, text) to authenticated;
