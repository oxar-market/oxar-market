/**
 * Задать условия площадки: комиссию и кошелёк, на который она идёт.
 *
 * Тем же скриптом их и меняют - инструкция одна на оба случая. Первый вызов
 * заводит настройки и делает админом того, чей ключ лежит в
 * `~/.config/solana/id.json`; все следующие требуют подписи именно его.
 *
 * Первым завести настройки может только владелец программы - тот, у кого
 * право на её обновление. Иначе между выкатом и первым вызовом была бы щель, в
 * которую успел бы бот, следящий за выкатами. Дальше админ живёт сам по себе:
 * право на обновление можно отдать или сжечь, настройки от этого не потеряются.
 *
 *   cd chain
 *   pnpm exec ts-node --compilerOptions '{"module":"commonjs"}' \
 *     scripts/set-terms.ts --fee=1000 --platform=<адрес> --mint=<адрес USDC> \
 *       [--admin=<адрес>]
 *
 * Без --platform берётся NEXT_PUBLIC_OXAR_FEE_WALLET из .env.local.
 * Комиссия в сотых долях процента: 1000 - это 10%.
 *
 * Монета обязательна и по умолчанию не подставляется: у девнетного USDC и
 * боевого разные адреса, и перепутать их значит открыть торги за ненастоящие
 * деньги. Места в любой другой монете программа откажется открывать.
 *
 * --admin передаёт админство: следующие вызовы сможет подписать только он.
 * Опечатка в адресе - потеря админства навсегда, сверяй напечатанное.
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

  const coin = arg("mint");
  if (!coin) throw new Error("нужен --mint=<адрес монеты торгов>");
  const mint = new PublicKey(coin);

  const handover = arg("admin");
  const newAdmin = handover ? new PublicKey(handover) : null;

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

  // Служебный аккаунт программы: в нём лежит право на обновление, и по нему
  // программа узнаёт хозяина на первом вызове. Anchor вывести его не может -
  // сиды у него от загрузчика, а не от нас.
  const [programData] = PublicKey.findProgramAddressSync(
    [program.programId.toBuffer()],
    new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"),
  );

  // Что было до вызова - чтобы в выводе было видно, завели мы настройки или
  // поменяли, и на что именно.
  const before = await fetchConfig(program, configPda);

  const signature = await program.methods
    .adminSetsTerms(feeBps, newAdmin)
    .accounts({
      admin: admin.publicKey,
      platform,
      mint,
      programData,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log(`\n  ${before ? "условия изменены" : "условия заведены"}`);
  console.log(`  в цепи    ${configPda.toBase58()}`);
  console.log(`  админ     ${(before?.admin ?? admin.publicKey).toBase58()}`);
  if (before) {
    console.log(`  было      ${before.feeBps / 100}% → ${before.platform.toBase58()}`);
    console.log(`  монета    ${before.mint.toBase58()}`);
  }
  console.log(`  стало     ${feeBps / 100}% → ${platform.toBase58()}`);
  console.log(`  монета    ${mint.toBase58()}`);
  if (newAdmin) {
    console.log(`  админство → ${newAdmin.toBase58()} - дальше подписывает только он`);
  }
  console.log(`  подпись   ${signature}\n`);
  console.log("  идущие торги сохраняют свои условия: они вморожены при открытии\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
