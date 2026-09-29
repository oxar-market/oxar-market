-- Заявка в продавцы и одобрение из админки.
--
-- Роль по-прежнему выдаём мы, но без похода в дашборд Privy за каждым:
-- человек подаёт заявку из своего аккаунта - кто он, база знает по входу, -
-- а админ её одобряет. Кошелёк в заявке - подсказка админу, а не ключ: роль
-- получает аккаунт, подавший заявку.
create table seller_applications (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  wallet text check (wallet is null or wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  contact text not null check (length(contact) between 1 and 200),
  about text check (about is null or length(about) <= 500),
  status text not null default 'waiting' check (status in ('waiting', 'approved', 'declined')),
  decided_at timestamptz
);

alter table seller_applications enable row level security;

-- Подать - только за себя и только ожидающей; решение ставит админ.
create policy "заявка подаётся за себя" on seller_applications for insert
  with check (user_id = auth.uid() and status = 'waiting' and decided_at is null);

create policy "своя заявка видна" on seller_applications for select
  using (user_id = auth.uid() or is_admin());

create or replace function admin_decide_seller(applicant uuid, approve boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'not an admin';
  end if;

  update seller_applications
     set status = case when approve then 'approved' else 'declined' end,
         decided_at = now()
   where user_id = applicant and status = 'waiting';
  if not found then
    return false;
  end if;

  if approve then
    insert into profiles (user_id, is_seller, seller_since)
    values (applicant, true, now())
    on conflict (user_id) do update
      set is_seller = true, seller_since = coalesce(profiles.seller_since, now());
  end if;
  return true;
end;
$$;

revoke all on function admin_decide_seller(uuid, boolean) from public;
grant execute on function admin_decide_seller(uuid, boolean) to authenticated;
