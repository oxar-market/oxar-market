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
