/**
 * Лёгкая копия логотипа для сайта.
 *
 * Сайт показывал загруженный логотип как есть: PNG на 8 MB в 2048 px
 * скачивался на каждом просмотре, хотя сцена всё равно рисует его не крупнее
 * 1024 px. В октябре 2026 два таких файла за пять дней выбрали весь трафик
 * бесплатного Supabase. Теперь рядом с оригиналом лежит копия, в базе - ссылка
 * на неё, а оригинал остаётся для печати.
 */

/** Длинная сторона копии: крупнее сцена логотип не рисует. */
export const PREVIEW_SIDE = 1024;

/** Размер копии: длинная сторона не больше предела, пропорции те же, вверх не тянем. */
export function previewSize(width: number, height: number, side = PREVIEW_SIDE): { width: number; height: number } {
  const scale = Math.min(1, side / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Копия нужна растровым картинкам. SVG и так лёгкий, GIF потерял бы анимацию. */
export function needsPreview(ext: string): boolean {
  return ["png", "jpg", "jpeg", "webp"].includes(ext.toLowerCase());
}

/** Где лежит копия: рядом с оригиналом, с приставкой к имени. */
export function previewPath(path: string, ext: "webp" | "png"): string {
  return `${path}.view.${ext}`;
}

/** Оригинал по ссылке на копию - для печати. Ссылка без копии и есть оригинал. */
export function originalUrl(url: string): string {
  return url.replace(/\.view\.(webp|png)$/, "");
}

/**
 * Файл из нашего бакета логотипов. Ссылку на картинку в ставку пишет сам
 * участник, и подставить он может любой адрес; админу и продавцу показываем
 * и качаем только своё. Строкой, без URL: пакет не тянет платформенных API.
 */
export function isCreativeUrl(url: string, supabaseUrl: string): boolean {
  const prefix = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/creatives/`;
  if (!supabaseUrl || !url.startsWith(prefix)) return false;
  // Имя - строго наше: «папка/uuid.расширение». Запрещать «..» поштучно
  // мало: браузер выкидывает из адреса табы и переводы строк, и «.\t.»
  // стал бы «..» уже после проверки.
  return /^([A-Za-z0-9_-]+\/)?[A-Za-z0-9_-]+(\.[A-Za-z0-9]+)+$/.test(url.slice(prefix.length));
}

/** Расширение файла для архива: только картинки, остальное - png. */
export function imageExt(url: string): string {
  const ext = (url.split("?")[0]!.split("/").pop() ?? "").split(".").pop()?.toLowerCase() ?? "";
  return ["png", "jpg", "jpeg", "webp", "svg", "gif"].includes(ext) ? ext : "png";
}
