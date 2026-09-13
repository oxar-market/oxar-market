// Счёт в игре. Читается всеми, а пишется только через функцию в базе: она и
// держит правило «одно имя - одна строка, остаётся лучший результат». Прямая
// вставка анониму закрыта, иначе правило можно было бы обойти запросом.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function headers() {
  return {
    apikey: anonKey ?? "",
    Authorization: `Bearer ${anonKey ?? ""}`,
    "Content-Type": "application/json",
  };
}

export type Score = { telegram: string; score: number };

/** Топ игроков. Сворачивать по имени не нужно: в базе одно имя - одна строка. */
export async function topScores(limit = 10): Promise<Score[]> {
  if (!url || !anonKey) return [];

  const response = await fetch(
    `${url}/rest/v1/game_scores?select=telegram,score&order=score.desc,created_at.asc&limit=${limit}`,
    { headers: headers() },
  );
  if (!response.ok) return [];
  return (await response.json()) as Score[];
}

/**
 * Отправить счёт. Возвращает результат, который остался в таблице: если прошлая
 * попытка была лучше, в списке останется она.
 */
export async function postScore(
  handle: string,
  score: number,
): Promise<{ ok: true; kept: number } | { ok: false }> {
  if (!url || !anonKey) return { ok: false };

  const response = await fetch(`${url}/rest/v1/rpc/submit_score`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ handle, value: score }),
  });

  if (!response.ok) return { ok: false };
  const kept = (await response.json()) as number;
  return { ok: true, kept };
}
