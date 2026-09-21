/**
 * Поставить ставку из командной строки - то же, что делает экран, но без него.
 *
 * Нужен для прогона всей цепочки перед торгом на настоящие деньги: открыть
 * лот, поставить, перебить, закрыть, выплатить. Экраном это не проверить -
 * там вход через Privy и чужой кошелёк, а здесь любой ключ из файла.
 *
 *   cd chain
 *   pnpm exec ts-node --compilerOptions '{"module":"commonjs"}' \
 *     scripts/bid-lot.ts --lot=<uuid> --amount=51 --keypair=/путь/к/ключу.json
 *
 * Строку в базу скрипт не пишет намеренно: её пишет экран от имени вошедшего,
 * и подделывать этот путь значило бы проверять не то, что работает в жизни.
 * Здесь проверяются деньги - они живут в цепочке.
 */
import * as anchor from "@anchor-lang/core";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { fetchLot } from "./lot";

const RPC = process.env.SOLANA_RPC ?? "https://api.devnet.solana.com";

function arg(name: string): string | undefined {
  const found = process.argv.find((one) => one.startsWith(`--${name}=`));
  return found?.slice(name.length + 3);
}

async function main() {
  const id = arg("lot");
  if (!id) throw new Error("нужен --lot=<uuid>");
  const dollars = Number(arg("amount"));
  if (!Number.isFinite(dollars) || dollars <= 0) throw new Error("нужен --amount=<сумма>");

  const path = arg("keypair") ?? `${homedir()}/.config/solana/id.json`;
  const bidder = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync(path, "utf8"))),
  );

  const connection = new Connection(RPC, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(bidder), {
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
  const { decimals } = await getMint(connection, lot.mint);
  const amount = BigInt(Math.round(dollars * Math.pow(10, decimals)));

  // Прежнего лидера может не быть - тогда в его роли идёт сам участник, и
  // программа не возвращает ничего. Так же поступает экран.
  const previous = (lot.topBidder as PublicKey | null) ?? bidder.publicKey;

  const signature = await program.methods
    .bidderPlacesBid(new anchor.BN(amount.toString()))
    .accounts({
      bidder: bidder.publicKey,
      lot: lotPda,
      previousBidder: previous,
      mint: lot.mint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  const after = await fetchLot(program, lotPda);
  const money = (units: bigint) => (Number(units) / Math.pow(10, decimals)).toFixed(2);
  console.log(`\n  лот       ${id}`);
  console.log(`  ставил    ${bidder.publicKey.toBase58()}`);
  console.log(`  сумма     $${money(amount)}`);
  console.log(`  вернули   ${lot.topBidder ? `$${money(BigInt(lot.topBid.toString()))} → ${previous.toBase58()}` : "некому, ставок не было"}`);
  console.log(`  лидер     ${(after.topBidder as PublicKey).toBase58()}`);
  console.log(`  подпись   ${signature}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
