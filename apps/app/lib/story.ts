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
export type Battle = { spot: string; steps: { brand: string; amountCents: number; at: string }[]; brands: number };

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
  battles: Battle[];
  firstBidAt: string | null;
};

export function storyOf(lots: StoryLot[], bids: StoryBid[]): Story {
  const winners: Winner[] = [];
  const unsold: string[] = [];
  const battles: Battle[] = [];
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
    if (mine.length > 1) {
      battles.push({
        spot: lot.spot_code,
        steps: mine.map((one) => ({ brand: one.brand, amountCents: one.amount_cents, at: one.created_at })),
        brands: new Set(mine.map((one) => one.bidder_wallet)).size,
      });
    }
  }
  winners.sort((a, b) => b.amountCents - a.amountCents);
  battles.sort((a, b) => b.steps.length - a.steps.length);
  return {
    raisedCents: winners.reduce((sum, one) => sum + one.amountCents, 0),
    sold: winners.length,
    total: lots.length,
    bidders: new Set(bids.map((one) => one.bidder_wallet)).size,
    bids: bids.length,
    winners,
    unsold,
    battles,
    firstBidAt: bids.map((one) => one.created_at).sort()[0] ?? null,
  };
}
