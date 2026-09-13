-- Маркетплейс закрывается за вейтлистом.
--
-- В интерфейсе цены уже под барьером, но барьер в разметке ничего не защищает:
-- листинги, лоты, ставки и занятые даты отдавались публичным ключом, то есть
-- любому, кто открыл вкладку «сеть» или дёрнул REST напрямую. Пока в базе нет
-- живых цен, это не утечка, но открывать доступ с такой дырой нельзя.
--
-- «Пустить дальше» значит «есть запись в sellers с этим адресом входа»: такие
-- записи заводим мы руками, и другого признака одобренного аккаунта у нас нет.
-- Следствие, которое надо помнить: покупатель без своих мест внутрь не попадёт,
-- и до открытия доступ есть только у тех, кого мы сами и завели.
--
-- Вход по ссылке на почту открыт всем желающим, поэтому одной проверки «вошёл»
-- мало: authenticated - это любой, кто ввёл свой адрес.

create function public.has_access()
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1
    from public.sellers s
    where s.auth_email is not null
      and lower(s.auth_email) = lower(auth.jwt() ->> 'email')
  );
$$;

comment on function public.has_access is
  'Пустили ли этот аккаунт дальше вейтлиста';

revoke execute on function public.has_access() from public, anon;
grant execute on function public.has_access() to authenticated;

-- Продавцы и их места. Своё продавец видит отдельными политиками из
-- seller_access, они остаются: снятое с продажи место нужно ему и тогда, когда
-- витрина его уже не отдаёт.
drop policy "verified sellers are public" on public.sellers;

create policy "verified sellers are visible inside"
  on public.sellers for select to authenticated
  using (verified and public.has_access());

drop policy "active listings are public" on public.listings;

create policy "active listings are visible inside"
  on public.listings for select to authenticated
  using (
    active
    and public.has_access()
    and exists (
      select 1 from public.sellers s where s.id = seller_id and s.verified
    )
  );

-- Лоты и ставки. Суммы ставок остаются видны всем, кого пустили: открытый торг
-- в крипто-твиттере скорее разгоняет ставки, чем мешает. Контакт и креатив
-- по-прежнему только у продавца лота, через bids_for_my_auction.
drop policy "auctions are public" on public.auctions;

create policy "auctions are visible inside"
  on public.auctions for select to authenticated
  using (public.has_access());

drop policy "bids are public" on public.bids;

create policy "bids are visible inside"
  on public.bids for select to authenticated
  using (public.has_access());

drop policy "anyone can bid" on public.bids;

create policy "insiders can bid"
  on public.bids for insert to authenticated
  with check (public.has_access());

-- Заявка на размещение - тоже обязательство, и подать её может только тот, кто
-- видит цену. Статус остаётся прежним: сам себе бронь не одобришь.
drop policy "anyone can request a placement" on public.bookings;

create policy "insiders can request a placement"
  on public.bookings for insert to authenticated
  with check (status = 'requested' and public.has_access());

-- Креатив прикладывают к заявке, поэтому загрузка идёт туда же, куда и заявка.
-- Чтение bucket остаётся открытым: ссылки на файлы публичные, и продавец
-- смотрит предложенную картинку до входа.
drop policy "anyone can upload a creative" on storage.objects;

create policy "insiders can upload a creative"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'creatives' and public.has_access());

-- Права рядом с политиками: без строки в sellers политика и так не пустит, но
-- анониму больше нечего делать в этих таблицах, а лишнее право однажды
-- окажется единственной защитой.
revoke select on public.sellers from anon;
revoke select on public.listings from anon;
revoke select, insert on public.auctions from anon;
revoke select, insert on public.bids from anon;
revoke insert on public.bookings from anon;
revoke execute on function public.close_due_auctions() from anon;

-- Занятые даты живут во view с security_invoker = off: она читает bookings в
-- обход RLS, поэтому политика к ней не применяется и закрыть её можно только
-- правами. Вошедшему без доступа она отдаёт даты без имён - пусть остаётся,
-- иначе календарь пришлось бы переписывать на функцию ради дат, которые и так
-- видны на самом профиле.
revoke all on public.listing_busy from anon;

-- Вейтлист и счёт в игре остаются открытыми: в вейтлист можно только писать, а
-- таблица игроков - публичная по смыслу.
