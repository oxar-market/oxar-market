/**
 * Живая сделка на девнете, настоящими транзакциями.
 *
 * Не тест и не симуляция: здесь работает та самая программа, что задеплоена, и
 * те же деньги, что увидит покупатель. Отличие от интеграционных тестов одно -
 * они поднимают свой валидатор, а это идёт в общую сеть.
 *
 * Кран не используется: продавцу и площадке SOL не нужен вовсе, а счета им
 * заводит и оплачивает покупатель. Поэтому прогон не зависит от лимитов крана.
 *
 *   pnpm exec ts-node --compilerOptions '{"module":"commonjs"}' scripts/devnet-deal.ts
 */
import * as anchor from "@anchor-lang/core";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createAssociatedTokenAccount,
  createMint,
  getAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const RPC = "https://api.devnet.solana.com";
const DECIMALS = 6; // как у USDC
const AMOUNT = 2_505_000_000; // $2505.00 - цена с нечётным центом
const FEE_BPS = 1_000; // 10%

const ok = (what: string, detail = "") =>
  console.log(`  ✓ ${what}${detail ? " - " + detail : ""}`);
const fail = (what: string, cause: unknown) => {
  console.log(`  ✗ ${what}: ${cause instanceof Error ? cause.message : cause}`);
  process.exitCode = 1;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const buyer = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, "utf8"))),
  );
  const seller = Keypair.generate();
  const platform = Keypair.generate();

  const connection = new Connection(RPC, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(buyer),
    { commitment: "confirmed" },
  );
  anchor.setProvider(provider);

  const idl = JSON.parse(readFileSync("target/idl/oxar_escrow.json", "utf8"));
  const program = new anchor.Program(idl, provider);

  console.log("\n=== девнет, живая сделка ===\n");
  console.log(`  программа  ${program.programId.toBase58()}`);
  console.log(`  покупатель ${buyer.publicKey.toBase58()}`);
  console.log(`  продавец   ${seller.publicKey.toBase58()}`);
  console.log(`  площадка   ${platform.publicKey.toBase58()}\n`);

  const mint = await createMint(connection, buyer, buyer.publicKey, null, DECIMALS);
  const buyerTokens = await createAssociatedTokenAccount(connection, buyer, mint, buyer.publicKey);
  const sellerTokens = await createAssociatedTokenAccount(connection, buyer, mint, seller.publicKey);
  const platformTokens = await createAssociatedTokenAccount(
    connection, buyer, mint, platform.publicKey,
  );
  await mintTo(connection, buyer, mint, buyerTokens, buyer, 1_000_000_000_000);
  ok("монета заведена, счета открыты", `${mint.toBase58().slice(0, 8)}…`);

  const balance = async (ata: PublicKey) => {
    const info = await connection.getAccountInfo(ata);
    return info ? (await getAccount(connection, ata)).amount : 0n;
  };
  const chainNow = async () =>
    (await connection.getBlockTime(await connection.getSlot()))!;

  const bookingId = () =>
    Array.from(Keypair.generate().publicKey.toBytes().slice(0, 16));
  const dealPda = (id: number[]) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("deal"), Buffer.from(id)],
      program.programId,
    )[0];

  async function open(startsIn: number, lasts: number, refundableFor: number) {
    const id = bookingId();
    const startsAt = (await chainNow()) + startsIn;
    await program.methods
      .buyerOpensDeal(
        id,
        new anchor.BN(AMOUNT),
        new anchor.BN(startsAt),
        new anchor.BN(startsAt + lasts),
        new anchor.BN((await chainNow()) + refundableFor),
        FEE_BPS,
      )
      .accounts({
        buyer: buyer.publicKey,
        seller: seller.publicKey,
        platform: platform.publicKey,
        mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    return dealPda(id);
  }

  const close = (deal: PublicKey) =>
    program.methods
      .partyClosesDeal()
      .accounts({
        party: buyer.publicKey,
        deal,
        buyer: buyer.publicKey,
        seller: seller.publicKey,
        platform: platform.publicKey,
        mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

  // ===== 1. Поток: место в профиле =====
  console.log("\n  --- поток: деньги капают, отмена возвращает непростоявшее ---");
  try {
    const s0 = await balance(sellerTokens);
    const p0 = await balance(platformTokens);
    const b0 = await balance(buyerTokens);

    const deal = await open(1, 60, 60); // окно отказа = весь срок
    ok("сделка открыта, сумма в хранилище");

    await sleep(6000);
    await program.methods
      .sellerTakesEarned()
      .accounts({
        deal,
        seller: seller.publicKey,
        platform: platform.publicKey,
        mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    const mid = await balance(sellerTokens);
    ok("продавец забрал натёкшее, не закрывая сделку", `${mid - s0} единиц`);

    await sleep(4000);
    await close(deal);

    const toSeller = (await balance(sellerTokens)) - s0;
    const toPlatform = (await balance(platformTokens)) - p0;
    const fromBuyer = b0 - (await balance(buyerTokens));

    if (toSeller + toPlatform !== fromBuyer) {
      throw new Error(`ушло ${toSeller + toPlatform}, списано ${fromBuyer}`);
    }
    if (toPlatform !== (toSeller + toPlatform) / 10n) {
      throw new Error(`комиссия ${toPlatform} не десятая часть от ${toSeller + toPlatform}`);
    }
    ok(
      "отмена в середине сошлась до единицы",
      `продавцу ${toSeller}, нам ${toPlatform}, вернулось ${BigInt(AMOUNT) - fromBuyer}`,
    );
  } catch (cause) {
    fail("поток", cause);
  }

  // ===== 2. Заморозка: сингапурский случай =====
  console.log("\n  --- заморозка: до конца не достаётся никому ---");
  try {
    const s0 = await balance(sellerTokens);
    const p0 = await balance(platformTokens);
    const b0 = await balance(buyerTokens);

    // Срок нулевой и стоит в конце события; окно отказа закрывается через 3 с.
    const deal = await open(14, 0, 3);
    ok("сделка открыта: расходы продавца начинаются через 3 секунды");

    await sleep(6000);
    try {
      await close(deal);
      throw new Error("покупатель забрал деньги из заморозки");
    } catch (cause) {
      if (!/NotRefundable/.test(String(cause))) throw cause;
      ok("покупателю отказано: окно отказа закрыто");
    }

    try {
      await program.methods
        .sellerTakesEarned()
        .accounts({
          deal,
          seller: seller.publicKey,
          platform: platform.publicKey,
          mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      throw new Error("продавец взял деньги из заморозки");
    } catch (cause) {
      if (!/NothingToWithdraw/.test(String(cause))) throw cause;
      ok("продавцу отказано: срок ещё не наступил");
    }

    await sleep(11000);
    await close(deal);

    const toSeller = (await balance(sellerTokens)) - s0;
    const toPlatform = (await balance(platformTokens)) - p0;
    const fromBuyer = b0 - (await balance(buyerTokens));

    if (toSeller + toPlatform !== BigInt(AMOUNT)) {
      throw new Error(`после конца ушло ${toSeller + toPlatform}, а сделка на ${AMOUNT}`);
    }
    if (fromBuyer !== BigInt(AMOUNT)) throw new Error("покупателю что-то вернулось");
    ok("после конца всё ушло продавцу", `${toSeller} ему, ${toPlatform} нам`);
  } catch (cause) {
    fail("заморозка", cause);
  }

  console.log(
    process.exitCode ? "\n=== есть расхождения ===\n" : "\n=== всё сошлось ===\n",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
