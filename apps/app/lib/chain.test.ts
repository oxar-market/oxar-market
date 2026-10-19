import { test } from "node:test";
import assert from "node:assert/strict";
import {
  auctionBytes,
  decodeLot,
  decodeSale,
  lotAddress,
  openSaleData,
  proofData,
  disputeData,
  payData,
  decideData,
  moveProofData,
  permitAddress,
  permitData,
  revokePermitData,
  saleAddress,
  openStickersData,
  buyStickersData,
  decodeSheet,
  decodeOrder,
  sheetAddress,
  orderAddress,
} from "./chain.ts";
import { PublicKey } from "@solana/web3.js";

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
  "AsZdmc0fZfy0oj2utMftfVs6KmoSte+fOyuz/GlqblSI65B5H+FJDuM+3lgF9mb23VaCtJFbkai7FBk+ZVQjoU1ra2xgRaI4AAAAAAAAAAAAgPD6AgAAAABAQg8AAAAAADCueiPO1Eo5jCKUBRk9k/v+/QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

/** То же место после ставок: ведёт GuFdc1…, в хранилище $60. */
const LED =
  "AsZdmc0fZfy0oj2utMftfVs6KmoSte+fOyuz/GlqblSI65B5H+FJDuM+3lgF9mb23VaCtJFbkai7FBk+ZVQjoU1ra2xgRaI4AexCDKWsw18bFB+YFpnUTF3MMTF/IDEy72OhWh6N3oxVAIeTAwAAAACA8PoCAAAAAEBCDwAAAAAAMK56I87USjmMIpQFGT2T+/79AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

/**
 * Торг после защиты покупателя: срок пруфа и время пруфа легли в прежний
 * запас аккаунта. Получатель комиссии - HTnp…, как в mainnet. Снят тем же
 * кодировщиком по IDL с пруфом и спором.
 */
const SALE_PROVED =
  "ykDoq7KsIrd8nmZ5dCVA3pRL4H/B+Qrn2+g6gbKOOebbyHtHcKOslUh48W55LOY181WGSOgomm70l+g6ibB+eagqctazkiXrKLkJPDjePdFaa+2ksZRolZ4NuWoAAAAALAEAAAAAAADoA/+uG7lqAAAAAJ6a4GoAAAAAAMDPagAAAAAgYddqAAAAAA==";

/** Место со ставкой, которое победитель оспорил: флаг и время спора - в прежнем запасе. */
const LOT_DISPUTED =
  "AsZdmc0fZfy0oj2utMftfVs6KmoSte+fOyuz/GlqblSI65B5H+FJDuM+3lgF9mb23VaCtJFbkai7FBk+ZVQjoU1ra2xgRaI4AexCDKWsw18bFB+YFpnUTF3MMTF/IDEy72OhWh6N3oxVAIeTAwAAAACA8PoCAAAAAEBCDwAAAAAAMK56I87USjmMIpQFGT2T+/79AaBG0WoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

const LOT_ID = "30ae7a23-ced4-4a39-8c22-9405193d93fb";
const SALE_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
/** Адрес торга, из которого собраны образцы. После смены адреса программы
 * (#251) в байтах образцов подменено ровно поле `sale` - PDA выводится из
 * адреса программы и сменился вместе с ним. Остальные байты нетронуты. */
const SALE_PDA = "DA7sbTkGJ3dLpdRSdR8srzMKVLQ89Hj65G8tkgq4d7rD";

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
    "EMyC2jcm5yBfcf3n1V5H4G6szDXPT7xBdFKFxtG4eoAt",
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

test("торг, открытый до защиты покупателя, читается без срока пруфа", () => {
  // В старом аккаунте на этих байтах лежал запас из нулей. Ноль в сроке -
  // признак старого торга: он платит сразу после закрытия.
  const sale = decodeSale(bytes(SALE));
  assert.equal(sale.proofDeadline, 0);
  assert.equal(sale.provedAt, 0);
});

test("торг с пруфом читается целиком: жёсткий конец, срок пруфа, время пруфа", () => {
  const sale = decodeSale(bytes(SALE_PROVED));
  assert.equal(sale.platform.toBase58(), "HTnptfEEkqjr7ZiQs7E39a7a4cuo7tX9JNRych2sRJPv");
  assert.equal(sale.closesAt, 1_790_512_542);
  assert.equal(sale.hardClosesAt, 1_790_516_142);
  assert.equal(sale.proofDeadline, 1_793_104_542);
  assert.equal(sale.provedAt, 1_792_000_000);
  // Срок при открытии - от него потолок переносов; в образце перенос уже был.
  assert.equal(sale.firstProofDeadline, 1_792_500_000);
});

test("оспоренное место читается с флагом и временем спора", () => {
  const lot = decodeLot(bytes(LOT_DISPUTED));
  assert.equal(lot.topBid, 60_000_000n);
  assert.equal(lot.disputed, true);
  assert.equal(lot.disputedAt, 1_792_100_000);

  // У места до защиты покупателя здесь нули - спора нет.
  const old = decodeLot(bytes(LED));
  assert.equal(old.disputed, false);
  assert.equal(old.disputedAt, 0);
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

test("открытие торга кодируется байт в байт как у Anchor: срок, продление, срок пруфа", () => {
  // Образец снят BorshInstructionCoder по IDL с пруфом: торг 7c9e6679-…,
  // закрытие 1790512542, продление 300, срок пруфа 1793104542.
  const data = openSaleData(SALE_ID, 1_790_512_542_000, 1_793_104_542_000);
  assert.equal(
    Buffer.from(data).toString("base64"),
    "HPEFWULdUmN8nmZ5dCVA3pRL4H/B+Qrnng25agAAAAAsAQAAAAAAAJ6a4GoAAAAA",
  );
});

test("инструкции защиты покупателя кодируются байт в байт как у Anchor", () => {
  // Образцы сняты BorshInstructionCoder по IDL с пруфом и спором.
  const b64 = (data: Uint8Array) => Buffer.from(data).toString("base64");
  const hash = Uint8Array.from({ length: 32 }, (_, i) => i);
  assert.equal(b64(proofData(hash)), "OKuBp/nSf9oAAQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHw==");
  assert.equal(b64(disputeData()), "ZFBlsLsOWns=");
  assert.equal(b64(payData()), "JKnKKxbpk74=");
  assert.equal(b64(decideData(3000)), "fZh7Oec58Vm4Cw==");
  assert.equal(b64(moveProofData(1_795_000_000_000)), "M6wELc68K8DAhv1qAAAAAA==");
  assert.throws(() => proofData(new Uint8Array(31)), "хеш не из тридцати двух байт");
});

test("разрешение на торг без пруфа кодируется байт в байт как у Anchor", () => {
  // Образцы сняты BorshInstructionCoder по IDL с разрешением: торг 7c9e6679-…,
  // продавец AkC8….
  const b64 = (data: Uint8Array) => Buffer.from(data).toString("base64");
  const seller = new PublicKey("AkC8BHHNJQ61fXVsHVnWsferBm4PC6t8oT8YwRmrwDtB");
  assert.equal(b64(permitData(SALE_ID, seller)), "n5xdyw+6zKd8nmZ5dCVA3pRL4H/B+QrnkMm8Gv1DLh1K+2eNp+C6LJ7Pg/7DPOnhM45ksqjPD0g=");
  assert.equal(b64(revokePermitData(SALE_ID)), "WlxpYqyooOZ8nmZ5dCVA3pRL4H/B+Qrn");
});

test("адрес разрешения выводится из id торга, и у разных торгов он разный", () => {
  assert.ok(permitAddress(SALE_ID).equals(permitAddress(SALE_ID)));
  assert.ok(!permitAddress(SALE_ID).equals(permitAddress("00000000-0000-0000-0000-000000000001")));
  assert.ok(!permitAddress(SALE_ID).equals(saleAddress(SALE_ID)), "адрес разрешения совпал с адресом торга");
});

// Стикеры: образцы сняты кодировщиком Anchor по нынешнему IDL. Лист 7c9e6679-…
// за $100, пятьдесят штук, продано семь; покупка трёх с номера 4 с тегом 30ae7a23-….
const SHEET =
  "mLA9AWC177V8nmZ5dCVA3pRL4H/B+QrnkMm8Gv1DLh1K+2eNp+C6LJ7Pg/7DPOnhM45ksqjPD0j0l+g6ibB+eagqctazkiXrKLkJPDjePdFaa+2ksZRolcb6evO+2606PWXzaqvJdDGxu+TC0vbg5HymAgNFL11hAOH1BQAAAADoAzIABwD+";
const ORDER =
  "4k8ai013eSuDcvoUdY+qpQFiayU2pz1Q1ZWlCmxDk2kViC0UzEij/JDJvBr9Qy4dSvtnjafguiyez4P+wzzp4TOOZLKozw9IBAADADCueiPO1Eo5jCKUBRk9k/v9";
const STICKER_SELLER = new PublicKey("AkC8BHHNJQ61fXVsHVnWsferBm4PC6t8oT8YwRmrwDtB");

test("инструкции стикеров собираются байт в байт как у Anchor", () => {
  const b64 = (data: Uint8Array) => Buffer.from(data).toString("base64");
  assert.equal(
    b64(openStickersData(SALE_ID, STICKER_SELLER, 10_000, 50)),
    "vgW8yZubr5l8nmZ5dCVA3pRL4H/B+QrnkMm8Gv1DLh1K+2eNp+C6LJ7Pg/7DPOnhM45ksqjPD0gA4fUFAAAAADIA",
  );
  assert.equal(b64(buyStickersData(3, LOT_ID)), "UX0K2Ak60+oDADCueiPO1Eo5jCKUBRk9k/s=");
});

test("лист стикеров читается: цена, комиссия, лимит, продано", () => {
  const sheet = decodeSheet(Buffer.from(SHEET, "base64"));
  assert.ok(sheet.seller.equals(STICKER_SELLER));
  assert.equal(sheet.platform.toBase58(), "HTnptfEEkqjr7ZiQs7E39a7a4cuo7tX9JNRych2sRJPv");
  assert.equal(sheet.mint.toBase58(), "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  assert.equal(sheet.price, 100_000_000n);
  assert.equal(sheet.feeBps, 1000);
  assert.equal(sheet.cap, 50);
  assert.equal(sheet.sold, 7);
});

test("покупка читается: покупатель, номера и тег строки в базе", () => {
  const order = decodeOrder(Buffer.from(ORDER, "base64"));
  assert.ok(order.buyer.equals(STICKER_SELLER));
  assert.equal(order.first, 4);
  assert.equal(order.count, 3);
  assert.equal(order.tag, LOT_ID);
});

test("адреса листа и покупок: свой у каждого номера", () => {
  assert.equal(sheetAddress(SALE_ID).toBase58(), "9r86V2QrnnJDN6DvBTAZKRP1foS2HTitbFiz2476sgwd");
  const sheet = sheetAddress(SALE_ID);
  assert.ok(!orderAddress(sheet, 0).equals(orderAddress(sheet, 1)));
  assert.ok(!sheet.equals(saleAddress(SALE_ID)), "адрес листа совпал с адресом торга");
});
