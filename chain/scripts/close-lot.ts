/**
 * Закрыть торг, который кончился ничем.
 *
 * Пара к `pay-lot.ts`: тот закрывает состоявшийся торг деньгами, этот -
 * несостоявшийся. Разделяет их одно правило - есть ли ставка не ниже резерва,
 * и спрашиваем мы о нём саму цепочку, а не базу.
 *
 * Единственная ставка ниже резерва всё равно лежит в хранилище, и её здесь
 * возвращают хозяину. Без этого вызова деньги участника остались бы запертыми
 * навсегда: программа сама не просыпается, таймеров в Solana нет.
 *
 *   cd chain
 *   pnpm exec ts-node --compilerOptions '{"module":"commonjs"}' \
 *     scripts/close-lot.ts --lot=<uuid>
 *
 * Строку в базе скрипт переводит в `unsold` после того, как транзакция прошла:
 * база здесь витрина, и опережать цепочку ей нельзя.
 */
import * as anchor from "@anchor-lang/core";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, getMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { fetchLot, fetchSale } from "./lot";

/** Та же сеть, что у открытия лота: девнет, пока не сказано иное. */
const RPC = process.env.SOLANA_RPC ?? "https://api.devnet.solana.com";

function arg(name: string): string | undefined {
  const found = process.argv.find((one) => one.startsWith(`--${name}=`));
  return found?.slice(name.length + 3);
}

/** Переменные из .env.local в корне репозитория: ключ от базы лежит там. */
function env(name: string): string {
  const file = readFileSync("../.env.local", "utf8");
  for (const line of file.split("\n")) {
    const at = line.indexOf("=");
    if (at > 0 && line.slice(0, at).trim() === name) return line.slice(at + 1).trim();
  }
  throw new Error(`в .env.local нет ${name}`);
}

const url = env("NEXT_PUBLIC_SUPABASE_URL");
const key = env("SUPABASE_SERVICE_ROLE_KEY");

async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${path}: ${response.status} ${body}`);
  return body ? JSON.parse(body) : null;
}

async function main() {
  const id = arg("lot");
  if (!id) throw new Error("нужен --lot=<uuid>");

  const crank = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, "utf8"))),
  );
  const connection = new Connection(RPC, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(crank), {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = JSON.parse(readFileSync("idl/oxar_escrow.json", "utf8"));
  const program = new anchor.Program(idl, provider);

  const auction = Array.from(Buffer.from(id.replace(/-/g, ""), "hex"));
  const [lotPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("lot"), Buffer.from(auction)],
    program.programId,
  );

  const lot = await fetchLot(program, lotPda);
  // Продавец и срок - в торге вещи, общие на все места.
  const sale = await fetchSale(program, lot.sale);
  const topBid = BigInt(lot.topBid.toString());
  const reserve = BigInt(lot.reserve.toString());

  // То же правило, что у программы: ставка есть и она не ниже резерва. Если
  // торг состоялся, звать надо выплату, а не это - программа откажет сама, но
  // сказать об этом лучше до транзакции, чем после её отказа.
  if (lot.topBidder && topBid >= reserve) {
    throw new Error("торг состоялся - это pay-lot.ts, а не close-lot.ts");
  }

  // Участника может не быть вовсе, а аккаунт в инструкции обязателен. Тогда
  // ставим продавца: его счёт заведомо существует, а возврата программа не
  // делает - возвращать нечего.
  const lastBidder = (lot.topBidder as PublicKey | null) ?? sale.seller;

  const signature = await program.methods
    .sellerClosesLot()
    .accounts({
      crank: crank.publicKey,
      sale: lot.sale,
      lot: lotPda,
      seller: sale.seller,
      lastBidder,
      mint: lot.mint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  await rest(`lots?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "unsold" }),
  });

  const { decimals } = await getMint(connection, lot.mint);
  const money = (units: bigint) => (Number(units) / Math.pow(10, decimals)).toFixed(2);
  console.log(`\n  лот       ${id}`);
  console.log(`  в цепи    ${lotPda.toBase58()}`);
  if (lot.topBidder) {
    console.log(`  возврат   $${money(topBid)} → ${lastBidder.toBase58()}`);
    console.log(`  счёт      ${getAssociatedTokenAddressSync(lot.mint, lastBidder).toBase58()}`);
  } else {
    console.log(`  ставок    не было, возвращать нечего`);
  }
  console.log(`  аренда    → ${sale.seller.toBase58()}`);
  console.log(`  подпись   ${signature}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
