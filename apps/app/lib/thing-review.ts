/**
 * Где вещь продавца в проверке. От этого зависят надпись в списке админки и
 * кнопки на карточке: одобрить и отклонить можно только до одобрения, а
 * спрятанную после одобрения возвращают на маркет, а не одобряют заново.
 */
export type ReviewState = "draft" | "awaiting" | "approved" | "hidden" | "declined";

export function reviewState(thing: {
  active: boolean;
  hidden: boolean;
  declinedReason: string | null;
  published: boolean;
  house: boolean;
}): ReviewState {
  if (thing.active) return "approved";
  if (thing.hidden) return "hidden";
  if (thing.declinedReason) return "declined";
  // Черновик - продавец ещё не поставил цены и не опубликовал. Наша вещь
  // черновиком не бывает: её торги заводим мы сами.
  return thing.published || thing.house ? "awaiting" : "draft";
}
