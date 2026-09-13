-- Свой результат можно улучшать, чужой - нет.
--
-- До этого занятое имя не обновлялось вовсе: защиты от подмены не было никакой,
-- поэтому проще было запретить всем. Плата за это - набил больше своего рекорда
-- и записать не можешь.
--
-- Теперь у строки есть ключ. При первой отправке имени клиент придумывает его
-- сам и держит у себя, а база хранит только sha256 - то есть из базы ключ не
-- достать даже с полным доступом к таблице. Улучшить результат может тот, кто
-- пришлёт тот же ключ; остальным имя занято.
--
-- Что это не защищает: ключ живёт в браузере, поэтому с другого устройства своё
-- имя не обновить. Настоящее владение телеграм-именем подтверждается только
-- ботом, и это отдельная работа.

alter table public.game_scores add column claim_hash text;

comment on column public.game_scores.claim_hash is
  'sha256 ключа, который держит у себя игрок; сам ключ в базе не хранится';

/*
 * Записать счёт под именем.
 *
 * Вернёт лучший результат, который остался в таблице: если прошлая попытка была
 * выше, в списке останется она, а ответ покажет, что улучшать ещё есть что.
 */
create or replace function public.submit_score(handle text, value integer, claim text)
  returns integer
  language plpgsql
  security definer
  set search_path = public, extensions
as $$
declare
  kept integer;
  known text;
  claimed text;
begin
  if handle !~ '^@[A-Za-z][A-Za-z0-9_]{4,31}$' then
    raise exception 'telegram must look like @name';
  end if;
  if value < 0 or value > 2000 then
    raise exception 'score out of range';
  end if;
  if claim is null or length(claim) < 16 then
    raise exception 'claim key is too short';
  end if;

  claimed := encode(extensions.digest(claim, 'sha256'), 'hex');

  select score, claim_hash into kept, known
  from public.game_scores
  where lower(telegram) = lower(handle)
  for update;

  if kept is null then
    insert into public.game_scores (telegram, score, claim_hash)
    values (handle, value, claimed)
    returning score into kept;
    return kept;
  end if;

  -- Строки, записанные до появления ключей, отдаём тому, кто перебьёт результат:
  -- иначе они остались бы вечными и без владельца.
  if known is null then
    if value <= kept then
      raise exception 'that name is taken';
    end if;
    update public.game_scores
    set score = value, claim_hash = claimed
    where lower(telegram) = lower(handle)
    returning score into kept;
    return kept;
  end if;

  if known <> claimed then
    raise exception 'that name is taken';
  end if;

  if value > kept then
    update public.game_scores
    set score = value
    where lower(telegram) = lower(handle)
    returning score into kept;
  end if;

  return kept;
end;
$$;

-- Старая подпись с двумя аргументами больше не нужна: клиент всегда присылает
-- ключ, а оставленная функция была бы вторым входом с прежними правилами.
drop function if exists public.submit_score(text, integer);

revoke execute on function public.submit_score(text, integer, text) from public;
grant execute on function public.submit_score(text, integer, text) to anon, authenticated;

comment on function public.submit_score is
  'Пишет счёт под именем: своё имя улучшаешь ключом, чужое занято';
