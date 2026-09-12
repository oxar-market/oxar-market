-- Права продавца: видеть и менять только своё.
--
-- До этого база знала только анонима, которому видна витрина. Продавцу нужно
-- больше: свои места, включая снятые с продажи, и заявки на них. Вход — по
-- ссылке на почту, поэтому «свой» определяется по адресу из токена.
--
-- Адрес заполняем мы при онбординге, как и verified: продавец не может сам
-- привязать свой аккаунт к чужому профилю X.

alter table public.sellers add column auth_email text
  check (auth_email is null or length(auth_email) between 3 and 320);

create unique index sellers_auth_email_unique
  on public.sellers (lower(auth_email))
  where auth_email is not null;

comment on column public.sellers.auth_email is
  'Почта для входа, вписывается вручную при онбординге';

-- Одна проверка «это его место» на все политики. security definer нужен,
-- чтобы политика на listings могла заглянуть в sellers, не требуя от
-- продавца права читать всю таблицу продавцов.
create function public.owns_seller(seller uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1
    from public.sellers s
    where s.id = seller
      and s.auth_email is not null
      and lower(s.auth_email) = lower(auth.jwt() ->> 'email')
  );
$$;

create policy "seller reads own row"
  on public.sellers for select to authenticated
  using (
    auth_email is not null
    and lower(auth_email) = lower(auth.jwt() ->> 'email')
  );

-- Свои листинги видны все, включая active = false: снятое с продажи место
-- продавец должен видеть, чтобы вернуть его в продажу.
create policy "seller reads own listings"
  on public.listings for select to authenticated
  using (public.owns_seller(seller_id));

create policy "seller creates own listings"
  on public.listings for insert to authenticated
  with check (public.owns_seller(seller_id));

create policy "seller updates own listings"
  on public.listings for update to authenticated
  using (public.owns_seller(seller_id))
  with check (public.owns_seller(seller_id));

-- Заявки на свои места: в них контакты покупателя и суммы, поэтому чужие
-- заявки не видны даже другому продавцу.
create policy "seller reads bookings on own listings"
  on public.bookings for select to authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = listing_id and public.owns_seller(l.seller_id)
  ));

create policy "seller decides on own bookings"
  on public.bookings for update to authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = listing_id and public.owns_seller(l.seller_id)
  ))
  with check (status in ('approved', 'rejected', 'cancelled'));

-- Заявку после подачи не переписывают: иначе продавец мог бы поднять цену
-- или сдвинуть даты уже после того, как покупатель их выбрал. Меняется
-- только статус.
create function public.bookings_freeze_terms()
  returns trigger
  language plpgsql
as $$
begin
  if new.listing_id is distinct from old.listing_id
    or new.buyer_handle is distinct from old.buyer_handle
    or new.buyer_contact is distinct from old.buyer_contact
    or new.creative_url is distinct from old.creative_url
    or new.creative_text is distinct from old.creative_text
    or new.start_date is distinct from old.start_date
    or new.end_date is distinct from old.end_date
    or new.price_cents is distinct from old.price_cents
  then
    raise exception 'only status can change on a filed booking';
  end if;
  return new;
end;
$$;

create trigger bookings_freeze_terms
  before update on public.bookings
  for each row execute function public.bookings_freeze_terms();
