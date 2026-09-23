/**
 * Пуши о перебитой ставке: подписка устройства и её снятие.
 *
 * Пуш - единственный способ докричаться до человека, который закрыл вкладку:
 * ставку перебивают в его отсутствие, и без этого он узнаёт о проигрыше
 * тогда, когда вернуть место уже поздно.
 *
 * Разрешение спрашивается только по нажатию колокольчика, не с порога: браузер
 * карает за навязчивость тем, что прячет запрос навсегда, а человек - тем,
 * что жмёт «нет» не глядя.
 *
 * Воркер здесь регистрируется, а живёт в public/push-worker.js - глухой ко
 * всему, кроме приёма пуша.
 */
import { db } from "./session.ts";

const WORKER = "/push-worker.js";
const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type PushState = "unsupported" | "denied" | "off" | "on";

/** Что сейчас с пушами на этом устройстве. */
export async function pushState(): Promise<PushState> {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window) ||
    !KEY
  ) {
    return "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  const worker = await navigator.serviceWorker.getRegistration(WORKER);
  const holding = await worker?.pushManager.getSubscription();
  return holding ? "on" : "off";
}

/** Подписать это устройство. Возвращает новое состояние. */
export async function enablePush(): Promise<PushState> {
  if (!db) return "unsupported";
  const { data } = await db.auth.getUser();
  if (!data.user) return "off";

  const worker = await navigator.serviceWorker.register(WORKER);
  const allowed = await Notification.requestPermission();
  if (allowed !== "granted") return allowed === "denied" ? "denied" : "off";

  const holding =
    (await worker.pushManager.getSubscription()) ??
    (await worker.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: serverKey(),
    }));

  const raw = holding.toJSON();
  if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys?.auth) return "off";

  const { error } = await db.from("push_subscriptions").upsert(
    {
      user_id: data.user.id,
      endpoint: raw.endpoint,
      p256dh: raw.keys.p256dh,
      auth: raw.keys.auth,
    },
    { onConflict: "endpoint" },
  );
  return error ? "off" : "on";
}

/** Снять подписку этого устройства. */
export async function disablePush(): Promise<PushState> {
  const worker = await navigator.serviceWorker.getRegistration(WORKER);
  const holding = await worker?.pushManager.getSubscription();
  if (holding) {
    if (db) await db.from("push_subscriptions").delete().eq("endpoint", holding.endpoint);
    await holding.unsubscribe();
  }
  return "off";
}

/** Ключ сервера в байтах: браузер принимает его только так. */
function serverKey(): Uint8Array<ArrayBuffer> {
  const plain = (KEY + "=".repeat((4 - (KEY.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const bytes = atob(plain);
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  for (let at = 0; at < bytes.length; at += 1) out[at] = bytes.charCodeAt(at);
  return out;
}
