import { LAPTOP, SUITCASE, TIE, type Shape } from "@oxar/stage";

/**
 * Разметка наших вещей живёт в коде, а не в базе: по модели вещи - её форма.
 * Футболка - сцена по умолчанию, для неё пусто.
 */
export function houseShape(model: string | null | undefined): Shape | undefined {
  if (model?.includes("suitcase")) return SUITCASE;
  if (model?.includes("laptop")) return LAPTOP;
  if (model?.includes("tie")) return TIE;
  return undefined;
}

/** Наша футболка: у неё свой экран торга, с фото-режимом по её снимкам. */
export function isShirt(model: string | null | undefined): boolean {
  return !model || model.includes("shirt");
}
