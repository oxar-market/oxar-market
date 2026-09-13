// Счёт в игре. Пишется анонимом, как заявка в вейтлист: RLS разрешает вставку и
// чтение, но не правку - в списке остаётся лучшая попытка, а не последняя.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function headers() {
  return {
    apikey: anonKey ?? "",
    Authorization: `Bearer ${anonKey ?? ""}`,
    "Content-Type": "application/json",
  };
}

export type Score = { x_handle: string; score: number };

/** Топ игроков: по одной, лучшей попытке на хэндл. */
export async function topScores(limit = 10): Promise<Score[]> {
  if (!url || !anonKey) return [];

  // Берём с запасом и сворачиваем по хэндлу здесь: в PostgREST такой группировки
  // нет, а заводить представление ради пасхалки не стоит.
  const response = await fetch(
    `${url}/rest/v1/game_scores?select=x_handle,score&order=score.desc,created_at.asc&limit=${limit * 5}`,
    { headers: headers() },
  );
  if (!response.ok) return [];

  const rows = (await response.json()) as Score[];
  const best = new Map<string, number>();
  for (const row of rows) {
    const handle = row.x_handle.toLowerCase();
    if (!best.has(handle) || row.score > best.get(handle)!) {
      best.set(handle, row.score);
    }
  }

  return [...best.entries()]
    .map(([x_handle, score]) => ({ x_handle, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function postScore(
  handle: string,
  score: number,
): Promise<"saved" | "error"> {
  if (!url || !anonKey) return "error";

  const response = await fetch(`${url}/rest/v1/game_scores`, {
    method: "POST",
    headers: { ...headers(), Prefer: "return=minimal" },
    body: JSON.stringify({ x_handle: handle, score }),
  });

  return response.ok ? "saved" : "error";
}
