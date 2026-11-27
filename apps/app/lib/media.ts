/**
 * Пруф бывает и видео: телефон пишет .mov или .mp4. Тип узнаём по
 * расширению пути - оно задаётся при загрузке из имени файла.
 */
export function isVideo(path: string): boolean {
  return /\.(mp4|mov|m4v|webm)$/i.test(path);
}

/**
 * Копия фото итогов в сборке сайта (public/site/proof): фото сжаты в webp,
 * видео пережаты в mp4 720p. Оригиналы в хранилище тяжёлые (видео до 47 МБ),
 * а трафик Supabase на бесплатном плане уже кончался. Копии нет - null, и
 * страница берёт оригинал.
 */
export function proofCopy(url: string): string | null {
  const found = url.match(/\/storage\/v1\/object\/public\/things\/proof\/(.+)\.([a-z0-9]+)$/i);
  if (!found) return null;
  return `/site/proof/${found[1]!.replaceAll("/", "-")}.${isVideo(url) ? "mp4" : "webp"}`;
}
