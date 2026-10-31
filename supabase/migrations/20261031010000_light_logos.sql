-- Сайт показывает лёгкие копии логотипов, а не оригиналы.
--
-- Оригинал логотипа сайт отдавал как есть: два PNG по 8 MB на ване за пять
-- дней выбрали весь трафик бесплатного Supabase. Теперь рядом с оригиналом
-- лежит копия <имя>.view.webp (не крупнее 1024 px), и ссылка в базе ведёт на
-- неё; оригинал для печати восстанавливает originalUrl из @oxar/core.
--
-- Новые ставки кладут копию сами. Копии старых залиты скриптом заранее;
-- здесь ссылка меняется только там, где копия правда лежит в хранилище, -
-- иначе картинка на сайте сломалась бы. Откат: отрезать '.view.webp'.

update lot_bids b
set media_url = b.media_url || '.view.webp'
where b.media_url like '%/storage/v1/object/public/creatives/%'
  and b.media_url not like '%.view.webp'
  and exists (
    select 1 from storage.objects o
    where o.bucket_id = 'creatives'
      and o.name = split_part(b.media_url, '/creatives/', 2) || '.view.webp'
  );

update stickers s
set logo_url = s.logo_url || '.view.webp'
where s.logo_url like '%/storage/v1/object/public/creatives/%'
  and s.logo_url not like '%.view.webp'
  and exists (
    select 1 from storage.objects o
    where o.bucket_id = 'creatives'
      and o.name = split_part(s.logo_url, '/creatives/', 2) || '.view.webp'
  );
