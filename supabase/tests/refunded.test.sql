-- Отметку «деньги вернули» ставим только мы: продавец не заводит вещь с ней.

insert into auth.users (id, email) values ('ffffffff-0000-4000-8000-000000000006', 'rita@test.invalid');
insert into profiles (user_id, is_seller) values ('ffffffff-0000-4000-8000-000000000006', true)
  on conflict (user_id) do update set is_seller = true;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ffffffff-0000-4000-8000-000000000006","role":"authenticated"}', true);

do $$ begin
  insert into things (slug, title, model_url, seller, active, refunded_at)
    values ('test-rita-refunded', 'Rita tee', '/models/shirt.glb', 'ffffffff-0000-4000-8000-000000000006', false, now());
  raise exception 'FAIL: продавец завёл вещь с отметкой возврата';
exception when insufficient_privilege then null;
end $$;

-- Без отметки - можно.
insert into things (slug, title, model_url, seller, active)
  values ('test-rita-plain', 'Rita tee', '/models/shirt.glb', 'ffffffff-0000-4000-8000-000000000006', false);

select 'refunded: all invariants hold' as result;
