-- У копии вана - тот же набор цен, что у вана, а не по доллару: прогон
-- показывает ровно то, что увидит админ при передаче вана, а сбавить цены до
-- доллара можно в самой карточке передачи.
update spot_plans tp
set reserve_cents = vp.reserve_cents, step_cents = vp.step_cents
from thing_spots ts, thing_spots vs, spot_plans vp
where tp.spot_id = ts.id
  and ts.thing_id = '7e5a0c3e-9f4b-4d2a-8c1e-5b6f7a8d9e01'
  and vs.thing_id = '1d7cc1ef-52a7-4070-b714-9d864e1e3ce6'
  and vs.code = ts.code
  and vp.spot_id = vs.id;
