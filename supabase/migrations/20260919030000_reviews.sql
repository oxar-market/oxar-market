-- Отзывы: каждая сторона говорит о другой, и только по состоявшейся сделке.
--
-- Оценку пишут обе стороны. Продавец рискует не меньше покупателя: ему присылают
-- креатив, который он вешает на собственный профиль, и человек по ту сторону
-- бывает разный.
--
-- Отзыв привязан к брони, а не к людям. Это единственный способ отличить
-- настоящий отзыв от выдуманного: строка в bookings означает, что сделка была,
-- деньги двигались и срок отстоял. Без такой привязки рейтинг накручивается за
-- вечер.
--
-- Править и удалять отзыв нельзя, политик на это нет намеренно. Отзыв, который
-- переписывают после ответа второй стороны, перестаёт быть свидетельством.

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  booking_id uuid not null references public.bookings (id) on delete cascade,

  -- С какой стороны написано. Вместе с booking_id это и есть автор: кто был
  -- покупателем, а кто продавцом, уже записано в самой сделке.
  author text not null check (author in ('buyer', 'seller')),

  rating smallint not null check (rating between 1 and 5),
  body text check (body is null or length(body) between 1 and 1000),

  -- Один отзыв на сторону. Второй был бы не уточнением, а попыткой
  -- переголосовать.
  unique (booking_id, author)
);

create index reviews_booking_idx on public.reviews (booking_id);

comment on table public.reviews is
  'Оценки сторон по завершённым сделкам, по одной на каждую сторону';

alter table public.reviews enable row level security;

-- Читают все, кого пустили: рейтинг продавца нужен покупателю до сделки, иначе
-- он ни на что не влияет. Анониму закрыто, как и остальная витрина.
create policy "reviews are readable inside"
  on public.reviews for select to authenticated
  using (public.has_access());

-- Может ли вошедший написать отзыв по этой сделке и за эту сторону.
--
-- security definer, как owns_seller: внутри политики подзапрос выполняется
-- правами вызывающего и под его RLS, а значит ответ зависел бы от того, что
-- человеку видно, а не от того, как было на самом деле.
--
-- `completed` здесь обязателен: до конца срока сделка ещё может сорваться, а
-- отзыв, оставленный в середине, оценивает намерение, а не результат. В этот
-- статус бронь переводит планировщик, вручную его не выставить.
--
-- Функция нужна и интерфейсу: показывать форму отзыва стоит только тому, кто
-- имеет право его оставить, и решать это должно то же правило, что и пускает
-- запись.
create function public.may_review(booking uuid, side text)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1
    from public.bookings b
    join public.listings l on l.id = b.listing_id
    where b.id = booking
      and b.status = 'completed'
      and (
        (
          side = 'buyer'
          and b.buyer_email is not null
          and lower(b.buyer_email) = lower(auth.jwt() ->> 'email')
        )
        or (side = 'seller' and public.owns_seller(l.seller_id))
      )
  );
$$;

comment on function public.may_review(uuid, text) is
  'Участник ли вошедший этой завершённой сделки с этой стороны';

revoke execute on function public.may_review(uuid, text) from public, anon;
grant execute on function public.may_review(uuid, text) to authenticated;

create policy "a side of a finished deal leaves one review"
  on public.reviews for insert to authenticated
  with check (public.has_access() and public.may_review(booking_id, author));

revoke all on public.reviews from anon, authenticated;
grant select, insert on public.reviews to authenticated;

-- Рейтинг продавца одной строкой.
--
-- Считается только по отзывам покупателей: оценка, которую продавец поставил
-- покупателю, к репутации самого продавца отношения не имеет.
--
-- security_invoker = off, как у listing_busy: представление читает сделки в
-- обход RLS, поэтому закрывается правами, а не политикой.
create view public.seller_rating
with (security_invoker = off) as
select
  l.seller_id,
  round(avg(r.rating)::numeric, 2) as rating,
  count(*)::integer as reviews
from public.reviews r
join public.bookings b on b.id = r.booking_id
join public.listings l on l.id = b.listing_id
where r.author = 'buyer'
group by l.seller_id;

revoke all on public.seller_rating from anon, authenticated;
grant select on public.seller_rating to authenticated;
