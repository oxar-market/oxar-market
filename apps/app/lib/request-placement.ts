// Заявка на размещение. RLS разрешает анониму только insert со статусом
// requested — согласовывает её продавец, не платформа.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type PlacementRequest = {
  listing_id: string;
  buyer_handle: string;
  buyer_contact: string | null;
  creative_text: string | null;
  start_date: string;
  end_date: string;
  price_cents: number;
};

export type RequestResult = "created" | "error";

export async function requestPlacement(
  request: PlacementRequest,
): Promise<RequestResult> {
  if (!url || !anonKey) return "error";

  const response = await fetch(`${url}/rest/v1/bookings`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ ...request, status: "requested" }),
  });

  return response.ok ? "created" : "error";
}

/** Конец срока включительно: старт 10-го на 7 дней — это по 16-е. */
export function endDate(start: string, days: number): string {
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days - 1);
  return date.toISOString().slice(0, 10);
}
