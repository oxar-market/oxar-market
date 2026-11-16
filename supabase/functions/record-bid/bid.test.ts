import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { BID_DISCRIMINATOR, base58Decode, base58Encode, readBid, unitsToCents } from "./bid.ts";

const PROGRAM = "4zBp61iGL7f9zybTfrtwydUZmM2WxRsskedqFNdHiDpe";
const BIDDER = "AkC8BHHNJQ61fXVsHVnWsferBm4PC6t8oT8YwRmrwDtB";
const LOT = "7MvLvtgvPtTN4VgjCm1kmK6dkKDMPxq2u7q9pKfz8LgV";
const SALE = "BEwjchz9yNYQ1ts59LMKoSHSWm5CxfPww7NKe2yW1ydE";

/** Данные инструкции ставки: дискриминатор и сумма u64 little-endian. */
function bidData(units: bigint): string {
  const bytes = new Uint8Array(16);
  bytes.set(BID_DISCRIMINATOR, 0);
  new DataView(bytes.buffer).setBigUint64(8, units, true);
  return base58Encode(bytes);
}

function tx(over: { err?: unknown; program?: string; data?: string; accounts?: string[] } = {}) {
  return {
    meta: { err: over.err ?? null },
    transaction: {
      message: {
        instructions: [
          { programId: "ComputeBudget111111111111111111111111111111", accounts: [], data: "3" },
          {
            programId: over.program ?? PROGRAM,
            accounts: over.accounts ?? [BIDDER, SALE, LOT, "vault", "tokens", "prev", "prevTokens", "mint"],
            data: over.data ?? bidData(15_000_000n),
          },
        ],
      },
    },
  };
}

test("дискриминатор - первые 8 байт sha256 от global:bidder_places_bid", () => {
  const expected = createHash("sha256").update("global:bidder_places_bid").digest().subarray(0, 8);
  assert.deepEqual([...BID_DISCRIMINATOR], [...expected]);
});

test("base58: туда и обратно, ведущие нули - единицы", () => {
  const bytes = new Uint8Array([0, 0, 1, 2, 255]);
  assert.deepEqual([...base58Decode(base58Encode(bytes))], [...bytes]);
  assert.equal(base58Encode(new Uint8Array([0, 0])), "11");
  assert.throws(() => base58Decode("0OIl"));
});

test("ставка читается из успешной транзакции программы: кто, на какой лот, сколько", () => {
  assert.deepEqual(readBid(tx(), PROGRAM), { bidder: BIDDER, lot: LOT, units: 15_000_000n });
});

test("упавшая транзакция - не ставка", () => {
  assert.equal(readBid(tx({ err: { InstructionError: [1, "Custom"] } }), PROGRAM), null);
});

test("чужая программа - не ставка", () => {
  assert.equal(readBid(tx({ program: "Tokenkeg" }), PROGRAM), null);
});

test("другая инструкция нашей программы - не ставка", () => {
  const other = base58Encode(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 0, 0, 0, 0, 0, 0, 0, 0]));
  assert.equal(readBid(tx({ data: other }), PROGRAM), null);
});

test("обрезанные данные или счета - не ставка", () => {
  assert.equal(readBid(tx({ data: base58Encode(BID_DISCRIMINATOR) }), PROGRAM), null);
  assert.equal(readBid(tx({ accounts: [BIDDER, SALE] }), PROGRAM), null);
  assert.equal(readBid(null, PROGRAM), null);
});

test("единицы USDC в центы: только целые центы", () => {
  assert.equal(unitsToCents(15_000_000n), 1500);
  assert.equal(unitsToCents(10_000n), 1);
  assert.equal(unitsToCents(15_000_001n), null);
  assert.equal(unitsToCents(0n), null);
});
