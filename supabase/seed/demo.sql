-- Демо-данные для витрины и демо на хакатоне.
--
-- Аккаунты вымышленные и помечены префиксом demo_ — реальные продавцы
-- появятся только с их согласия после ручного онбординга.
-- Удалить всё разом: delete from public.sellers where x_handle like 'demo\_%';

insert into public.sellers (x_handle, display_name, follower_count, bio, verified, is_org)
values
  ('demo_anza', 'Anza (demo)', 48200, 'Solana infra research, weekly deep dives', true, false),
  ('demo_kira', 'kira (demo)', 12400, 'shipping small crypto tools, mostly in public', true, false),
  ('demo_superteam', 'Superteam Local (demo)', 31500, 'Regional builder community. Events, bounties, grants.', true, true),
  ('demo_lowkey', 'lowkey (demo)', 4300, 'memecoin archaeology', true, false)
on conflict do nothing;

insert into public.listings (seller_id, kind, price_cents, term_days)
select s.id, v.kind::placement_kind, v.price_cents, v.term_days
from public.sellers s
join (values
  ('demo_anza', 'avatar', 62000, 7),
  ('demo_anza', 'banner', 41000, 7),
  ('demo_anza', 'bio_link', 38000, 30),
  ('demo_kira', 'avatar', 15000, 7),
  ('demo_kira', 'bio_link', 9000, 30),
  ('demo_kira', 'name_suffix', 6000, 14),
  ('demo_superteam', 'banner', 95000, 7),
  ('demo_superteam', 'pinned_post', 70000, 7),
  ('demo_superteam', 'bio_link', 45000, 30),
  ('demo_lowkey', 'avatar', 5500, 7),
  ('demo_lowkey', 'location', 2000, 30)
) as v (handle, kind, price_cents, term_days) on v.handle = s.x_handle
on conflict do nothing;

-- Одна занятая неделя, чтобы календарь не выглядел пустым макетом
insert into public.bookings (listing_id, buyer_handle, buyer_contact, creative_text, start_date, end_date, price_cents, status)
select l.id, 'demo_buyer', null, 'demo campaign', current_date + 2, current_date + 8, l.price_cents, 'approved'
from public.listings l
join public.sellers s on s.id = l.seller_id
where s.x_handle = 'demo_anza' and l.kind = 'avatar'
on conflict do nothing;
