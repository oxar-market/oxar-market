/** Правила X: латиница, цифры, подчёркивание, до 15 символов. */
export const HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/;

/** Убирает пробелы, ведущую @ и остаток ссылки на профиль. */
export function normalizeHandle(input: string): string {
  return input
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?(x|twitter)\.com\//i, "")
    .replace(/^@/, "")
    .split(/[/?]/)[0]!
    .trim();
}

export function isValidHandle(input: string): boolean {
  return HANDLE_PATTERN.test(normalizeHandle(input));
}
