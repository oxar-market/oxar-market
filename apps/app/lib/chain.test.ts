import { test } from "node:test";
import assert from "node:assert/strict";
import {
  auctionBytes,
  decodeLot,
  lotAddress,
  minNextCents,
  minNextUnits,
} from "./chain.ts";

/**
 * Разбор лота проверяется на настоящих байтах из сети, а не на выдуманных.
 *
 * Смысл в том, что сериализует их Anchor, а читаем мы руками, и разойтись эти
 * двое могут молча: сдвиг на байт даст не ошибку, а другое число - ставку
 * примут не ту. Поэтому образцы сняты с девнета (`getAccountInfo`), и если
 * поля в программе переставят, тест на этих байтах упадёт.
 */

/** Лот 30ae7a23-…, монета GJ59d2…, резерв $50, шаг $1, ставок ещё нет. */
const FRESH =
  "AsZdmc0fZfzb6DqBso455tvIe0dwo6yVSHjxbnks5jXzVYZI6CiabuM+3lgF9mb23VaCtJFbkai7FBk+ZVQjoU1ra2xgRaI4AAAAAAAAAAAAgPD6AgAAAABAQg8AAAAAAJ4NuWoAAAAALAEAAAAAAAAwrnojztRKOYwilAUZPZP7AAD/+wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

/** Тот же лот после двух ставок: ведёт GuFdc1…, в хранилище $60. */
const LED =
  "AsZdmc0fZfzb6DqBso455tvIe0dwo6yVSHjxbnks5jXzVYZI6CiabuM+3lgF9mb23VaCtJFbkai7FBk+ZVQjoU1ra2xgRaI4AexCDKWsw18bFB+YFpnUTF3MMTF/IDEy72OhWh6N3oxVAIeTAwAAAACA8PoCAAAAAEBCDwAAAAAAng25agAAAAAsAQAAAAAAADCueiPO1Eo5jCKUBRk9k/sAAP/7AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

const LOT_ID = "30ae7a23-ced4-4a39-8c22-9405193d93fb";

const bytes = (base64: string) => Uint8Array.from(Buffer.from(base64, "base64"));

test("uuid лота ложится в шестнадцать байт", () => {
  assert.equal(auctionBytes(LOT_ID).length, 16);
  assert.deepEqual(
    Array.from(auctionBytes(LOT_ID).slice(0, 4)),
    [0x30, 0xae, 0x7a, 0x23],
  );
  assert.throws(() => auctionBytes("не uuid"));
});

test("адрес лота выводится из его uuid", () => {
  assert.equal(
    lotAddress(LOT_ID).toBase58(),
    "Bao79bGvT5mAYUVUUQJ86FUCdsgMb2tEAgtH9a7UMkfv",
  );
});

test("лот без ставок читается целиком", () => {
  const lot = decodeLot(bytes(FRESH));

  assert.equal(lot.mint.toBase58(), "GJ59d2FbyuQoQpTg9Z6xevtTmVzzZpFNC1SqS8CgFf5y");
  assert.equal(lot.topBidder, null);
  assert.equal(lot.topBid, 0n);
  assert.equal(lot.reserve, 50_000_000n);
  assert.equal(lot.minStep, 1_000_000n);
  assert.equal(lot.closesAt, 1_790_512_542);
});

test("лот со ставкой читается со сдвигом на лидера", () => {
  // Ровно тот случай, ради которого разбор идёт подряд: появился Some, и всё,
  // что за ним, уехало на тридцать два байта. Резерв и шаг обязаны остаться
  // прежними - их никто не менял.
  const lot = decodeLot(bytes(LED));

  assert.equal(
    lot.topBidder?.toBase58(),
    "GuFdc1tbdad5GS1X4csNz9kY4ua4AWUqeHTS4WUFArM2",
  );
  assert.equal(lot.topBid, 60_000_000n);
  assert.equal(lot.reserve, 50_000_000n);
  assert.equal(lot.minStep, 1_000_000n);
  assert.equal(lot.closesAt, 1_790_512_542);
});

test("первая ставка равна резерву", () => {
  const lot = decodeLot(bytes(FRESH));
  assert.equal(minNextUnits(lot), 50_000_000n);
  assert.equal(minNextCents(lot), 5000);
});

test("дальше шаг: пять процентов, но не мельче своего минимума", () => {
  const lot = decodeLot(bytes(FRESH));
  const led = { ...lot, topBidder: lot.mint, topBid: 100_000_000n };

  // Пять процентов от $100 - это $5, и они крупнее шага в доллар.
  assert.equal(minNextUnits(led), 105_000_000n);
  // А от $10 - полдоллара, и тогда выигрывает сам шаг.
  assert.equal(minNextUnits({ ...led, topBid: 10_000_000n }), 11_000_000n);
});

test("минимум в центах округляется вверх, а не вниз", () => {
  const lot = decodeLot(bytes(FRESH));
  // $50.01 сверху: пять процентов от неё - $2.5005, и центами это не делится.
  // Вниз округлить нельзя - программа такую ставку не примет.
  const led = { ...lot, topBidder: lot.mint, topBid: 50_010_000n };

  assert.equal(minNextUnits(led), 52_510_500n);
  assert.equal(minNextCents(led), 5252);
});
