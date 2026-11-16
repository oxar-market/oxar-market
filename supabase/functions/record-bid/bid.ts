/**
 * Ставка, прочитанная из транзакции в цепочке. Функция record-bid пишет
 * ставку в базу только по этому разбору: кто поставил, на какой лот и
 * сколько - берётся из подтверждённой транзакции программы, а не из того,
 * что прислал браузер.
 *
 * Чистые функции без сети - их гоняет node --test, как тексты уведомлений.
 */

/** Первые 8 байт sha256("global:bidder_places_bid") - так Anchor метит инструкцию. */
export const BID_DISCRIMINATOR = new Uint8Array([172, 147, 26, 172, 0, 179, 171, 148]);

/** Порядок счетов в BidderPlacesBid: bidder, sale, lot, ... */
const BIDDER_AT = 0;
const LOT_AT = 2;

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58Decode(text: string): Uint8Array {
  let n = 0n;
  for (const ch of text) {
    const at = ALPHABET.indexOf(ch);
    if (at < 0) throw new Error("not base58");
    n = n * 58n + BigInt(at);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n % 256n));
    n /= 256n;
  }
  for (const ch of text) {
    if (ch !== "1") break;
    bytes.unshift(0);
  }
  return new Uint8Array(bytes);
}

export function base58Encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = "";
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}

type Instruction = { programId?: string; accounts?: string[]; data?: string };
type ParsedTx = { meta?: { err?: unknown } | null; transaction?: { message?: { instructions?: Instruction[] } } } | null;

/**
 * Ставка из ответа getTransaction (encoding jsonParsed). null - транзакция
 * упала, или в ней нет ставки нашей программы, или данные не того вида.
 */
export function readBid(tx: ParsedTx, programId: string): { bidder: string; lot: string; units: bigint } | null {
  if (!tx || !tx.meta || tx.meta.err !== null) return null;
  for (const one of tx.transaction?.message?.instructions ?? []) {
    if (one.programId !== programId || !one.data || !one.accounts) continue;
    let data: Uint8Array;
    try {
      data = base58Decode(one.data);
    } catch {
      continue;
    }
    if (data.length < 16 || !BID_DISCRIMINATOR.every((b, at) => data[at] === b)) continue;
    const bidder = one.accounts[BIDDER_AT];
    const lot = one.accounts[LOT_AT];
    if (!bidder || !lot) continue;
    const units = new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(8, true);
    return { bidder, lot, units };
  }
  return null;
}

/** USDC - 6 знаков: цент - 10 000 единиц. Ставка в базе - целые центы; не целые - не наша ставка. */
export function unitsToCents(units: bigint): number | null {
  if (units <= 0n || units % 10_000n !== 0n) return null;
  return Number(units / 10_000n);
}
