// Число подписчиков из того, что человек набрал руками: "12 400", "12,400",
// "12.4k", "1.2M". Буквы без числа - не подписчики.

/** Выше этого - не аккаунт, а опечатка: у самых крупных профилей меньше. */
export const MAX_FOLLOWERS = 500_000_000;

export function parseFollowers(input: string): number | null {
  const value = input.trim().toLowerCase().replace(/[\s,]/g, "");
  if (!value) return null;

  const match = /^(\d+(?:\.\d+)?)([km])?$/.exec(value);
  if (!match) return null;

  const amount = Number.parseFloat(match[1]!);
  if (!Number.isFinite(amount)) return null;

  const scale = match[2] === "k" ? 1_000 : match[2] === "m" ? 1_000_000 : 1;
  const total = Math.round(amount * scale);

  if (total < 0 || total > MAX_FOLLOWERS) return null;
  return total;
}
