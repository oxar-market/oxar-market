import { isOpen, myBidStates, type MyBidState, type ProfileRow, type ThingReach } from "@oxar/core";
import { loadTopBids } from "./auction.ts";
import { db } from "./session.ts";

/**
 * Профиль человека и охват вещей. Правила полей - в core (cleanProfile),
 * запреты - в базе: свою строку пишет только сам человек, имя занятое -
 * занято, связь кошелька с человеком заводит только функция входа.
 */

export type Profile = ProfileRow & { avatar_path: string | null; logo_path: string | null };

export const EMPTY: Profile = { display_name: null, brand: null, x_handle: null, avatar_path: null, logo_path: null };

/** Лицо кошелька в рейтинге - то, что человек сам решил показать. */
export type Face = Profile & { wallet: string };

/** Публичный адрес картинки из bucket faces. */
export function faceUrl(path: string | null): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return path && base ? `${base}/storage/v1/object/public/faces/${path}` : null;
}

/** Охват каждой вещи: цифра, посчитана ли она или это оценка, и имя вещи для строки пропуска. */
export type Reach = ThingReach & { title: string };

export async function loadReach(): Promise<Record<string, Reach>> {
  if (!db) return {};
  const { data } = await db.from("things").select("id, title, post_reach, post_reach_checked_at, refunded_at").not("post_reach", "is", null);
  const out: Record<string, Reach> = {};
  for (const one of data ?? []) {
    out[one.id] = { reach: one.post_reach, checked: one.post_reach_checked_at !== null, refunded: one.refunded_at !== null, title: one.title };
  }
  return out;
}

export async function loadFaces(): Promise<Record<string, Face>> {
  if (!db) return {};
  const { data } = await db.from("wallet_faces").select("wallet, display_name, brand, x_handle, avatar_path, logo_path");
  return Object.fromEntries((data ?? []).map((one) => [one.wallet, one as Face]));
}

/** Свой профиль; нет строки - пустой. */
export async function loadMyProfile(): Promise<Profile> {
  if (!db) return EMPTY;
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return EMPTY;
  const { data } = await db
    .from("public_profiles")
    .select("display_name, brand, x_handle, avatar_path, logo_path")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  return (data as Profile | null) ?? EMPTY;
}

/** Сохранить свой профиль. Ошибка - словами для человека. */
export async function saveProfile(next: Profile): Promise<string | null> {
  if (!db) return "Not connected.";
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return "Sign in again and retry.";
  const { error } = await db
    .from("public_profiles")
    .upsert({ user_id: auth.user.id, ...next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (!error) return null;
  // Уникальный индекс имени: его уже взял кто-то другой.
  if (error.code === "23505") return "That name is taken. Pick another.";
  return "Could not save. Try again.";
}

/** Картинка в свою папку bucket faces; путь или ошибка. */
export async function uploadFace(file: File, kind: "avatar" | "logo"): Promise<{ path: string } | { error: string }> {
  if (!db) return { error: "Not connected." };
  if (file.size > 2 * 1024 * 1024) return { error: "That image is over 2 MB." };
  const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[file.type];
  if (!ext) return { error: "PNG, JPG or WebP." };
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { error: "Sign in again and retry." };
  // Новое имя на каждую загрузку: старая картинка не застревает в кэше.
  const path = `${auth.user.id}/${kind}-${Date.now()}.${ext}`;
  const { error } = await db.storage.from("faces").upload(path, file, { contentType: file.type });
  return error ? { error: "Could not upload. Try again." } : { path };
}

/** Одна ставка кошелька в истории кабинета: с картинкой, местом и тем, чем она кончилась. */
export type MyBidRow = {
  lotId: string;
  thingId: string;
  thing: string;
  spot: string;
  cents: number;
  at: string;
  mediaUrl: string;
  state: MyBidState;
  /** Деньги за вещь вернули мимо программы (вещь не поехала): когда. */
  refundedAt: string | null;
};

/** Все ставки кошелька, свежие первыми. Прогоны - мимо. */
export async function loadMyHistory(wallet: string): Promise<MyBidRow[]> {
  if (!db) return [];
  const { data } = await db
    .from("lot_bids")
    .select(
      "amount_cents, created_at, media_url, lot_id, lots!inner(status, closes_at, rehearsal, thing_spots(label), things:thing_id(id, title, refunded_at))",
    )
    .eq("bidder_wallet", wallet)
    .order("created_at", { ascending: false })
    .limit(300);
  type Lot = {
    status: string;
    closes_at: string;
    rehearsal: boolean;
    thing_spots: { label?: string } | null;
    things: { id?: string; title?: string; refunded_at?: string | null } | null;
  };
  const rows = (data ?? []).filter((row) => !(row.lots as unknown as Lot).rehearsal);
  const tops = await loadTopBids([...new Set(rows.map((row) => row.lot_id))]);
  const now = Date.now();
  const lots = Object.fromEntries(
    rows.map((row) => {
      const lot = row.lots as unknown as Lot;
      return [
        row.lot_id,
        {
          open: lot.status === "open" && isOpen(Date.parse(lot.closes_at), now),
          status: lot.status,
          refunded: !!lot.things?.refunded_at,
          topWallet: tops[row.lot_id]?.bidder_wallet ?? null,
        },
      ];
    }),
  );
  const states = myBidStates(rows, lots, wallet);
  return rows.map((row, at) => {
    const lot = row.lots as unknown as Lot;
    return {
      lotId: row.lot_id,
      thingId: lot.things?.id ?? "",
      thing: lot.things?.title ?? "",
      spot: lot.thing_spots?.label ?? "?",
      cents: row.amount_cents,
      at: row.created_at,
      mediaUrl: row.media_url,
      state: states[at]!,
      refundedAt: lot.things?.refunded_at ?? null,
    };
  });
}
