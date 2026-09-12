-- Хранилище для креативов, которые покупатель прикладывает к заявке.
--
-- Читать - всем: продавец должен увидеть, что ему предлагают разместить, а
-- авторизации у нас ещё нет. Загружать - тоже всем, но только в этот bucket,
-- с ограничением по размеру и типу, чтобы его нельзя было использовать как
-- бесплатный файлообменник.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creatives',
  'creatives',
  true,
  8388608, -- 8 МБ: баннер или короткое видео влезают, архив с чем угодно - нет
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/quicktime'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "anyone can upload a creative"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'creatives');

create policy "creatives are readable"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'creatives');
