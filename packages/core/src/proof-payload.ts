/**
 * Запись пруфа, по которой считается его хеш.
 *
 * Хеш уходит в программу эскроу, сам пруф лежит у нас. Сверить их можно,
 * только если одна и та же запись всегда даёт одну и ту же строку: фото -
 * по алфавиту (порядок загрузки случаен), ссылки - в порядке продавца, без
 * пустых, текст - без пробелов по краям.
 */
export type ProofParts = { photos: string[]; links: string[]; note: string };

export function proofPayload(parts: ProofParts): string {
  return JSON.stringify({
    photos: [...parts.photos].sort(),
    links: parts.links.map((one) => one.trim()).filter((one) => one.length > 0),
    note: parts.note.trim(),
  });
}
