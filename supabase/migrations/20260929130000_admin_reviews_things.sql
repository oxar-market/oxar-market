-- Админ одобряет или отклоняет присланную вещь, и отказ - с причиной.
--
-- Одобрить можно сразу после отправки: вещь продавца всё равно выходит на
-- маркет только с открытым торгом, так что раннее одобрение ничего не
-- показывает раньше времени. Отклонить можно только с причиной: продавец
-- видит её в кабинете, и вещь больше нельзя опубликовать - только удалить.
alter table things
  add column declined_reason text
    check (declined_reason is null or length(declined_reason) between 3 and 500),
  add column declined_at timestamptz;

create or replace function admin_reviews_thing(thing uuid, approve boolean, reason text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'not an admin';
  end if;
  if not approve and (reason is null or length(trim(reason)) < 3) then
    raise exception 'a reason is required to decline';
  end if;

  update things t
     set active = approve,
         declined_reason = case when approve then null else trim(reason) end,
         declined_at = case when approve then null else now() end
   where t.id = thing and not t.house;
  return found;
end;
$$;

revoke all on function admin_reviews_thing(uuid, boolean, text) from public;
grant execute on function admin_reviews_thing(uuid, boolean, text) to authenticated;

-- Отклонённую вещь не опубликовать: черновик лота на неё не заводится и в
-- открытый не переводится.
drop policy if exists "продавец заводит черновик лота" on lots;
create policy "продавец заводит черновик лота" on lots for insert
  with check (
    status = 'draft'
    and exists (
      select 1 from things t
      where t.id = thing_id and t.seller = auth.uid() and t.stage = 'ready'
        and t.declined_reason is null
    )
  );

drop policy if exists "продавец правит свой черновик" on lots;
create policy "продавец правит свой черновик" on lots for update
  using (
    status = 'draft'
    and exists (select 1 from things t where t.id = thing_id and t.seller = auth.uid())
  )
  with check (
    status in ('draft', 'open')
    and exists (
      select 1 from things t
      where t.id = thing_id and t.seller = auth.uid() and t.declined_reason is null
    )
  );
