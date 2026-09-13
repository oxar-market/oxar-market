-- Имя в таблице игроков занимает тот, кто вписал его первым, и всё.
--
-- До этого счёт под занятым именем можно было улучшить - кому угодно, не только
-- владельцу: подтвердить владение телеграм-именем нам нечем. То есть посторонний
-- мог поднять чужой результат и вытеснить из топа честных игроков. Проверено на
-- живой базе: отправка 500 под чужим именем принималась.
--
-- Теперь занятое имя не обновляется вовсе. Следствие принято осознанно: с
-- телефона и с ноутбука это две разные попытки, и вторую под тем же именем не
-- отправить.

create or replace function public.submit_score(handle text, value integer)
  returns integer
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  kept integer;
begin
  if handle !~ '^@[A-Za-z][A-Za-z0-9_]{4,31}$' then
    raise exception 'telegram must look like @name';
  end if;
  if value < 0 or value > 2000 then
    raise exception 'score out of range';
  end if;

  insert into public.game_scores (telegram, score)
  values (handle, value)
  on conflict (lower(telegram)) do nothing
  returning score into kept;

  if kept is null then
    raise exception 'that name is taken';
  end if;

  return kept;
end;
$$;

comment on function public.submit_score is
  'Записывает счёт под свободным телеграм-именем; занятое имя не обновляет';
