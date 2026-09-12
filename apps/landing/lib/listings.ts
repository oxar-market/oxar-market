import type { PlacementKind } from "@oxar/core";

// Витрина публичная: RLS отдаёт анониму только проверенных продавцов и активные
// листинги, поэтому ходим в REST Supabase прямо из браузера, без своего бэкенда.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type Offer = {
  id: string;
  kind: PlacementKind;
  price_cents: number;
  term_days: number;
  seller: {
    x_handle: string;
    display_name: string;
    follower_count: number;
    is_org: boolean;
  };
};

export async function offersFor(kind: PlacementKind): Promise<Offer[]> {
  if (!url || !anonKey) return [];

  const select =
    "id,kind,price_cents,term_days,seller:sellers(x_handle,display_name,follower_count,is_org)";
  const response = await fetch(
    `${url}/rest/v1/listings?select=${select}&active=is.true&kind=eq.${kind}&order=price_cents.desc`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } },
  );

  if (!response.ok) return [];
  return (await response.json()) as Offer[];
}
