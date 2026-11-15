/**
 * Торги для прототипа: главная и страница всех торгов читают одно и то же.
 */

export const APP_URL = "https://app.oxar.app";
/** Куда ведёт «следить за следующим»: формы подписки пока нет, анонсы - в X. */
export const FOLLOW = "https://x.com/oxar_app";

/**
 * Объявленный, но ещё не открытый торг. Его нет в базе, пока торг не открыт,
 * поэтому он здесь. Откроется - убрать, он придёт из базы как идущий.
 */
export type Next = { owner: string; title: string; when: string };

/** Сколько мест и где они - с Ecosystem Call ещё не договорились, поэтому не пишем. */
export const NEXT: Next | null = {
  owner: "Ecosystem Call",
  title: "Holiday edition. Logo spots on the set, live on air.",
  when: "December",
};

const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Чья вещь - крупной надписью на карточке, как логотип бренда у frontier. */
const OWNERS: Record<string, string> = {
  "the-van": "Superteam Georgia",
  "shirt-xx": "Ecosystem Call",
  "superteam-ua-tee": "Superteam Ukraine",
};

/** Тон карточки - под хозяина вещи. */
export const TONES: Record<string, "dark" | "warm" | "light"> = {
  "the-van": "dark",
  "shirt-xx": "warm",
  "superteam-ua-tee": "light",
};

export type Auction = {
  id: string;
  slug: string;
  title: string;
  owner: string;
  where: string | null;
  status: "live" | "sold";
  raisedCents: number;
  spots: number;
  bidders: number;
  closedAt: number;
  /** Модель вещи: с её сцены снимается кадр с местами. */
  model: string | null;
  /** Код места - кто его выиграл и за сколько. */
  won: Record<string, { url: string; brand: string; cents: number }>;
};

export type Data = {
  auctions: Auction[];
  /** Сумма всех ставок, перебитые тоже: столько брендам было не жалко поставить. */
  totalCents: number;
  bids: number;
  bidders: number;
};

async function rest<T>(path: string): Promise<T | null> {
  if (!SUPABASE || !ANON) return null;
  try {
    const response = await fetch(`${SUPABASE}/rest/v1/${path}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function load(): Promise<Data | null> {
  const [things, lots, bids] = await Promise.all([
    rest<
      { id: string; slug: string; title: string; house: boolean; prepared: boolean; worn_where: string | null; model_url: string | null }[]
    >("things?active=eq.true&hidden=eq.false&select=id,slug,title,house,prepared,worn_where,model_url"),
    rest<{ id: string; thing_id: string; status: string; closes_at: string; rehearsal: boolean; thing_spots: { code: string } | null }[]>(
      "lots?select=id,thing_id,status,closes_at,rehearsal,thing_spots:spot_id(code)",
    ),
    rest<{ lot_id: string; amount_cents: number; media_url: string; bidder_wallet: string; brand: string | null }[]>(
      "lot_bids?select=lot_id,amount_cents,media_url,bidder_wallet,brand&order=amount_cents.desc",
    ),
  ]);
  if (!things || !lots || !bids) return null;

  const real = new Set(lots.filter((lot) => !lot.rehearsal).map((lot) => lot.id));
  const counted = bids.filter((bid) => real.has(bid.lot_id));
  const top = new Map<string, (typeof bids)[number]>();
  const people = new Map<string, Set<string>>();
  for (const bid of counted) {
    if (!top.has(bid.lot_id)) top.set(bid.lot_id, bid);
    const set = people.get(bid.lot_id) ?? new Set<string>();
    set.add(bid.bidder_wallet);
    people.set(bid.lot_id, set);
  }

  const auctions: Auction[] = [];
  for (const thing of things) {
    if (!thing.house && !thing.prepared) continue;
    const mine = lots.filter((lot) => lot.thing_id === thing.id && real.has(lot.id));
    const open = mine.filter((lot) => lot.status === "open" && Date.parse(lot.closes_at) > Date.now());
    const won = mine.filter((lot) => lot.status === "won" && top.has(lot.id));
    const shown = open.length ? open : won;
    if (shown.length === 0) continue;
    const wallets = new Set<string>();
    for (const lot of shown) for (const one of people.get(lot.id) ?? []) wallets.add(one);
    const winners: Auction["won"] = {};
    for (const lot of shown) {
      const lead = top.get(lot.id);
      if (lead && lot.thing_spots?.code) {
        winners[lot.thing_spots.code] = { url: lead.media_url, brand: lead.brand ?? "", cents: lead.amount_cents };
      }
    }
    auctions.push({
      id: thing.id,
      slug: thing.slug,
      title: thing.title,
      owner: OWNERS[thing.slug] ?? thing.title,
      where: thing.worn_where,
      status: open.length ? "live" : "sold",
      raisedCents: shown.reduce((sum, lot) => sum + (top.get(lot.id)?.amount_cents ?? 0), 0),
      spots: shown.length,
      bidders: wallets.size,
      closedAt: Math.max(...shown.map((lot) => Date.parse(lot.closes_at))),
      model: thing.model_url,
      won: winners,
    });
  }
  auctions.sort((a, b) => (a.status === "live" ? -1 : 0) - (b.status === "live" ? -1 : 0) || b.closedAt - a.closedAt);

  return {
    auctions,
    totalCents: counted.reduce((sum, bid) => sum + bid.amount_cents, 0),
    bids: counted.length,
    bidders: new Set(counted.map((bid) => bid.bidder_wallet)).size,
  };
}

export function usd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

export function day(at: number): string {
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
