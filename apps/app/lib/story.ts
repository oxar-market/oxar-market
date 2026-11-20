/**
 * История закрытого торга: сколько собрали, кто забрал места и где за место
 * боролись. Считается из лотов и ставок, без сети - чтобы гонять тестом.
 */

type StoryLot = { id: string; spot_code: string; status: string };
type StoryBid = {
  id: string;
  lot_id: string;
  amount_cents: number;
  brand: string;
  bidder_wallet: string;
  created_at: string;
  media_url: string;
};

export type Winner = { spot: string; brand: string; amountCents: number; mediaUrl: string };
/** Все ставки одного места, от большей к меньшей. won - место продано, первая ставка забрала его. */
export type Round = {
  spot: string;
  steps: { brand: string; amountCents: number; at: string }[];
  brands: number;
  won: boolean;
};

export type Story = {
  raisedCents: number;
  sold: number;
  total: number;
  bidders: number;
  bids: number;
  /** Все проданные места, дорогие первыми. */
  winners: Winner[];
  /** Места, которые никто не взял. */
  unsold: string[];
  /** Места со ставками - дорогие первыми; там же перебитые. */
  rounds: Round[];
  firstBidAt: string | null;
  /** Сумма по ходу торга: после каждой ставки - лидирующие ставки всех мест вместе. won - эта ставка в итоге забрала место. */
  pot: { at: string; cents: number; won: boolean }[];
};

export function storyOf(lots: StoryLot[], bids: StoryBid[]): Story {
  const winners: Winner[] = [];
  const unsold: string[] = [];
  const rounds: Round[] = [];
  for (const lot of lots) {
    const mine = bids
      .filter((one) => one.lot_id === lot.id)
      .sort((a, b) => a.amount_cents - b.amount_cents || a.created_at.localeCompare(b.created_at));
    const top = mine.at(-1);
    if (lot.status === "won" && top) {
      winners.push({ spot: lot.spot_code, brand: top.brand, amountCents: top.amount_cents, mediaUrl: top.media_url });
    } else {
      unsold.push(lot.spot_code);
    }
    if (mine.length > 0) {
      rounds.push({
        spot: lot.spot_code,
        steps: mine.reverse().map((one) => ({ brand: one.brand, amountCents: one.amount_cents, at: one.created_at })),
        brands: new Set(mine.map((one) => one.bidder_wallet)).size,
        won: lot.status === "won",
      });
    }
  }
  winners.sort((a, b) => b.amountCents - a.amountCents);
  rounds.sort((a, b) => b.steps[0]!.amountCents - a.steps[0]!.amountCents);
  return {
    raisedCents: winners.reduce((sum, one) => sum + one.amountCents, 0),
    sold: winners.length,
    total: lots.length,
    bidders: new Set(bids.map((one) => one.bidder_wallet)).size,
    bids: bids.length,
    winners,
    unsold,
    rounds,
    firstBidAt: bids.map((one) => one.created_at).sort()[0] ?? null,
    pot: potOf(lots, bids),
  };
}

function potOf(lots: StoryLot[], bids: StoryBid[]): Story["pot"] {
  // Победившая ставка места - наибольшая (при равных - ранняя), как в итоге.
  const winning = new Set<string>();
  for (const lot of lots) {
    if (lot.status !== "won") continue;
    const top = bids
      .filter((one) => one.lot_id === lot.id)
      .sort((a, b) => b.amount_cents - a.amount_cents || a.created_at.localeCompare(b.created_at))[0];
    if (top) winning.add(top.id);
  }
  const leading = new Map<string, number>();
  return [...bids]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((one) => {
      leading.set(one.lot_id, Math.max(leading.get(one.lot_id) ?? 0, one.amount_cents));
      return {
        at: one.created_at,
        cents: [...leading.values()].reduce((sum, cents) => sum + cents, 0),
        won: winning.has(one.id),
      };
    });
}

