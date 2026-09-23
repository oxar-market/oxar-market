/**
 * Открыть торг вещи: один срок на все её места.
 *
 * Первый шаг перед открытием мест. Торг держит то, что общее у всей футболки -
 * срок, продление против снайпинга, комиссию и её получателя, - а места потом
 * вешаются на него и своего срока не имеют вовсе. Так пятнадцать мест
 * закрываются в одну и ту же секунду, сколько бы времени ни прошло между их
 * открытием, а ставка под конец продлевает торг всем местам разом.
 *
 * Комиссии среди ключей нет намеренно: её и получателя торг берёт из настроек
 * площадки, которые задаёт админ через set-terms.ts. Открывающий торг на них
 * не влияет - иначе он назначил бы комиссию себе.
 *
 *   cd chain
 *   pnpm exec ts-node --compilerOptions '{"module":"commonjs"}' \
 *     scripts/open-sale.ts --thing=superteam-ua-tee --hours=24 \
 *       [--start=2026-09-24T09:00:00Z]
 *
 * --start назначает открытие в будущем: часы считаются от него, а не от
 * запуска. До этого момента витрина держит голограмму, а ставки не принимает
 * база - программа про срок открытия не знает, и для торгов, которые открываем
 * мы сами, этого достаточно.
 *
 * Возвращает uuid торга - его передают в open-lot.ts как --sale (и --opens
 * туда же, если открытие назначено).
 */
import * as anchor from "@anchor-lang/core";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { fetchConfig } from "./lot";

const RPC = process.env.SOLANA_RPC ?? "https://api.devnet.solana.com";
const THING_SLUG = "superteam-ua-tee";
/** На сколько ставка под конец двигает закрытие всей вещи. */
const EXTEND_SECONDS = 300;

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
      ...init.headers,
    },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${path}: ${response.status} ${body}`);
  return body ? JSON.parse(body) : null;
}

async function main() {
  const thingSlug = arg("thing") ?? THING_SLUG;
  const hours = Number(arg("hours") ?? "24");
  if (!Number.isFinite(hours) || hours <= 0) throw new Error("--hours должен быть больше нуля");

  const seller = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, "utf8"))),
  );
  const connection = new Connection(RPC, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(seller), {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = JSON.parse(readFileSync("idl/oxar_escrow.json", "utf8"));
  const program = new anchor.Program(idl, provider);

  // Настройки площадки: сиды постоянные, аккаунт один на всю программу.
  // Комиссия и её получатель приезжают отсюда и вмерзают в торг при открытии.
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId,
  );
  const config = await fetchConfig(program, configPda);
  if (!config) {
    throw new Error("настроек площадки нет в цепочке - сперва scripts/set-terms.ts");
  }

  const [thing] = await rest(`things?slug=eq.${thingSlug}&select=id,title`);
  if (!thing) throw new Error(`вещи ${thingSlug} нет в каталоге`);

  const start = arg("start");
  const opensAt = start ? new Date(start) : null;
  if (opensAt && Number.isNaN(opensAt.getTime())) {
    throw new Error(`--start «${start}» не похож на время`);
  }
  if (opensAt && opensAt.getTime() <= Date.now()) {
    throw new Error("--start уже в прошлом - открывай без него");
  }

  const id = randomUUID();
  const closesAt = new Date((opensAt?.getTime() ?? Date.now()) + hours * 3_600_000);
  const saleBytes = Array.from(Buffer.from(id.replace(/-/g, ""), "hex"));
  const [salePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("sale"), Buffer.from(saleBytes)],
    program.programId,
  );

  const signature = await program.methods
    .sellerOpensSale(
      saleBytes,
      new anchor.BN(Math.floor(closesAt.getTime() / 1000)),
      new anchor.BN(EXTEND_SECONDS),
    )
    .accounts({
      seller: seller.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log(`\n  ${thing.title}`);
  console.log(`  торг      ${id}`);
  console.log(`  в цепи    ${salePda.toBase58()}`);
  if (opensAt) console.log(`  открытие  ${opensAt.toISOString()} - до него голограмма`);
  console.log(`  до        ${closesAt.toISOString()}`);
  console.log(`  продление ${EXTEND_SECONDS} секунд, на всю вещь`);
  console.log(
    `  комиссия  ${config.feeBps / 100}% → ${config.platform.toBase58()} (из настроек)`,
  );
  console.log(`  подпись   ${signature}\n`);
  console.log(`  дальше:   scripts/open-lot.ts --sale=${id} --spot=slot_01 --reserve=1 --mint=<mint>\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
