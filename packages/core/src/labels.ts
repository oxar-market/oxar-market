/**
 * Подписи, которые одинаково должны звучать в вебе и в мобилке: место,
 * счёт человека, кошелёк.
 */

/**
 * Подпись места. У клеток нашей футболки подпись - номер («01»), и ему нужно
 * слово; у вещи продавца она уже «Spot 1», у чемодана - имя («Main panel»).
 */
export function spotName(label: string): string {
  return /^\d+$/.test(label) ? `Spot ${label}` : label;
}

export type Score = { rating: number | null; deals: number };

/**
 * Счёт одной строкой. Чужим до трёх сделок - «New seller»: две пятёрки подряд
 * ещё не репутация. Себе свою оценку показываем сразу, иначе она пропадает.
 */
export function scoreText(score: Score, side: "seller" | "buyer" = "seller", own = false): string {
  if (own && score.rating !== null) {
    return `★ ${score.rating.toFixed(1)} · ${score.deals === 1 ? "1 deal" : `${score.deals} deals`}`;
  }
  if (score.deals < 3) return `New ${side}`;
  if (score.rating === null) return `${score.deals} deals, no ratings yet`;
  return `★ ${score.rating.toFixed(1)} · ${score.deals} deals`;
}

/** Кошелёк коротко: первые и последние четыре знака. */
export function shortWallet(address: string): string {
  return address.length > 10 ? `${address.slice(0, 4)}..${address.slice(-4)}` : address;
}
