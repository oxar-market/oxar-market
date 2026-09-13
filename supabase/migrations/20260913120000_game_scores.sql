-- Счёт в Flappy Josip и очередь на доступ.
--
-- Топ-10 попадает в приложение первыми, поэтому счёт - это не только очки, но и
-- заявка: без хэндла в X непонятно, кому открывать доступ.
--
-- Счёт присылает браузер, и подделать его можно. Это осознанно: пасхалка не
-- стоит античита. Верхняя граница есть, чтобы в таблице не появилось числа,
-- которое сразу убивает смысл списка, а остальное - ручная проверка перед тем,
-- как открывать доступ.

create table public.game_scores (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  x_handle text not null check (x_handle ~ '^[A-Za-z0-9_]{1,15}$'),
  score integer not null check (score between 0 and 2000)
);

-- Таблица читается только отсортированной по счёту, и почти всегда - первые
-- десять строк.
create index game_scores_top_idx on public.game_scores (score desc, created_at);

alter table public.game_scores enable row level security;

-- Счёт публичен: список игроков и есть смысл затеи.
create policy "scores are public"
  on public.game_scores for select to anon, authenticated
  using (true);

create policy "anyone can post a score"
  on public.game_scores for insert to anon, authenticated
  with check (true);

-- Свой счёт не переписывают и не удаляют: в списке остаётся лучшая попытка,
-- а не последняя.
revoke all on public.game_scores from anon, authenticated;
grant select, insert on public.game_scores to anon, authenticated;

comment on table public.game_scores is
  'Счёт в Flappy Josip. Топ-10 получает доступ к приложению первыми';
