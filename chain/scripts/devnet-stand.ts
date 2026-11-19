/**
 * Подготовить кошельки к прогону на тестовом стенде (oxar-test.pages.dev,
 * devnet): SOL на газ и тестовые доллары на ставки.
 *
 * Доллары стенда - монета из настроек площадки на devnet (шесть знаков, как
 * у USDC). Её выпускает рабочий ключ, поэтому раздать можно сколько угодно; сайт
 * открывает торги в монете из настроек, так что с ней он работает как с
 * настоящей.
 *
 *   cd chain
 *   pnpm exec ts-node -T --compilerOptions '{"module":"commonjs"}' \
 *     scripts/devnet-stand.ts --to=<кошелёк>[,<кошелёк>] [--usd=1000]
 *
 * Только devnet: на боевой сети скрипт откажется работать.
 */
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const RPC = process.env.SOLANA_RPC ?? "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("4zBp61iGL7f9zybTfrtwydUZmM2WxRsskedqFNdHiDpe");

function arg(name: string): string | undefined {
  const found = process.argv.find((one) => one.startsWith(`--${name}=`));
  return found?.slice(name.length + 3);
}

async function main() {
  if (!RPC.includes("devnet")) throw new Error("стенд - только devnet");
  const to = (arg("to") ?? "").split(",").filter(Boolean).map((one) => new PublicKey(one));
  if (to.length === 0) throw new Error("--to=<кошелёк> обязателен");
  const usd = Number(arg("usd") ?? "1000");

  const connection = new Connection(RPC, "confirmed");
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, "utf8"))),
  );

  // Монета - та, что в настройках площадки: в ней сайт и открывает торги.
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
  const data = (await connection.getAccountInfo(config))?.data;
  if (!data) throw new Error("на devnet нет настроек площадки - сначала set-terms.ts");
  const mint = new PublicKey(data.subarray(8 + 32 + 32 + 2 + 1, 8 + 32 + 32 + 2 + 1 + 32));
  console.log(`монета стенда: ${mint.toBase58()}`);

  for (const wallet of to) {
    // Кран devnet часто занят - газ тогда шлём со своего ключа.
    const sol = await connection.getBalance(wallet);
    if (sol < 0.2 * LAMPORTS_PER_SOL) {
      try {
        await connection.confirmTransaction(await connection.requestAirdrop(wallet, LAMPORTS_PER_SOL));
      } catch {
        await sendAndConfirmTransaction(
          connection,
          new Transaction().add(
            SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: wallet, lamports: 0.5 * LAMPORTS_PER_SOL }),
          ),
          [payer],
        );
      }
    }
    const account = await getOrCreateAssociatedTokenAccount(connection, payer, mint, wallet);
    await mintTo(connection, payer, mint, account.address, payer, BigInt(Math.round(usd * 1e6)));
    console.log(`${wallet.toBase58()}: +$${usd}, SOL ${(await connection.getBalance(wallet)) / LAMPORTS_PER_SOL}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
