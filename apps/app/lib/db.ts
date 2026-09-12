import type { PlacementKind } from "@oxar/core";

// Читаем через REST Supabase с публичным ключом: RLS отдаёт только
// проверенных продавцов и активные листинги. Ходим напрямую, потому что
// запросов мало и они простые.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type Seller = {
  id: string;
  x_handle: string;
  display_name: string;
  follower_count: number;
  bio: string | null;
  is_org: boolean;
};

export type Listing = {
  id: string;
  kind: PlacementKind;
  price_cents: number;
  term_days: number;
  seller: Seller;
};

export type BusyRange = { start_date: string; end_date: string };

async function query<T>(path: string): Promise<T[]> {
  if (!url || !anonKey) return [];

  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    // Витрина меняется редко, но не должна отставать на часы.
    next: { revalidate: 60 },
  });

  if (!response.ok) return [];
  return (await response.json()) as T[];
}

const LISTING_FIELDS =
  "id,kind,price_cents,term_days,seller:sellers(id,x_handle,display_name,follower_count,bio,is_org)";

export function listings(kind?: PlacementKind): Promise<Listing[]> {
  const filter = kind ? `&kind=eq.${kind}` : "";
  return query<Listing>(
    `listings?select=${LISTING_FIELDS}&active=is.true${filter}&order=price_cents.desc`,
  );
}

export async function sellerByHandle(handle: string): Promise<Seller | null> {
  const rows = await query<Seller>(
    `sellers?select=id,x_handle,display_name,follower_count,bio,is_org&x_handle=ilike.${handle}`,
  );
  return rows[0] ?? null;
}

export function listingsOfSeller(sellerId: string): Promise<Listing[]> {
  return query<Listing>(
    `listings?select=${LISTING_FIELDS}&active=is.true&seller_id=eq.${sellerId}`,
  );
}

export async function listingOf(
  sellerId: string,
  kind: PlacementKind,
): Promise<Listing | null> {
  const rows = await query<Listing>(
    `listings?select=${LISTING_FIELDS}&active=is.true&seller_id=eq.${sellerId}&kind=eq.${kind}`,
  );
  return rows[0] ?? null;
}

export function busyRanges(listingId: string): Promise<BusyRange[]> {
  return query<BusyRange>(
    `listing_busy?select=start_date,end_date&listing_id=eq.${listingId}`,
  );
}
