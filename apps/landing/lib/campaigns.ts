// Заявка на кампанию. Одна вставка в одну таблицу, как и вейтлист: ходим в
// REST Supabase напрямую, ключ публичный по замыслу, доступ ограничен RLS -
// в campaigns разрешён только insert.

import type { PlacementKind } from "@oxar/core";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type CampaignRequest = {
  placement: PlacementKind;
  placements_wanted: number;
  min_followers: number | null;
  term_days: number;
  budget_cents: number;
  contact: string;
  notes: string | null;
};

export async function submitCampaign(
  request: CampaignRequest,
): Promise<"created" | "error"> {
  if (!url || !anonKey) return "error";

  const response = await fetch(`${url}/rest/v1/campaigns`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(request),
  });

  return response.ok ? "created" : "error";
}
