/**
 * Свои логотипы для формы ставки: картинки прежних ставок кошелька, по одной
 * на картинку, свежие первыми. Выбрал - ставишь с ней снова, без загрузки.
 * Одна картинка под разными именами - одна плитка с именем последней ставки:
 * его человек и ставил последним.
 */
export function myLogos<B extends { mediaUrl: string; brand: string }>(bids: B[]): B[] {
  const seen = new Set<string>();
  return bids.filter((bid) => {
    if (!bid.mediaUrl || seen.has(bid.mediaUrl)) return false;
    seen.add(bid.mediaUrl);
    return true;
  });
}
