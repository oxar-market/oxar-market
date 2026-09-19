// Прогон денег настоящими транзакциями.
//
// По умолчанию идёт в девнет. Кран публичного девнета исчерпывается на день,
// поэтому надёжнее поднять локальный валидатор с теми же программами:
//
// Программы клонируются как обновляемые: у них код лежит в отдельном аккаунте
// programdata, и обычный --clone тянет только заголовок. Валидатор такую
// программу поднимает, но первый же вызов падает с «Program is not deployed».
//
//   solana-test-validator --reset --url https://api.devnet.solana.com \
//     --clone-upgradeable-program strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m \
//     --clone-upgradeable-program aSTRM2NKoKxNnkmLWk9sz3k74gKBk9t7bpPrTGxMszH \
//     --clone-upgradeable-program pardoTarcc6HKsPcbXkVycxsJsoN9QEzrdHgVdHAGY3 \
//     --clone-upgradeable-program pardpVtPjC8nLj1Dwncew62mUzfChdCX1EaoZe8oCAa \
//     --clone-upgradeable-program HqDGZjaVRXJ9MGRQEw7qDc2rAr6iH1n1kAQdCZaCMfMZ \
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
// Комиссия уходит третьей стороне, поэтому и в прогоне она третий адрес: если
// бы платформа и продавец совпадали, расщепление сошлось бы само собой.
const platform = web3.Keypair.generate();
console.log(`  покупатель ${buyer.publicKey.toBase58()}`);
console.log(`  продавец   ${seller.publicKey.toBase58()}`);
console.log(`  платформа  ${platform.publicKey.toBase58()}\n`);

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
process.env.NEXT_PUBLIC_OXAR_FEE_WALLET = platform.publicKey.toBase58();

const { payOnce } = await import("../lib/transfer.ts");
const { openStream, cancelStream } = await import("../lib/stream.ts");
const { settle, splitPayout, streamPlan, toUsdcBaseUnits } = await import("@oxar/core");

const balance = async (owner) => {
  const ata = await token.getAssociatedTokenAddress(mint, owner);
  const info = await connection.getAccountInfo(ata);
  if (!info) return 0n;
  return (await token.getAccount(connection, ata)).amount;
};

// 1. Разовый перевод с комиссией.
//
// Цена намеренно с нечётным центом: 10% от 2505 - это 250.5, то есть ровно тот
// случай, где выплата, комиссия и сумма сделки могут разъехаться на цент.
try {
  const PAY = 2505;
  const split = splitPayout(PAY);
  const sellerBefore = await balance(seller.publicKey);
  const platformBefore = await balance(platform.publicKey);
  const buyerBefore = await balance(buyer.publicKey);

  const signature = await payOnce({
    wallet: asWallet(buyer),
    recipient: seller.publicKey.toBase58(),
    priceCents: PAY,
  });

  const toSeller = (await balance(seller.publicKey)) - sellerBefore;
  const toPlatform = (await balance(platform.publicKey)) - platformBefore;
  const fromBuyer = buyerBefore - (await balance(buyer.publicKey));

  if (toSeller !== BigInt(toUsdcBaseUnits(split.netCents))) {
    throw new Error(`продавцу ${toSeller}, а по splitPayout ${toUsdcBaseUnits(split.netCents)}`);
  }
  if (toPlatform !== BigInt(toUsdcBaseUnits(split.feeCents))) {
    throw new Error(`комиссия ${toPlatform}, а по splitPayout ${toUsdcBaseUnits(split.feeCents)}`);
  }
  if (toSeller + toPlatform !== fromBuyer) {
    throw new Error(`покупатель отдал ${fromBuyer}, дошло ${toSeller + toPlatform}`);
  }
  ok(
    "перевод: счета заведены, 10% ушли платформе",
    `${split.netCents}c продавцу + ${split.feeCents}c нам, ${signature.slice(0, 12)}…`,
  );
} catch (cause) {
  fail("перевод с комиссией", cause);
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
    // Стрим ещё не начался, значит по settle() возвращается вся сумма.
    const expected = BigInt(settle(plan, plan.startUnix - 1).refundBaseUnits);
    if (back !== expected) throw new Error(`вернулось ${back}, по settle() ${expected}`);
    ok("отмена до старта: вернулось всё, как считает settle()");
  } catch (cause) {
    fail("отмена", cause);
  }
}

console.log(
  process.exitCode ? "\n=== есть расхождения, смотри выше ===\n" : "\n=== всё сошлось ===\n",
);
