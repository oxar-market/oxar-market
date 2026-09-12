// Загрузка креатива в Supabase Storage. Ключ публичный, но политика пускает
// только в bucket creatives, а сам bucket ограничен по размеру и типу файла.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const BUCKET = "creatives";

/** То же, что разрешено на стороне bucket: проверяем до отправки, чтобы
 *  человек увидел причину сразу, а не после загрузки восьми мегабайт. */
export const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
];
export const MAX_BYTES = 8 * 1024 * 1024;

export type UploadResult =
  | { ok: true; url: string }
  | { ok: false; reason: "type" | "size" | "failed" };

export async function uploadCreative(file: File): Promise<UploadResult> {
  if (!ALLOWED_TYPES.includes(file.type)) return { ok: false, reason: "type" };
  if (file.size > MAX_BYTES) return { ok: false, reason: "size" };
  if (!url || !anonKey) return { ok: false, reason: "failed" };

  const extension = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  // Имя случайное: одинаковые "banner.png" от разных людей не должны
  // затирать друг друга.
  const path = `${crypto.randomUUID()}.${extension}`;

  const response = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": file.type,
      "x-upsert": "false",
    },
    body: file,
  });

  if (!response.ok) return { ok: false, reason: "failed" };
  return { ok: true, url: `${url}/storage/v1/object/public/${BUCKET}/${path}` };
}
