// Прогон денег настоящими транзакциями.
//
// По умолчанию идёт в девнет. Кран публичного девнета исчерпывается на день,
// поэтому надёжнее поднять локальный валидатор с теми же программами:
//
//   solana-test-validator --reset --url https://api.devnet.solana.com \
//     --clone strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m \
//     --clone aSTRM2NKoKxNnkmLWk9sz3k74gKBk9t7bpPrTGxMszH \
//     --clone pardoTarcc6HKsPcbXkVycxsJsoN9QEzrdHgVdHAGY3 \
//     --clone HqDGZjaVRXJ9MGRQEw7qDc2rAr6iH1n1kAQdCZaCMfMZ \
//     --clone Aa2JJfFzUN3V54DXUHRBJowFw416xfZHpPk9DaNy3iYs \
//     --clone B743wFVk2pCYhV91cn287e1xY7f1vt4gdY48hhNiuQmT \
//     --clone Gssm3vfi8s65R31SBdmQRq6cKeYojGgup7whkw4VCiQj
//
//   NEXT_PUBLIC_SOLANA_RPC=http://127.0.0.1:8899 node scripts/devnet-check.mjs
//
// Не мок и не симуляция. Девнет - живая сеть, а SDK Streamflow и наш перевод
// одинаково принимают обычный Keypair вместо кошелька в браузере. Значит здесь
// выполняется ровно тот код, который отработает у покупателя, кроме самого
// Phantom: подпись даёт ключ, а не расширение.
//
// Что проверяется:
//   1. разовый перевод: счёт получателя заводится, сумма доходит;
//   2. стрим: вся сумма сделки уходит в контракт, ни больше ни меньше;
//   3. отмена: разложение сходится с settle() из packages/core.
//
// В CI не ходит - нужны сеть и кран. Запускать руками:
//   node scripts/devnet-check.mjs
//
// Монета своя, а не девнетовый USDC: тот выдаётся краном с капчей. Для
// механики важны только шесть знаков после точки, они совпадают.

import { Buffer } from "node:buffer";
globalThis.Buffer ??= Buffer;

const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com";
const DECIMALS = 6;

const web3 = await import("@solana/web3.js");
const token = await import("@solana/spl-token");

const connection = new web3.Connection(CLUSTER, "confirmed");
const ok = (name, detail = "") => console.log(`  ✓ ${name}${detail ? " - " + detail : ""}`);
const fail = (name, cause) => {
  console.log(`  ✗ ${name}: ${cause instanceof Error ? cause.message : cause}`);
  process.exitCode = 1;
};

/**
 * Кран девнета отвечает отказом чаще, чем хотелось бы, и это не наша ошибка.
 * Поэтому несколько попыток с паузой и суммой поменьше: одного SOL хватает и
 * на монету, и на контракт Streamflow.
 */
async function fund(keypair, sol) {
  let last;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const signature = await connection.requestAirdrop(
        keypair.publicKey,
        sol * web3.LAMPORTS_PER_SOL,
      );
      const latest = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature, ...latest }, "confirmed");
      return;
    } catch (cause) {
      last = cause;
      await new Promise((r) => setTimeout(r, attempt * 4000));
    }
  }
  throw last;
}

/**
 * Обёртка вокруг ключа в форму, которую ждёт наш код от кошелька.
 *
 * Подписей две, потому что транзакции бывают двух видов: обычная просит
 * partialSign, версионная - sign со списком. Phantom это различие прячет, а
 * здесь его приходится держать самим.
 */
function asWallet(keypair) {
  const sign = (tx) => {
    if (typeof tx.partialSign === "function") tx.partialSign(keypair);
    else tx.sign([keypair]);
    return tx;
  };
  return {
    publicKey: keypair.publicKey,
    signTransaction: async (tx) => sign(tx),
    signAllTransactions: async (txs) => txs.map(sign),
  };
}

console.log("\n=== девнет, живые транзакции ===\n");

const buyer = web3.Keypair.generate();
const seller = web3.Keypair.generate();
console.log(`  покупатель ${buyer.publicKey.toBase58()}`);
console.log(`  продавец   ${seller.publicKey.toBase58()}\n`);

try {
  await fund(buyer, 1);
  ok("кран выдал SOL покупателю");
} catch (cause) {
  console.log(`  ✗ кран отказал: ${cause.message}`);
  console.log("    девнетовый кран ограничивает частоту. Повтори через минуту.");
  process.exit(1);
}

// Своя монета с теми же шестью знаками, что у USDC.
const mint = await token.createMint(connection, buyer, buyer.publicKey, null, DECIMALS);
const buyerAta = await token.getOrCreateAssociatedTokenAccount(
  connection, buyer, mint, buyer.publicKey,
);
await token.mintTo(connection, buyer, mint, buyerAta.address, buyer, 1_000_000_000);
ok("монета заведена и начислена", `${mint.toBase58().slice(0, 8)}…`);

process.env.NEXT_PUBLIC_USDC_MINT = mint.toBase58();

const { payOnce } = await import("../lib/transfer.ts");
const { openStream, cancelStream } = await import("../lib/stream.ts");
const { settle, streamPlan, toUsdcBaseUnits } = await import("@oxar/core");

const balance = async (owner) => {
  const ata = await token.getAssociatedTokenAddress(mint, owner);
  const info = await connection.getAccountInfo(ata);
  if (!info) return 0n;
  return (await token.getAccount(connection, ata)).amount;
};

// 1. Разовый перевод
try {
  const before = await balance(seller.publicKey);
  const signature = await payOnce({
    wallet: asWallet(buyer),
    recipient: seller.publicKey.toBase58(),
    priceCents: 2500,
  });
  const after = await balance(seller.publicKey);
  const moved = after - before;
  const want = BigInt(toUsdcBaseUnits(2500));
  if (moved !== want) throw new Error(`дошло ${moved}, ожидали ${want}`);
  ok("перевод: счёт получателя заведён, сумма дошла", `${signature.slice(0, 12)}…`);
} catch (cause) {
  fail("перевод", cause);
}

// 2. Стрим: вся сумма сделки уходит в контракт
let streamId = null;
const PRICE = 15000;
const plan = streamPlan({ priceCents: PRICE, startDate: "2026-11-03", endDate: "2026-11-09" });
try {
  const before = await balance(buyer.publicKey);
  const stream = await openStream({
    wallet: asWallet(buyer),
    recipient: seller.publicKey.toBase58(),
    priceCents: PRICE,
    startDate: "2026-11-03",
    endDate: "2026-11-09",
    name: "devnet check",
  });
  streamId = stream.streamId;
  const after = await balance(buyer.publicKey);
  const locked = before - after;
  const want = BigInt(plan.depositedBaseUnits);
  if (locked !== want) {
    throw new Error(`в контракт ушло ${locked}, а сделка на ${want}`);
  }
  ok("стрим открыт, вся сумма в контракте", `остаток ${plan.dustBaseUnits} не потерян`);
} catch (cause) {
  fail("стрим", cause);
}

// 3. Отмена: неотстоявшее возвращается покупателю
if (streamId) {
  try {
    const before = await balance(buyer.publicKey);
    await cancelStream({ wallet: asWallet(buyer), streamId });
    const back = (await balance(buyer.publicKey)) - before;
    // Стрим ещё не начался: по settle() за ноль отстоявших дней возвращается всё.
    const expected = BigInt(settle(plan.depositedBaseUnits, plan.days, 0).refundCents);
    if (back !== expected) throw new Error(`вернулось ${back}, по settle() ${expected}`);
    ok("отмена до старта: вернулось всё, как считает settle()");
  } catch (cause) {
    fail("отмена", cause);
  }
}

console.log(
  process.exitCode ? "\n=== есть расхождения, смотри выше ===\n" : "\n=== всё сошлось ===\n",
);
