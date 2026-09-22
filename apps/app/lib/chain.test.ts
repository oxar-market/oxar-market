import { test } from "node:test";
import assert from "node:assert/strict";
import {
  auctionBytes,
  decodeLot,
  decodeSale,
  lotAddress,
  minNextCents,
  minNextUnits,
  saleAddress,
} from "./chain.ts";

/**
 * Разбор места и торга проверяется на байтах, собранных самим Anchor, а не на
 * выдуманных.
 *
 * Смысл в том, что сериализует их Anchor, а читаем мы руками, и разойтись эти
 * двое могут молча: сдвиг на байт даст не ошибку, а другое число - ставку
 * примут не ту. Поэтому образцы сняты его же кодировщиком по нынешнему IDL, и
 * если поля в программе переставят, тест на этих байтах упадёт.
 */

/** Торг вещи 7c9e6679-…: закрытие, продление пять минут, комиссия 10%. */
const SALE =
  "ykDoq7KsIrd8nmZ5dCVA3pRL4H/B+Qrn2+g6gbKOOebbyHtHcKOslUh48W55LOY181WGSOgomm7sQgylrMNfGxQfmBaZ1ExdzDExfyAxMu9joVoejd6MVZ4NuWoAAAAALAEAAAAAAADoA/8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

/** Место 30ae7a23-… этого торга: монета GJ59d2…, резерв $50, шаг $1, ставок нет. */
const FRESH =
  "AsZdmc0fZfzQwEebu9RACX85mcvFRylQ4+5HqQOBL+z97BMu1JdXAuM+3lgF9mb23VaCtJFbkai7FBk+ZVQjoU1ra2xgRaI4AAAAAAAAAAAAgPD6AgAAAABAQg8AAAAAADCueiPO1Eo5jCKUBRk9k/v+/QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

/** То же место после ставок: ведёт GuFdc1…, в хранилище $60. */
const LED =
  "AsZdmc0fZfzQwEebu9RACX85mcvFRylQ4+5HqQOBL+z97BMu1JdXAuM+3lgF9mb23VaCtJFbkai7FBk+ZVQjoU1ra2xgRaI4AexCDKWsw18bFB+YFpnUTF3MMTF/IDEy72OhWh6N3oxVAIeTAwAAAACA8PoCAAAAAEBCDwAAAAAAMK56I87USjmMIpQFGT2T+/79AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

const LOT_ID = "30ae7a23-ced4-4a39-8c22-9405193d93fb";
const SALE_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
/** Адрес торга, из которого собраны образцы. */
const SALE_PDA = "F3srYqux4nFpNjpztKe1u3a7ZjPomVcbU77GkcceygwT";

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

test("адрес торга выводится из его uuid", () => {
  assert.equal(saleAddress(SALE_ID).toBase58(), SALE_PDA);
});

test("торг вещи читается целиком: срок, продление, комиссия", () => {
  const sale = decodeSale(bytes(SALE));

  assert.equal(
    sale.seller.toBase58(),
    "FoRfraJasYqFp2gRniUQyUfJUUenGhYH211n9nk3jwv5",
  );
  assert.equal(
    sale.platform.toBase58(),
    "GuFdc1tbdad5GS1X4csNz9kY4ua4AWUqeHTS4WUFArM2",
  );
  assert.equal(sale.closesAt, 1_790_512_542);
  assert.equal(sale.extendSeconds, 300);
  assert.equal(sale.feeBps, 1000);
});

test("место без ставок читается целиком", () => {
  const lot = decodeLot(bytes(FRESH));

  // Срок у места не спрашиваем: он общий на вещь и лежит в торге, на который
  // место ссылается.
  assert.equal(lot.sale.toBase58(), SALE_PDA);
  assert.equal(lot.mint.toBase58(), "GJ59d2FbyuQoQpTg9Z6xevtTmVzzZpFNC1SqS8CgFf5y");
  assert.equal(lot.topBidder, null);
  assert.equal(lot.topBid, 0n);
  assert.equal(lot.reserve, 50_000_000n);
  assert.equal(lot.minStep, 1_000_000n);
});

test("место со ставкой читается со сдвигом на лидера", () => {
  // Ровно тот случай, ради которого разбор идёт подряд: появился Some, и всё,
  // что за ним, уехало на тридцать два байта. Резерв и шаг обязаны остаться
  // прежними - их никто не менял.
  const lot = decodeLot(bytes(LED));

  assert.equal(lot.sale.toBase58(), SALE_PDA);
  assert.equal(
    lot.topBidder?.toBase58(),
    "GuFdc1tbdad5GS1X4csNz9kY4ua4AWUqeHTS4WUFArM2",
  );
  assert.equal(lot.topBid, 60_000_000n);
  assert.equal(lot.reserve, 50_000_000n);
  assert.equal(lot.minStep, 1_000_000n);
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
