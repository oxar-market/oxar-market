/**
 * Задать условия площадки: комиссию и кошелёк, на который она идёт.
 *
 * Тем же скриптом их и меняют - инструкция одна на оба случая. Первый вызов
 * заводит настройки и делает админом того, чей ключ лежит в
 * `~/.config/solana/id.json`; все следующие требуют подписи именно его.
 *
 * **Первый вызов посылается сразу за выкатом программы.** Адрес программы
 * известен заранее, он вшит в неё, - значит между выкатом и первым вызовом
 * есть щель, и успевший позвать первым станет админом. Щель узкая и не
 * смертельная: права на обновление у нас, и новый код настройки перепишет. Но
 * чинить это потом дороже, чем не открывать вовсе.
 *
 *   cd chain
 *   pnpm exec ts-node --compilerOptions '{"module":"commonjs"}' \
 *     scripts/set-terms.ts --fee=1000 --platform=<адрес>
 *
 * Без --platform берётся NEXT_PUBLIC_OXAR_FEE_WALLET из .env.local.
 * Комиссия в сотых долях процента: 1000 - это 10%.
 *
 * Мейннет: SOLANA_RPC=https://api.mainnet-beta.solana.com перед командой.
 */
import * as anchor from "@anchor-lang/core";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { fetchConfig } from "./lot";

const RPC = process.env.SOLANA_RPC ?? "https://api.devnet.solana.com";

function arg(name: string): string | undefined {
  const found = process.argv.find((one) => one.startsWith(`--${name}=`));
  return found?.slice(name.length + 3);
}

/** Переменные из .env.local в корне репозитория. */
function env(name: string): string {
  const file = readFileSync("../.env.local", "utf8");
  for (const line of file.split("\n")) {
    const at = line.indexOf("=");
    if (at > 0 && line.slice(0, at).trim() === name) return line.slice(at + 1).trim();
  }
  throw new Error(`в .env.local нет ${name}`);
}

/** То же, но пусто и отсутствие - не ошибка, а «не задано». */
function optionalEnv(name: string): string {
  try {
    return env(name);
  } catch {
    return "";
  }
}

async function main() {
  const fee = arg("fee");
  if (fee === undefined) throw new Error("нужен --fee=<сотые доли процента>");

  const feeBps = Number(fee);
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) {
    throw new Error("--fee должен быть целым от 0 до 10000");
  }

  const wallet = arg("platform") || optionalEnv("NEXT_PUBLIC_OXAR_FEE_WALLET");
  if (!wallet) throw new Error("нужен --platform=<адрес> или ключ в .env.local");
  const platform = new PublicKey(wallet);

  const admin = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, "utf8"))),
  );
  const connection = new Connection(RPC, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(admin), {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = JSON.parse(readFileSync("idl/oxar_escrow.json", "utf8"));
  const program = new anchor.Program(idl, provider);

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId,
  );

  // Что было до вызова - чтобы в выводе было видно, завели мы настройки или
  // поменяли, и на что именно.
  const before = await fetchConfig(program, configPda);

  const signature = await program.methods
    .adminSetsTerms(feeBps)
    .accounts({
      admin: admin.publicKey,
      platform,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log(`\n  ${before ? "условия изменены" : "условия заведены"}`);
  console.log(`  в цепи    ${configPda.toBase58()}`);
  console.log(`  админ     ${(before?.admin ?? admin.publicKey).toBase58()}`);
  if (before) {
    console.log(`  было      ${before.feeBps / 100}% → ${before.platform.toBase58()}`);
  }
  console.log(`  стало     ${feeBps / 100}% → ${platform.toBase58()}`);
  console.log(`  подпись   ${signature}\n`);
  console.log("  идущие торги сохраняют свои условия: они вморожены при открытии\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
