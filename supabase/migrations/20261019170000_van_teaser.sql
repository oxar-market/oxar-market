-- Ван Solana Got Motion: подготовленный аукцион, до среды - анонс.
--
-- Superteam Georgia едет фургоном из Грузии на Breakpoint в Лондон через
-- отделения Superteam, со стримом 24/7. Места на ване продаются у нас; торг
-- открывается в среду, 21 октября 2026, в 16:00 UTC. Продавец - их кошелёк:
-- его впишем, когда он войдёт, а публикует торг он сам.
--
-- До публикации места - черновики, публике их не видно, и дату открытия по
-- лотам не узнать. Поэтому дата - на вещи: по ней маркет, лендинг и
-- страница торга показывают голограмму и отсчёт.
alter table things
  add column opens_at timestamptz;

insert into things (
  id, slug, title, tagline, model_url, photos, stage, active, house, prepared, opens_at,
  worn_by, worn_where, worn_when, worn_about
) values (
  '1d7cc1ef-52a7-4070-b714-9d864e1e3ce6',
  'the-van',
  'The van',
  'Solana Got Motion: a road trip to Breakpoint',
  '/models/van.glb',
  array['/cases/van/1.webp', '/cases/van/2.webp', '/cases/van/3.webp', '/cases/van/4.webp'],
  'ready',
  true,
  false,
  true,
  '2026-10-21 16:00:00+00',
  'Superteam Georgia road crew',
  'Georgia to London through 7 Superteam chapters, livestreamed 24/7',
  'On the road until Breakpoint, Nov 15-17',
  'Every panel of the van goes to auction. 360-degree cameras stream the whole drive.'
)
on conflict (id) do nothing;
