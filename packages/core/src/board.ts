/**
 * Рейтинг кошельков кабинета - по деньгам, отданным за выигранные места;
 * выигрыши, деньги за которые вернули, - после оплаченных, с суммой.
 * Платит только старшая ставка на проданном месте; всё остальное, что
 * человек ставил, к нему вернулось. Прогоны (rehearsal) - наша репетиция, в
 * рейтинг они не идут.
 */

/** refunded - деньги за вещь вернули мимо программы (вещь не поехала): место не оплачено. */
export type BoardLot = { id: string; status: string; rehearsal: boolean; thing_id: string; refunded?: boolean };
export type BoardBid = { lot_id: string; amount_cents: number; bidder_wallet: string; brand: string | null; created_at: string };

export type Bidder = {
  wallet: string;
  /** Вещи, где ставил, и где выиграл хотя бы одно место. */
  joined: string[];
  won: string[];
  spots: number;
  paidCents: number;
  bids: number;
  /** Самая большая ставка человека - и выигравшая, и перебитая. */
  bestCents: number;
  /**
   * На скольких местах его ставка сейчас старшая и на какую сумму - в идущем
   * торге это «ведёт», в закрытом совпадает с выигранным. Пока торг идёт,
   * paidCents пуст: платит только закрытый торг.
   */
  leads: number;
  leadCents: number;
  /** Вернулось: перебили, или поднимал сам. */
  backCents: number;
  /** Выиграл, но деньги за вещь вернули (вещь не поехала): места и сумма. */
  refundedSpots: number;
  refundedCents: number;
  brands: string[];
  since: number;
};

/** Старшая ставка каждого места - наибольшая сумма; порядок входа не важен. */
export function topBids<B extends Pick<BoardBid, "lot_id" | "amount_cents">>(bids: B[]): Map<string, B> {
  const top = new Map<string, B>();
  for (const bid of bids) {
    const was = top.get(bid.lot_id);
    if (!was || bid.amount_cents > was.amount_cents) top.set(bid.lot_id, bid);
  }
  return top;
}

export function rankBidders(lots: BoardLot[], bids: BoardBid[]): Bidder[] {
  const byLot = new Map(lots.filter((lot) => !lot.rehearsal).map((lot) => [lot.id, lot]));
  const real = bids.filter((bid) => byLot.has(bid.lot_id));
  const top = topBids(real);

  const out = new Map<string, Bidder>();
  for (const bid of real) {
    let one = out.get(bid.bidder_wallet);
    if (!one) {
      one = { wallet: bid.bidder_wallet, joined: [], won: [], spots: 0, paidCents: 0, bids: 0, bestCents: 0, leads: 0, leadCents: 0, backCents: 0, refundedSpots: 0, refundedCents: 0, brands: [], since: Infinity };
      out.set(bid.bidder_wallet, one);
    }
    const lot = byLot.get(bid.lot_id)!;
    one.bids += 1;
    one.bestCents = Math.max(one.bestCents, bid.amount_cents);
    one.since = Math.min(one.since, Date.parse(bid.created_at));
    if (!one.joined.includes(lot.thing_id)) one.joined.push(lot.thing_id);
    const brand = (bid.brand ?? "").trim();
    if (brand && !one.brands.some((name) => name.toLowerCase() === brand.toLowerCase())) one.brands.push(brand);
    if (top.get(bid.lot_id) === bid) {
      one.leads += 1;
      one.leadCents += bid.amount_cents;
    }
    if (top.get(bid.lot_id) === bid && lot.status === "won" && !lot.refunded) {
      one.spots += 1;
      one.paidCents += bid.amount_cents;
      if (!one.won.includes(lot.thing_id)) one.won.push(lot.thing_id);
    } else {
      one.backCents += bid.amount_cents;
      if (top.get(bid.lot_id) === bid && lot.status === "won") {
        one.refundedSpots += 1;
        one.refundedCents += bid.amount_cents;
      }
    }
  }
  // Сначала оплаченное, за ним выигрыши с возвратом - ставка была настоящей,
  // вещь не поехала не по вине покупателя, - потом остальные по старшей ставке.
  return [...out.values()].sort(
    (a, b) =>
      b.paidCents - a.paidCents ||
      b.spots - a.spots ||
      b.refundedCents - a.refundedCents ||
      b.bestCents - a.bestCents ||
      a.since - b.since,
  );
}

/**
 * Что стало с каждой своей ставкой - для истории в кабинете. Ставка не самая
 * большая своя на этом месте - её поднял сам. Самая большая и стоит сверху:
 * торг идёт - веду; выиграл - выиграл; вещь не поехала или место не
 * состоялось - деньги вернули. Самая большая, но сверху чужая - перебили.
 */
export type MyBidState = "leading" | "won" | "refunded" | "raised" | "outbid";
export type MyLot = { open: boolean; status: string; refunded: boolean; topWallet: string | null };

export function myBidStates(
  mine: { lot_id: string; amount_cents: number }[],
  lots: Record<string, MyLot | undefined>,
  wallet: string,
): MyBidState[] {
  const best = new Map<string, number>();
  for (const bid of mine) best.set(bid.lot_id, Math.max(best.get(bid.lot_id) ?? 0, bid.amount_cents));
  return mine.map((bid) => {
    if (bid.amount_cents < best.get(bid.lot_id)!) return "raised";
    const lot = lots[bid.lot_id];
    if (!lot || lot.topWallet !== wallet) return "outbid";
    if (lot.open) return "leading";
    if (lot.refunded || lot.status !== "won") return "refunded";
    return "won";
  });
}
