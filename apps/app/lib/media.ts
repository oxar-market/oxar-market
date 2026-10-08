/**
 * Пруф бывает и видео: телефон пишет .mov или .mp4. Тип узнаём по
 * расширению пути - оно задаётся при загрузке из имени файла.
 */
export function isVideo(path: string): boolean {
  return /\.(mp4|mov|m4v|webm)$/i.test(path);
}
