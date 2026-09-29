"use client";

import { db } from "./session.ts";

/**
 * Кабинет продавца: его вещи, места на фото, цены, заявки и оценки.
 *
 * Всё, что здесь пишется, проверяет сама база (миграция sellers): завести
 * вещь может только одобренный продавец, вещь рождается скрытой, заявку
 * решает только владелец места. Экран лишь не показывает кнопки тем, кому
 * база всё равно откажет.
 */

/** Прямоугольник места на снимке: доли сторон кадра, от левого верхнего. */
export type Rect = { x: number; y: number; w: number; h: number };

export type ThingState = "live" | "rented" | "idle" | "preparing";

export type SellerThing = {
  id: string;
  title: string;
  /** Первый снимок - обложка строки. */
  cover: string | null;
  state: ThingState;
  spots: number;
  /** Сколько мест с открытым торгом получили хоть одну ставку. */
  bidSpots: number;
  /** Сколько мест сейчас в аренде. */
  rentedSpots: number;
  /** Ближайшее закрытие открытого торга. */
  closesAt: string | null;
  /** До какого дня тянется самая поздняя аренда. */
  rentedUntil: string | null;
};

export type SellerRequest = {
  id: string;
  spotLabel: string;
  spotRect: Rect | null;
  thingTitle: string;
  thingPhoto: string | null;
  buyerWallet: string;
  buyerRating: number | null;
  buyerDeals: number;
  artworkUrl: string;
  startsOn: string;
  endsOn: string;
  pricePerDayCents: number;
  answerBy: string;
};

export type Score = { rating: number | null; deals: number };

/** Публичный адрес снимка в хранилище. */
export function photoUrl(path: string): string {
  // Снимки наших вещей лежат в самом приложении: путь от корня.
  if (path.startsWith("/")) return path;
  if (!db) return path;
  return db.storage.from("things").getPublicUrl(path).data.publicUrl;
}

/** Одобрен ли вошедший как продавец. Нет сессии - не продавец. */
export async function amISeller(): Promise<boolean> {
  if (!db) return false;
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return false;
  const { data } = await db
    .from("profiles")
    .select("is_seller")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  return data?.is_seller === true;
}

export async function loadSellerScore(): Promise<Score> {
  if (!db) return { rating: null, deals: 0 };
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { rating: null, deals: 0 };
  const { data } = await db
    .from("seller_scores")
    .select("rating, deals")
    .eq("seller", auth.user.id)
    .maybeSingle();
  return {
    rating: data?.rating === null || data?.rating === undefined ? null : Number(data.rating),
    deals: data?.deals ?? 0,
  };
}

/**
 * Вещи продавца со статусом одной строкой.
 *
 * Статус выводится из данных, а не хранится: торг открыт - live, есть
 * одобренная аренда в сроке - rented, листинг собирается - preparing, иначе
 * idle. Хранимый статус разошёлся бы с лотами при первом же закрытии.
 */
export async function loadSellerThings(): Promise<SellerThing[]> {
  if (!db) return [];
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return [];

  const { data: things } = await db
    .from("things")
    .select("id, title, stage, photos, created_at, thing_spots(id), lots(id, status, closes_at)")
    .eq("seller", auth.user.id)
    // Наши вещи (футболка) записаны на владельца площадки ради оценок, но
    // ведутся миграциями и скриптами, а не кабинетом.
    .eq("house", false)
    .order("created_at", { ascending: true });
  if (!things) return [];

  const spotIds = things.flatMap((one) =>
    ((one.thing_spots as { id: string }[] | null) ?? []).map((spot) => spot.id),
  );
  const openLots = things.flatMap((one) =>
    ((one.lots as { id: string; status: string }[] | null) ?? [])
      .filter((lot) => lot.status === "open")
      .map((lot) => lot.id),
  );

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: rents }, { data: bids }] = await Promise.all([
    spotIds.length
      ? db
          .from("rent_requests")
          .select("spot_id, ends_on, starts_on")
          .in("spot_id", spotIds)
          .eq("status", "approved")
          .gte("ends_on", today)
      : Promise.resolve({ data: [] as { spot_id: string; ends_on: string; starts_on: string }[] }),
    openLots.length
      ? db.from("lot_bids").select("lot_id").in("lot_id", openLots)
      : Promise.resolve({ data: [] as { lot_id: string }[] }),
  ]);
  const bidLots = new Set((bids ?? []).map((one) => one.lot_id));

  return things.map((one) => {
    const spots = (one.thing_spots as { id: string }[] | null) ?? [];
    const lots = (one.lots as { id: string; status: string; closes_at: string }[] | null) ?? [];
    const open = lots.filter((lot) => lot.status === "open");
    const mine = new Set(spots.map((spot) => spot.id));
    const rented = (rents ?? []).filter((rent) => mine.has(rent.spot_id));
    const photos = (one.photos as string[] | null) ?? [];
    const state: ThingState =
      one.stage === "preparing"
        ? "preparing"
        : open.length > 0
          ? "live"
          : rented.length > 0
            ? "rented"
            : "idle";
    return {
      id: one.id,
      title: one.title,
      cover: photos[0] ? photoUrl(photos[0]) : null,
      state,
      spots: spots.length,
      bidSpots: open.filter((lot) => bidLots.has(lot.id)).length,
      rentedSpots: new Set(rented.map((rent) => rent.spot_id)).size,
      closesAt: open.length
        ? open.map((lot) => lot.closes_at).sort()[0]
        : null,
      rentedUntil: rented.length
        ? rented.map((rent) => rent.ends_on).sort().at(-1) ?? null
        : null,
    };
  });
}

/**
 * Прислать вещь: снимки в хранилище, строку вещи, места на первом снимке.
 *
 * Имя вещи ставим мы, когда собираем листинг: в потоке продавца его нет, и
 * до тех пор вещь зовётся по номеру.
 */
export async function sendThing(
  // Снимок - либо файл с камеры, либо путь уже в хранилище: так приходят
  // снимки, которые телефон сдал десктопу.
  photos: (Blob | string)[],
  spots: Rect[],
  /** Кошелёк продавца: им вещь подписана на маркете, пока нет никнейма. */
  wallet: string | null,
): Promise<boolean> {
  if (!db || photos.length === 0 || spots.length === 0) return false;
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return false;
  const owner = auth.user.id;

  const { count } = await db
    .from("things")
    .select("id", { count: "exact", head: true })
    .eq("seller", owner)
    .eq("house", false);
  const number = (count ?? 0) + 1;
  const id = crypto.randomUUID();

  const paths: string[] = [];
  for (const [at, photo] of photos.entries()) {
    if (typeof photo === "string") {
      paths.push(photo);
      continue;
    }
    const path = `${owner}/${id}/${at}.jpg`;
    const { error } = await db.storage
      .from("things")
      .upload(path, photo, { contentType: photo.type || "image/jpeg", upsert: false });
    if (error) return false;
    paths.push(path);
  }

  const { error: thingError } = await db.from("things").insert({
    id,
    slug: `thing-${id.slice(0, 8)}`,
    title: `New thing No. ${number}`,
    model_url: "",
    // Видна всем сразу: продавцов одобряем мы, по заявке. Убрать вещь с
    // маркета может админ.
    active: true,
    stage: "ready",
    seller: owner,
    seller_wallet: wallet,
    photos: paths,
  });
  if (thingError) return false;

  const { error: spotError } = await db.from("thing_spots").insert(
    spots.map((rect, at) => ({
      thing_id: id,
      code: `spot_${at + 1}`,
      label: `Spot ${at + 1}`,
      sort: at + 1,
      photo: 0,
      ...rect,
    })),
  );
  return !spotError;
}

/** Вещь с местами для экрана цен. */
export type PricingThing = {
  id: string;
  title: string;
  cover: string | null;
  spots: { id: string; label: string; rect: Rect | null }[];
};

export async function loadPricingThing(thingId: string): Promise<PricingThing | null> {
  if (!db) return null;
  const { data } = await db
    .from("things")
    .select("id, title, photos, thing_spots(id, label, sort, x, y, w, h)")
    .eq("id", thingId)
    .maybeSingle();
  if (!data) return null;
  const photos = (data.photos as string[] | null) ?? [];
  const spots = ((data.thing_spots as {
    id: string; label: string; sort: number;
    x: number | null; y: number | null; w: number | null; h: number | null;
  }[] | null) ?? [])
    .sort((a, b) => a.sort - b.sort)
    .map((spot) => ({
      id: spot.id,
      label: spot.label,
      rect:
        spot.x === null || spot.y === null || spot.w === null || spot.h === null
          ? null
          : { x: spot.x, y: spot.y, w: spot.w, h: spot.h },
    }));
  return {
    id: data.id,
    title: data.title,
    cover: photos[0] ? photoUrl(photos[0]) : null,
    spots,
  };
}

export type SpotPlan =
  | {
      kind: "auction";
      reserveCents: number;
      stepCents: number;
      opensAt: string;
      closesAt: string;
    }
  | {
      kind: "rent";
      perDayCents: number;
      minDays: number;
      availableFrom: string;
      availableUntil: string | null;
    };

/**
 * Сохранить цены: аукцион - черновиком лота, аренду - предложением.
 *
 * Черновик лота ещё не торг: открыть его в цепочке продавец должен своим
 * кошельком, и до этого его никто не видит.
 */
export async function savePlans(
  thingId: string,
  plans: { spotId: string; plan: SpotPlan }[],
): Promise<boolean> {
  if (!db) return false;
  for (const { spotId, plan } of plans) {
    await db.from("lots").delete().eq("spot_id", spotId).eq("status", "draft");
    await db.from("rent_offers").delete().eq("spot_id", spotId);
    if (plan.kind === "auction") {
      const { error } = await db.from("lots").insert({
        thing_id: thingId,
        spot_id: spotId,
        kind: "auction",
        status: "draft",
        reserve_cents: plan.reserveCents,
        min_step_cents: plan.stepCents,
        opens_at: plan.opensAt,
        closes_at: plan.closesAt,
      });
      if (error) return false;
    } else {
      const { error } = await db.from("rent_offers").insert({
        spot_id: spotId,
        price_per_day_cents: plan.perDayCents,
        min_days: plan.minDays,
        available_from: plan.availableFrom,
        available_until: plan.availableUntil,
      });
      if (error) return false;
    }
  }
  return true;
}

/** Заявки, ждущие ответа продавца, от ранних к поздним. */
export async function loadSellerRequests(): Promise<SellerRequest[]> {
  if (!db) return [];
  const { data } = await db
    .from("rent_requests")
    .select(
      "id, buyer, buyer_wallet, artwork_url, starts_on, ends_on, price_per_day_cents, answer_by, thing_spots(label, x, y, w, h, things(title, photos))",
    )
    .eq("status", "waiting")
    .gt("answer_by", new Date().toISOString())
    .order("created_at", { ascending: true });
  if (!data || data.length === 0) return [];

  const buyers = [...new Set(data.map((one) => one.buyer as string))];
  const { data: scores } = await db
    .from("buyer_scores")
    .select("buyer, rating, deals")
    .in("buyer", buyers);
  const scoreOf = new Map((scores ?? []).map((one) => [one.buyer, one]));

  return data.map((one) => {
    const spot = one.thing_spots as unknown as {
      label: string;
      x: number | null; y: number | null; w: number | null; h: number | null;
      things: { title: string; photos: string[] | null } | null;
    } | null;
    const score = scoreOf.get(one.buyer as string);
    const photos = spot?.things?.photos ?? [];
    return {
      id: one.id,
      spotLabel: spot?.label ?? "Spot",
      spotRect:
        spot && spot.x !== null && spot.y !== null && spot.w !== null && spot.h !== null
          ? { x: spot.x, y: spot.y, w: spot.w, h: spot.h }
          : null,
      thingTitle: spot?.things?.title ?? "",
      thingPhoto: photos[0] ? photoUrl(photos[0]) : null,
      buyerWallet: one.buyer_wallet,
      buyerRating:
        score?.rating === null || score?.rating === undefined ? null : Number(score.rating),
      buyerDeals: score?.deals ?? 0,
      artworkUrl: one.artwork_url,
      startsOn: one.starts_on,
      endsOn: one.ends_on,
      pricePerDayCents: one.price_per_day_cents,
      answerBy: one.answer_by,
    };
  });
}

export async function answerRequest(id: string, approve: boolean): Promise<boolean> {
  if (!db) return false;
  const { error } = await db.rpc("answer_rent_request", { request: id, approve });
  return !error;
}

export type RatingInput =
  | {
      side: "buyer";
      lotId?: string;
      requestId?: string;
      stood: "yes" | "partly" | "no";
      rating: number;
      body: string;
    }
  | {
      side: "seller";
      lotId?: string;
      requestId?: string;
      artworkOk: boolean;
      noDrama: boolean;
      rating: number;
    };

/** Оценка сделки. Одна на сторону, переписать нельзя - так решила база. */
export async function sendRating(input: RatingInput): Promise<boolean> {
  if (!db) return false;
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return false;
  const { error } = await db.from("ratings").insert({
    author: auth.user.id,
    side: input.side,
    lot_id: input.lotId ?? null,
    rent_request: input.requestId ?? null,
    rating: input.rating,
    body: input.side === "buyer" && input.body.trim() ? input.body.trim() : null,
    stood: input.side === "buyer" ? input.stood : null,
    artwork_ok: input.side === "seller" ? input.artworkOk : null,
    no_drama: input.side === "seller" ? input.noDrama : null,
  });
  return !error;
}

/** Сколько снимков просит камера - столько ссылок загрузки и готовим. */
const CAPTURE_SHOTS = 3;

/**
 * Сессия съёмки для десктопа: секрет для QR и подписанные ссылки загрузки.
 *
 * Телефон - просто камера, входить ему не нужно: кошелёк на телефоне - это
 * отдельный вход, чужой браузер кошелька и сессия, которая не переживает
 * обновление. Поэтому ссылки загрузки готовит вошедший десктоп, а телефон
 * получает их по секрету из QR.
 */
export async function startCapture(): Promise<{ id: string; secret: string } | null> {
  if (!db) return null;
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await db
    .from("capture_sessions")
    .insert({})
    .select("id, secret")
    .single();
  if (error) return null;

  const uploads: { path: string; token: string }[] = [];
  for (let at = 0; at < CAPTURE_SHOTS; at++) {
    const path = `${auth.user.id}/capture-${data.id}/${at}.jpg`;
    const { data: signed, error: signError } = await db.storage
      .from("things")
      .createSignedUploadUrl(path);
    if (signError || !signed) return null;
    uploads.push({ path, token: signed.token });
  }
  const { error: saveError } = await db
    .from("capture_sessions")
    .update({ uploads })
    .eq("id", data.id);
  return saveError ? null : { id: data.id, secret: data.secret };
}

/** Телефон по секрету из QR открывает съёмку: получает ссылки загрузки. */
export async function openCapture(
  secret: string,
): Promise<{ path: string; token: string }[] | null> {
  if (!db) return null;
  const { data, error } = await db.rpc("capture_open", { secret });
  if (error || !Array.isArray(data) || data.length === 0) return null;
  return data as { path: string; token: string }[];
}

/** Телефон заливает снимки по подписанным ссылкам и сдаёт их десктопу. */
export async function landCapture(
  secret: string,
  uploads: { path: string; token: string }[],
  photos: Blob[],
): Promise<boolean> {
  if (!db) return false;
  const shots = photos.slice(0, uploads.length);
  for (const [at, photo] of shots.entries()) {
    const { path, token } = uploads[at]!;
    const { error } = await db.storage
      .from("things")
      .uploadToSignedUrl(path, token, photo, { contentType: photo.type || "image/jpeg" });
    if (error) return false;
  }
  const { data, error } = await db.rpc("capture_land", { secret, shots: shots.length });
  return !error && data === true;
}

export async function readCapture(
  id: string,
): Promise<{ state: "waiting" | "shooting" | "landed"; photos: string[] } | null> {
  if (!db) return null;
  const { data } = await db
    .from("capture_sessions")
    .select("state, photos")
    .eq("id", id)
    .maybeSingle();
  return data ? { state: data.state, photos: data.photos ?? [] } : null;
}


/** Сделка, которую сторона ещё не оценила. */
export type DealToRate = {
  lotId?: string;
  requestId?: string;
  title: string;
  line: string;
  cover: string | null;
  escrow: boolean;
};

/**
 * Что ждёт оценки от вошедшего: как покупателя (выигранные торги и одобренные
 * аренды, которые уже начались) и как продавца (то же на его вещах).
 * Оценённое базой отсекается - вторую оценку она всё равно не примет.
 */
export async function loadDealsToRate(
  side: "buyer" | "seller",
): Promise<DealToRate[]> {
  if (!db) return [];
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return [];
  const me = auth.user.id;

  const { data: mine } = await db
    .from("ratings")
    .select("lot_id, rent_request")
    .eq("author", me)
    .eq("side", side);
  const doneLots = new Set((mine ?? []).map((one) => one.lot_id).filter(Boolean));
  const doneRequests = new Set((mine ?? []).map((one) => one.rent_request).filter(Boolean));
  const out: DealToRate[] = [];

  // Торги: выигранные лоты, где я - победитель или владелец вещи.
  const { data: lots } = await db
    .from("lots")
    .select("id, closes_at, thing_spots(label), things(title, seller, photos), lot_bids(bidder, bidder_wallet, amount_cents, created_at)")
    .eq("status", "won")
    // Прогоны до первого настоящего торга не оцениваются.
    .eq("rehearsal", false);
  for (const lot of lots ?? []) {
    if (doneLots.has(lot.id)) continue;
    const thing = lot.things as unknown as { title: string; seller: string | null; photos: string[] | null } | null;
    const bids = ((lot.lot_bids as unknown as {
      bidder: string; bidder_wallet: string; amount_cents: number; created_at: string;
    }[] | null) ?? []).sort(
      (a, b) => b.amount_cents - a.amount_cents || a.created_at.localeCompare(b.created_at),
    );
    const top = bids[0];
    // Наши вещи, как футболка, не оцениваются: оценка - это счёт продавца.
    if (!top || !thing?.seller) continue;
    const spot = (lot.thing_spots as unknown as { label: string } | null)?.label ?? "Spot";
    const ended = new Date(lot.closes_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const cover = thing.photos?.[0] ? photoUrl(thing.photos[0]) : null;
    const price = `$${(top.amount_cents / 100).toFixed(2)}`;
    if (side === "buyer" && top.bidder === me) {
      out.push({ lotId: lot.id, title: `${spot} · ${thing.title}`, line: `Auction ended ${ended} · you paid ${price}`, cover, escrow: true });
    }
    if (side === "seller" && thing.seller === me) {
      out.push({
        lotId: lot.id,
        title: `${spot} · ${thing.title}`,
        line: `Auction ended ${ended} · ${top.bidder_wallet.slice(0, 4)}..${top.bidder_wallet.slice(-4)}`,
        cover,
        escrow: true,
      });
    }
  }

  // Аренды: одобренные и уже начавшиеся.
  const today = new Date().toISOString().slice(0, 10);
  const { data: rents } = await db
    .from("rent_requests")
    .select("id, buyer, buyer_wallet, starts_on, ends_on, thing_spots(label, things(title, seller, photos))")
    .eq("status", "approved")
    .lte("starts_on", today);
  for (const rent of rents ?? []) {
    if (doneRequests.has(rent.id)) continue;
    const spot = rent.thing_spots as unknown as {
      label: string; things: { title: string; seller: string | null; photos: string[] | null } | null;
    } | null;
    if (!spot?.things) continue;
    const ours = side === "buyer" ? rent.buyer === me : spot.things.seller === me;
    if (!ours) continue;
    const span = `${new Date(rent.starts_on).toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${new Date(rent.ends_on).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    out.push({
      requestId: rent.id,
      title: `${spot.label} · ${spot.things.title}`,
      line: `Rented ${span} · ${rent.buyer_wallet.slice(0, 4)}..${rent.buyer_wallet.slice(-4)}`,
      cover: spot.things.photos?.[0] ? photoUrl(spot.things.photos[0]) : null,
      escrow: false,
    });
  }
  return out;
}
