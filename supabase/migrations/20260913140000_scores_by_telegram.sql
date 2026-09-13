-- Счёт подписывается телеграмом, и одно имя - одна строка.
--
-- Хэндл в X просили зря: до победителей мы всё равно дотягиваемся сообщением,
-- а телеграм для этого прямее. И главное - в таблице теперь не может быть двух
-- строк на одно имя: раньше каждый заход добавлял новую, и список забивался
-- попытками одного человека.
--
-- Подтвердить, что имя принадлежит тому, кто его вписал, без входа нельзя.
-- Первый занявший имя его и держит; улучшить результат под этим именем может
-- кто угодно, но выдача доступа всё равно идёт руками, и там это видно.

alter table public.game_scores rename column x_handle to telegram;

-- Старое ограничение снимаем до конвертации: под него телеграм-имя с собачкой
-- не проходит, и обновление падало бы на первой же строке.
alter table public.game_scores
  drop constraint game_scores_x_handle_check;

-- Прежние счёта записаны хэндлом X без собачки. Превращаем в телеграм-имя, а
-- что не подходит по формату - убираем: это игровые очки, не данные о сделках.
update public.game_scores
set telegram = '@' || telegram
where telegram not like '@%';

delete from public.game_scores
where telegram !~ '^@[A-Za-z][A-Za-z0-9_]{4,31}$';

alter table public.game_scores
  add constraint game_scores_telegram_check
  check (telegram ~ '^@[A-Za-z][A-Za-z0-9_]{4,31}$');

-- Дубликаты, накопленные до этого правила, сворачиваем: остаётся лучший
-- результат, при равном счёте - поставленный раньше.
delete from public.game_scores g
where exists (
  select 1
  from public.game_scores better
  where lower(better.telegram) = lower(g.telegram)
    and better.id <> g.id
    and (
      better.score > g.score
      or (better.score = g.score and better.created_at < g.created_at)
      or (better.score = g.score and better.created_at = g.created_at
          and better.id < g.id)
    )
);

-- Одно имя - одна строка, без учёта регистра.
create unique index game_scores_telegram_unique
  on public.game_scores (lower(telegram));

/*
 * Счёт отправляется только через эту функцию: прямую вставку анониму закрываем,
 * иначе он обошёл бы правило «остаётся лучшая попытка».
 */
create function public.submit_score(handle text, value integer)
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
  on conflict (lower(telegram))
  do update set score = greatest(public.game_scores.score, excluded.score)
  returning score into kept;

  return kept;
end;
$$;

revoke insert on public.game_scores from anon, authenticated;
revoke execute on function public.submit_score(text, integer) from public;
grant execute on function public.submit_score(text, integer) to anon, authenticated;

comment on function public.submit_score is
  'Записывает счёт под телеграм-именем, оставляя лучший результат';
