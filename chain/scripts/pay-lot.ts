/**
 * Закрыть торг деньгами: выручка продавцу, комиссия площадке.
 *
 * Программа не умеет просыпаться сама - в Solana нет таймеров, - поэтому после
 * того, как срок вышел, кто-то должен позвать выплату. Этот скрипт и есть тот
 * кто-то. Подписи именно продавца он не требует: адреса получателей записаны в
 * лоте при открытии, и позвавший не может увести деньги ни себе, ни третьему.
 *
 *   cd chain
 *   pnpm exec ts-node --compilerOptions '{"module":"commonjs"}' \
 *     scripts/pay-lot.ts --lot=<uuid>
 *
 * Строку в базе скрипт переводит в `settled` после того, как транзакция
 * прошла, а не до: база здесь витрина, и опережать цепочку ей нельзя.
 */
import * as anchor from "@anchor-lang/core";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

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

  // Кому и сколько - спрашиваем у цепочки, а не у базы. База может отстать или
  // разойтись, а платим мы по тому, что записано в лоте.
  const lot = await program.account.lot.fetch(lotPda);
  const fee = (BigInt(lot.topBid.toString()) * BigInt(lot.feeBps)) / 10_000n;
  const toSeller = BigInt(lot.topBid.toString()) - fee;

  const signature = await program.methods
    .lotPaysSeller()
    .accounts({
      crank: crank.publicKey,
      lot: lotPda,
      seller: lot.seller,
      platform: lot.platform,
      mint: lot.mint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  // Торг состоялся - это и есть `won`. Отдельного «деньги ушли» в схеме нет
  // намеренно: выплата и есть то, чем состоявшийся торг заканчивается.
  await rest(`lots?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "won" }),
  });

  const { decimals } = await getMint(connection, lot.mint);
  const money = (units: bigint) =>
    (Number(units) / Math.pow(10, decimals)).toFixed(2);
  console.log(`\n  лот       ${id}`);
  console.log(`  в цепи    ${lotPda.toBase58()}`);
  console.log(`  продавцу  $${money(toSeller)} → ${lot.seller.toBase58()}`);
  console.log(`  комиссия  $${money(fee)} → ${lot.platform.toBase58()}`);
  console.log(`  счёт      ${getAssociatedTokenAddressSync(lot.mint, lot.seller).toBase58()}`);
  console.log(`  подпись   ${signature}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
