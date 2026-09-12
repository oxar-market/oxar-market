// Контакт в заявке: почта или телеграм. Поле необязательное, но если человек
// что-то ввёл, это должно быть чем-то, куда реально можно написать. "123" -
// не контакт, а мусор в базе.

// У почты обязателен домен с точкой и внятной зоной, у телеграма - собачка.
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]{2,})+$/;
const TELEGRAM = /^@[A-Za-z][A-Za-z0-9_]{4,31}$/;

export type ContactKind = "email" | "telegram";

/** Убирает обёртку вида https://t.me/name и ведущую @ у телеграма. */
export function normalizeContact(input: string): string {
  const trimmed = input.trim();
  const fromLink = trimmed.replace(
    /^(https?:\/\/)?(www\.)?(t\.me|telegram\.me)\//i,
    "@",
  );
  return fromLink;
}

export function contactKind(input: string): ContactKind | null {
  const value = normalizeContact(input);
  if (EMAIL.test(value)) return "email";
  if (TELEGRAM.test(value)) return "telegram";
  return null;
}

export function isValidContact(input: string): boolean {
  return contactKind(input) !== null;
}
