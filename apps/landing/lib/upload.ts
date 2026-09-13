"use client";

// Загрузка креатива в Supabase Storage. Класть файлы может тот же, кто может
// подать заявку, - политика пускает только одобренный аккаунт и только в
// bucket creatives, а сам bucket ограничен по размеру и типу файла.

import { auth } from "./auth";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

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
  if (!auth || !url) return { ok: false, reason: "failed" };

  const extension = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  // Имя случайное: одинаковые "banner.png" от разных людей не должны
  // затирать друг друга.
  const path = `${crypto.randomUUID()}.${extension}`;

  const { error } = await auth.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) return { ok: false, reason: "failed" };
  return { ok: true, url: `${url}/storage/v1/object/public/${BUCKET}/${path}` };
}
