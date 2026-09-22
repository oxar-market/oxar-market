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
 * Своё имя в таблице: ключ, которым мы его заняли, и лучший результат под ним.
 *
 * Ключ придумывает браузер и держит у себя - в базе лежит только его sha256.
 * Поэтому улучшить свой результат можно с того же устройства, а чужое имя не
 * перепишешь, даже зная его. Другого способа подтвердить владение телеграм-именем
 * без бота у нас нет.
 */
const MINE = "oxar.flappy.mine";

export type Mine = { handle: string; key: string; best: number };

export function readMine(): Mine | null {
  try {
    const raw = window.localStorage.getItem(MINE);
    return raw ? (JSON.parse(raw) as Mine) : null;
  } catch {
    // Приватный режим и запрет хранилища: играть можно, рекорд не запомнится
    return null;
  }
}

function remember(mine: Mine): void {
  try {
    window.localStorage.setItem(MINE, JSON.stringify(mine));
  } catch {
    // см. readMine
  }
}

function freshKey(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

/**
 * Отправить счёт. Возвращает лучший результат, который остался в таблице: если
 * прошлая попытка была выше, останется она.
 */
export async function postScore(
  handle: string,
  score: number,
): Promise<{ ok: true; kept: number } | { ok: false; reason: "taken" | "error" }> {
  if (!url || !anonKey) return { ok: false, reason: "error" };

  const mine = readMine();
  // Ключ от этого имени, если оно уже наше. Для нового имени - новый ключ.
  const key =
    mine && mine.handle.toLowerCase() === handle.toLowerCase() ? mine.key : freshKey();

  const response = await fetch(`${url}/rest/v1/rpc/submit_score`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ handle, value: score, claim: key }),
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, reason: text.includes("name is taken") ? "taken" : "error" };
  }

  const kept = (await response.json()) as number;
  remember({ handle, key, best: kept });
  return { ok: true, kept };
}
