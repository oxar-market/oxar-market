import type { PlacementKind } from "@oxar/core";

// Лоты и ставки. Как и витрина, читаются анонимом: RLS отдаёт лоты и суммы
// ставок всем, а контакт с креативом - только продавцу лота.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function headers() {
  return {
    apikey: anonKey ?? "",
    Authorization: `Bearer ${anonKey ?? ""}`,
    "Content-Type": "application/json",
  };
}

export type Lot = {
  id: string;
  start_date: string;
  end_date: string;
  reserve_cents: number;
  closes_at: string;
  status: string;
  listing: {
    kind: PlacementKind;
    seller: { x_handle: string; follower_count: number; is_org: boolean };
  };
};

export type PublicBid = {
  id: string;
  created_at: string;
  bidder_handle: string;
  amount_cents: number;
};

/**
 * Закрыть то, у чего вышел срок. Дёргаем перед чтением лотов: закрытие не
 * должно зависеть от того, жив ли планировщик.
 */
export async function closeDueLots(): Promise<void> {
  if (!url || !anonKey) return;
  await fetch(`${url}/rest/v1/rpc/close_due_auctions`, {
    method: "POST",
    headers: headers(),
    body: "{}",
  }).catch(() => {});
}

export async function openLots(kind: PlacementKind): Promise<Lot[]> {
  if (!url || !anonKey) return [];

  const select =
    "id,start_date,end_date,reserve_cents,closes_at,status," +
    "listing:listings!inner(kind,seller:sellers!inner(x_handle,follower_count,is_org))";
  const response = await fetch(
    `${url}/rest/v1/auctions?select=${select}&status=eq.open&listing.kind=eq.${kind}&order=closes_at`,
    { headers: headers() },
  );

  if (!response.ok) return [];
  return (await response.json()) as Lot[];
}

export async function lotBids(lotId: string): Promise<PublicBid[]> {
  if (!url || !anonKey) return [];

  const response = await fetch(
    `${url}/rest/v1/bids?select=id,created_at,bidder_handle,amount_cents&auction_id=eq.${lotId}&order=amount_cents.desc,created_at.asc`,
    { headers: headers() },
  );

  if (!response.ok) return [];
  return (await response.json()) as PublicBid[];
}

export type NewBid = {
  auction_id: string;
  bidder_handle: string;
  bidder_contact: string | null;
  amount_cents: number;
  creative_url: string | null;
  creative_text: string | null;
};

/**
 * Поставить. Проверки шага и срока живут в базе, поэтому её отказ - это не
 * ошибка связи, а ответ: «поздно» или «мало».
 */
export async function placeBid(
  bid: NewBid,
): Promise<"placed" | "closed" | "low" | "error"> {
  if (!url || !anonKey) return "error";

  const response = await fetch(`${url}/rest/v1/bids`, {
    method: "POST",
    headers: { ...headers(), Prefer: "return=minimal" },
    body: JSON.stringify(bid),
  });

  if (response.ok) return "placed";

  const text = await response.text();
  if (text.includes("has closed") || text.includes("not taking bids")) return "closed";
  if (text.includes("bid must be at least")) return "low";
  return "error";
}
