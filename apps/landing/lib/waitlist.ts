// Одна вставка в одну таблицу — ради этого не стоит тащить в бандл клиент
// Supabase на 66 kB. Ходим в его REST напрямую.
//
// Ключ публичный по замыслу: он уезжает в браузер, а доступ ограничен RLS —
// в waitlist разрешён только insert.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type WaitlistEntry = {
  /** Что и на какой площадке человек продаёт или ищет, своими словами. */
  pitch: string;
  side: "seller" | "buyer";
  contact: string;
};

export type SubmitResult = "created" | "duplicate" | "error";

export async function submitWaitlist(entry: WaitlistEntry): Promise<SubmitResult> {
  if (!url || !anonKey) return "error";

  const response = await fetch(`${url}/rest/v1/waitlist`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(entry),
  });

  if (response.ok) return "created";
  if (response.status === 409) return "duplicate";
  return "error";
}
