/**
 * Список вещей в админке: что с вещью сейчас и что осталось сделать после
 * торга. Чистые правила - их зовёт админка и проверяют тесты.
 */

type LotRow = { id: string; status: string; closes_at: string; rehearsal: boolean };
type BidRow = { lot_id: string; amount_cents: number; media_url: string };

export type LotSummary = {
  /** Идёт торг: открытый лот, срок которого не вышел. */
  live: boolean;
  /** Последнее закрытие опубликованных лотов; прогоны - только если других нет. */
  closesAt: string | null;
  /** Верхние ставки проданных и идущих мест, без прогонов. */
  raisedCents: number;
  /** Ставок всего, без прогонов. */
  bids: number;
  /** Картинка верхней ставки - превью вещи в списке, если своих снимков нет. */
  winnerImage: string | null;
  /** Есть ли у вещи прогоны: ни одного, часть или все опубликованные лоты. */
  rehearsal: "none" | "some" | "all";
};

export function summarizeLots(lots: LotRow[], bids: BidRow[], now: number): LotSummary {
  const published = lots.filter((lot) => lot.status !== "draft");
  const real = published.filter((lot) => !lot.rehearsal);
  const realIds = new Set(real.map((lot) => lot.id));
  const top = new Map<string, BidRow>();
  let count = 0;
  for (const bid of bids) {
    if (!realIds.has(bid.lot_id)) continue;
    count += 1;
    const seen = top.get(bid.lot_id);
    if (!seen || bid.amount_cents > seen.amount_cents) top.set(bid.lot_id, bid);
  }
  const paid = real.filter((lot) => lot.status === "won" || lot.status === "open");
  const tops = paid.map((lot) => top.get(lot.id)).filter((one) => one !== undefined);
  const dated = real.length > 0 ? real : published;
  const rehearsals = published.length - real.length;
  return {
    live: real.some((lot) => lot.status === "open" && Date.parse(lot.closes_at) > now),
    closesAt: dated.reduce<string | null>((last, lot) => (!last || lot.closes_at > last ? lot.closes_at : last), null),
    raisedCents: tops.reduce((sum, one) => sum + one.amount_cents, 0),
    bids: count,
    winnerImage: tops.sort((a, b) => b.amount_cents - a.amount_cents)[0]?.media_url ?? null,
    rehearsal: rehearsals === 0 ? "none" : rehearsals === published.length ? "all" : "some",
  };
}

export type Shelf = "live" | "ended" | "hidden" | "test" | "draft";

/**
 * Полка вещи в списке. Тестовый прогон - вещь, где были одни прогоны, или
 * спрятанная, у которой был прогон или «test» в имени: настоящую вещь с
 * прогоном до открытия тестом не считаем.
 */
export function shelfOf(thing: {
  title: string;
  slug: string;
  hidden: boolean;
  live: boolean;
  closesAt: string | null;
  rehearsal: LotSummary["rehearsal"];
}): Shelf {
  const named = /\btest|rehearsal/i.test(`${thing.title} ${thing.slug}`);
  if (thing.rehearsal === "all" || (thing.hidden && (thing.rehearsal === "some" || named))) return "test";
  if (thing.hidden) return "hidden";
  if (thing.live) return "live";
  return thing.closesAt ? "ended" : "draft";
}

export type AfterTodo = "reach" | "photos";

/**
 * Что сделать после торга: внести охват из статистики постов (оценка не в
 * счёт) и положить фото итогов. Только у прошедшего торга, где что-то
 * продано и деньги не возвращали.
 */
export function afterTodos(thing: {
  shelf: Shelf;
  refunded: boolean;
  raisedCents: number;
  reach: number | null;
  reachChecked: boolean;
  proof: string[];
}): AfterTodo[] {
  if (thing.shelf !== "ended" || thing.refunded || thing.raisedCents === 0) return [];
  const todo: AfterTodo[] = [];
  if (!thing.reach || !thing.reachChecked) todo.push("reach");
  if (thing.proof.length === 0) todo.push("photos");
  return todo;
}
