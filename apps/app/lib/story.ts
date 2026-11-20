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
  };
}

/**
 * Что получили бренды за деньги: цена тысячи показов - сумма к охвату вещи.
 * Логотип видят все, кто видел вещь, поэтому у каждого бренда своя цена -
 * его ставка к тому же охвату. Охвата нет - цены за показы нет.
 */
export function reachOf(story: Story, reach: number | null) {
  const cpm = (cents: number) => (reach && reach > 0 ? Math.round((cents * 1000) / reach) : null);
  return {
    cpmCents: cpm(story.raisedCents),
    brands: story.winners.map((one) => ({ ...one, cpmCents: cpm(one.amountCents) })),
  };
}
