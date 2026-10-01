-- Пруф: фото вещи в деле - на человеке, в дороге, на сцене. Пока его нет,
-- итоги торга говорят «preparing», с ним - «proof», и шаги «что дальше»
-- считаются из данных, а не стоят в коде. Сказали на показе 1 октября 2026.
--
-- Пути в хранилище things, в папке proof/<вещь>/. Кладёт админ: пруф
-- снимаем мы, и у вещи продавца тоже - до его кабинета ещё не дошли.
alter table things
  add column proof_photos text[] not null default '{}';

create policy "админ кладёт пруф" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'things' and (storage.foldername(name))[1] = 'proof' and is_admin());
