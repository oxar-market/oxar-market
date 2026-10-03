/**
 * Запись пруфа, по которой считается его хеш.
 *
 * Хеш уходит в программу эскроу, сам пруф лежит у нас. Сверить их можно,
 * только если одна и та же запись всегда даёт одну и ту же строку: фото -
 * по алфавиту (порядок загрузки случаен), ссылки - в порядке продавца, без
 * пустых, текст - без пробелов по краям.
 */
export type ProofParts = { photos: string[]; links: string[]; note: string };

/**
 * Пруф в том виде, в каком его хранят и хешируют: фото по алфавиту, ссылки без
 * пустых и пробелов, текст без пробелов по краям. Хранить надо ровно это -
 * иначе запись в базе разойдётся с хешем в программе.
 */
export function normalizeProof(parts: ProofParts): ProofParts {
  return {
    photos: [...parts.photos].sort(),
    links: parts.links.map((one) => one.trim()).filter((one) => one.length > 0),
    note: parts.note.trim(),
  };
}

export function proofPayload(parts: ProofParts): string {
  const clean = normalizeProof(parts);
  return JSON.stringify({ photos: clean.photos, links: clean.links, note: clean.note });
}
