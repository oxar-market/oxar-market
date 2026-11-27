-- Второй админ: человек за кошельком HVEV…gwk7t, по просьбе владельца
-- площадки 27.11.2026. Список админов ведётся по идентификатору Privy, а
-- кошелёк к нему ведёт через wallet_owners. На базе без такого кошелька
-- (локальная) строк не будет.
insert into admins (privy_id)
select i.privy_id
from wallet_owners w
join identities i using (user_id)
where w.wallet = 'HVEVFfqJwWxwDCjVDKzgrQ6ZmANuTXo6MTcCUT7gwk7t'
on conflict do nothing;
