"use client";

import { db } from "./session.ts";

/**
 * Что показывает экран торга: вещь, её места, открытые лоты и ставки.
 *
 * Всё это витрина, и она открыта всем: политики на чтение в схеме стоят без
 * условия на вошедшего. Гость должен увидеть, за что идёт борьба, раньше чем у
 * него спросят, кто он.
 *
 * Запросы живут в приложении, а не в packages/core: там только правила и
 * вычисления. Когда за теми же данными придёт мобильное приложение, отсюда
 * вырастет отдельный пакет - но не раньше, чем появится второй потребитель.
 */

export type Thing = {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
};

export type Lot = {
  id: string;
  spot_id: string;
  /** Код места: по нему лот находит своё пятно на модели. */
  spot_code: string;
  status: string;
  reserve_cents: number;
  min_step_cents: number;
  /** Когда торг начинается. Пусто - уже начался. */
  opens_at: string | null;
  closes_at: string;
};

export type Bid = {
  id: string;
  created_at: string;
  lot_id: string;
  bidder_wallet: string;
  amount_cents: number;
  media_url: string;
  /** Чьё это лого. */
  brand: string;
};

/** Имя вещи в адресе. Пока она одна, и это её код в каталоге. */
export const THING_SLUG = "superteam-ua-tee";

/**
 * Вещь и её торги одним заходом.
 *
 * Возвращает и те места, у которых торга нет: место без лота - это «пока не
 * продаётся», и на вещи оно всё равно нарисовано. Молчать о нём значило бы
 * показать футболку, у которой часть пятен необъяснимо пропала.
 */
export async function loadThing(): Promise<{
  thing: Thing;
  lots: Lot[];
} | null> {
  if (!db) return null;

  const { data: thing } = await db
    .from("things")
    .select("id, slug, title, tagline")
    .eq("slug", THING_SLUG)
    .maybeSingle();
  // Вещи в каталоге нет - значит и торгов нет. Это не сбой: так выглядит
  // момент между выкаткой экрана и заведением первого лота.
  if (!thing) return null;

  // Места нужны только затем, чтобы перевести spot_id лота в код места:
  // разметка на модели знает коды, а лот ссылается на строку каталога.
  const { data: spots } = await db
    .from("thing_spots")
    .select("id, code")
    .eq("thing_id", thing.id);

  const { data: lots } = await db
    .from("lots")
    .select(
      "id, spot_id, status, reserve_cents, min_step_cents, opens_at, closes_at",
    )
    .eq("thing_id", thing.id)
    .eq("status", "open");

  const codeOf = new Map((spots ?? []).map((spot) => [spot.id, spot.code]));

  return {
    thing: thing as Thing,
    lots: (lots ?? []).flatMap((lot) => {
      const spot_code = codeOf.get(lot.spot_id);
      // Лот на место, которого нет в каталоге, показать негде. База такого не
      // допустит - внешний ключ, - но данные могли приехать из будущего, где
      // место убрали.
      return spot_code ? [{ ...lot, spot_code } as Lot] : [];
    }),
  };
}

/** Ставки лота: от высокой к низкой, как их и читают. */
export async function loadBids(lotId: string): Promise<Bid[]> {
  if (!db) return [];

  const { data } = await db
    .from("lot_bids")
    .select(
      "id, created_at, lot_id, bidder_wallet, amount_cents, media_url, brand",
    )
    .eq("lot_id", lotId)
    .order("amount_cents", { ascending: false })
    .order("created_at", { ascending: true });

  return (data ?? []) as Bid[];
}

/** Верхние ставки всех лотов разом: для кружков в списке мест. */
export async function loadTopBids(
  lotIds: string[],
): Promise<Record<string, Bid | undefined>> {
  if (!db || lotIds.length === 0) return {};

  const { data } = await db
    .from("lot_bids")
    .select(
      "id, created_at, lot_id, bidder_wallet, amount_cents, media_url, brand",
    )
    .in("lot_id", lotIds)
    .order("amount_cents", { ascending: false });

  const top: Record<string, Bid | undefined> = {};
  for (const bid of (data ?? []) as Bid[]) {
    // Строки идут от высокой к низкой, поэтому первая встреченная для лота -
    // и есть верхняя.
    if (!top[bid.lot_id]) top[bid.lot_id] = bid;
  }
  return top;
}

/** Где я стою на лоте: живая ставка или строка истории. */
export type MyStand = {
  lotId: string;
  /** Подпись места: «04». */
  spot: string;
  /** Код места: по нему кнопка «перебить» открывает торг сразу на нём. */
  code: string;
  thing: string;
  closesAt: string;
  /** Торг ещё идёт. */
  open: boolean;
  mineCents: number;
  topCents: number;
  /** Кто лидирует: имя бренда из верхней ставки. */
  leaderBrand: string;
  leading: boolean;
  won: boolean;
};

/**
 * Все лоты, где человек ставил: по одной строке на лот, моя верхняя ставка
 * против верхней ставки лота. Открытые - это «мои ставки», закрытые - история.
 */
export async function loadMyStands(wallet: string): Promise<MyStand[]> {
  if (!db) return [];

  const { data } = await db
    .from("lot_bids")
    .select(
      "amount_cents, lot_id, lots!inner(status, closes_at, thing_spots(code, label), things:thing_id(title))",
    )
    .eq("bidder_wallet", wallet)
    .order("amount_cents", { ascending: false })
    .limit(300);
  if (!data) return [];

  // Моя верхняя по каждому лоту: строки уже от высокой к низкой.
  const mine = new Map<string, (typeof data)[number]>();
  for (const row of data) if (!mine.has(row.lot_id)) mine.set(row.lot_id, row);

  const tops = await loadTopBids([...mine.keys()]);
  const now = Date.now();

  return [...mine.values()].map((row) => {
    const lot = row.lots as unknown as {
      status: string;
      closes_at: string;
      thing_spots: { code?: string; label?: string } | null;
      things: { title?: string } | null;
    };
    const top = tops[row.lot_id];
    const open = lot.status === "open" && Date.parse(lot.closes_at) > now;
    const leading = top?.bidder_wallet === wallet;
    return {
      lotId: row.lot_id,
      spot: lot.thing_spots?.label ?? "?",
      code: lot.thing_spots?.code ?? "",
      thing: lot.things?.title ?? "",
      closesAt: lot.closes_at,
      open,
      mineCents: row.amount_cents,
      topCents: top?.amount_cents ?? row.amount_cents,
      leaderBrand: top?.brand ?? "",
      leading,
      won: !open && lot.status === "won" && leading,
    };
  });
}

/**
 * Положить креатив в хранилище.
 *
 * Уезжает он до отправки транзакции, а не после: у ставки в базе картинка
 * обязательна, и узнать её адрес надо раньше, чем появится строка. Если
 * ставка потом не пройдёт, в хранилище останется никому не нужный файл - это
 * дешевле, чем ставка в цепочке, к которой нечего напечатать.
 */
export async function uploadCreative(
  lotId: string,
  file: File,
): Promise<string | null> {
  if (!db) return null;

  const dot = file.name.lastIndexOf(".");
  const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : "png";
  const path = `${lotId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await db.storage
    .from("creatives")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) return null;

  return db.storage.from("creatives").getPublicUrl(path).data.publicUrl;
}

/**
 * Записать ставку, которая уже прошла в цепочке.
 *
 * База здесь витрина, а не касса: деньги лежат в программе, и подпись в строке
 * - это то, по чему ставку можно проверить, не веря нам на слово. Поэтому
 * запись идёт последней, и её неудача денег не трогает.
 */
export async function recordBid(bid: {
  lotId: string;
  wallet: string;
  amountCents: number;
  mediaUrl: string;
  brand: string;
  signature: string;
}): Promise<boolean> {
  if (!db) return false;

  const { data } = await db.auth.getUser();
  if (!data.user) return false;

  const { error } = await db.from("lot_bids").insert({
    lot_id: bid.lotId,
    bidder: data.user.id,
    bidder_wallet: bid.wallet,
    amount_cents: bid.amountCents,
    media_url: bid.mediaUrl,
    brand: bid.brand,
    signature: bid.signature,
  });

  return !error;
}


/**
 * Один торг в хронике: группа мест, закрывшихся - или закрывающихся - в одну
 * секунду. Отдельной таблицы торгов в базе нет намеренно: торг и есть общий
 * срок, по нему группа и собирается.
 */
export type PastOrPlanned = {
  title: string;
  opensAt: string | null;
  closesAt: string;
  spots: number;
  rented: number;
  state: "upcoming" | "live" | "ended";
};

/**
 * Хроника торгов вещи: будущие, идущий, прошедшие.
 *
 * Черновики и отменённые не показываются: первые ещё не торги, вторые -
 * уже не торги. Хроника отвечает на два вопроса, ради которых её открывают:
 * «что здесь было» и «когда следующий».
 */
export async function loadTimeline(): Promise<PastOrPlanned[]> {
  if (!db) return [];

  const { data } = await db
    .from("lots")
    .select("status, opens_at, closes_at, things:thing_id(title)")
    .neq("status", "draft")
    .neq("status", "cancelled")
    .order("closes_at", { ascending: false })
    .limit(200);
  if (!data) return [];

  const groups = new Map<string, PastOrPlanned>();
  const now = Date.now();
  for (const lot of data) {
    // Секундной точности достаточно: места одного торга открываются пачкой,
    // а разные торги не заканчиваются в одну секунду.
    const key = lot.closes_at.slice(0, 19);
    const known =
      groups.get(key) ??
      ({
        title: (lot.things as unknown as { title?: string } | null)?.title ?? "",
        opensAt: lot.opens_at,
        closesAt: lot.closes_at,
        spots: 0,
        rented: 0,
        state:
          Date.parse(lot.closes_at) <= now
            ? "ended"
            : lot.opens_at && Date.parse(lot.opens_at) > now
              ? "upcoming"
              : "live",
      } satisfies PastOrPlanned);
    known.spots += 1;
    if (lot.status === "won") known.rented += 1;
    groups.set(key, known);
  }

  return [...groups.values()];
}
