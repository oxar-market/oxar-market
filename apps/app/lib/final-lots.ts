/**
 * Итог закрытого торга: по каждому месту - последний настоящий лот, проданный
 * или нет. У вещи их могло быть много: прогоны, отменённые и переоткрытые
 * торги. Без этого у закрытого торга страница была пустой - она берёт только
 * идущие лоты.
 */
export function finalLots<T extends { spot_id: string; status: string; closes_at: string; rehearsal: boolean }>(
  lots: T[],
): T[] {
  const last = new Map<string, T>();
  for (const lot of lots) {
    if (lot.rehearsal || (lot.status !== "won" && lot.status !== "unsold")) continue;
    const seen = last.get(lot.spot_id);
    if (!seen || lot.closes_at > seen.closes_at) last.set(lot.spot_id, lot);
  }
  return [...last.values()];
}
