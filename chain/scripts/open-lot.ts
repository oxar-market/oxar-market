/**
 * Открыть торг: лот в цепочке и строка в базе, одним заходом.
 *
 * Кабинета продавца в первой версии нет намеренно - первые торги проводим мы
 * сами, - поэтому открывает лот скрипт, а не форма. Порядок здесь не вопрос
 * вкуса: id строки уходит в программу как сид PDA, значит строка обязана
 * появиться раньше лота в цепочке.
 *
 * Пока лот не открыт в цепочке, строка лежит черновиком и её не видно: на
 * чтение стоит `status <> 'draft'`. Так торг не появляется на экране раньше,
 * чем под ним оказываются деньги.
 *
 *   cd chain
 *   pnpm exec ts-node --compilerOptions '{"module":"commonjs"}' \
 *     scripts/open-lot.ts --sale=<uuid> --spot=slot_01 --reserve=50 --mint=<mint>
 *
 * Срока у места нет: он берётся из торга вещи (--sale), общий на все её места.
 * Торг открывается раньше, скриптом open-sale.ts.
 *
 * Монета передаётся руками и не имеет значения по умолчанию: девнетный USDC и
 * боевой - разные адреса, и перепутать их значит открыть торг за ненастоящие
 * деньги. Кошелёк продавца - тот, что в `solana config get`.
 */
import * as anchor from "@anchor-lang/core";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { getMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

/**
 * Сеть, в которой открываем торг. По умолчанию девнет: боевые деньги
 * включаются переменной, а не забытым значением в коде.
 *
 *   SOLANA_RPC=https://api.mainnet-beta.solana.com pnpm exec ts-node ...
 */
const RPC = process.env.SOLANA_RPC ?? "https://api.devnet.solana.com";
const THING_SLUG = "superteam-ua-tee";
/** Наименьшая прибавка к ставке. Те же центы лежат в базе у лота. */
const MIN_STEP_CENTS = 100;

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

/**
 * Запрос к базе от имени service_role.
 *
 * Политик на запись в `lots` нет вовсе - ни у анонима, ни у вошедшего, - и это
 * не упущение: лот заводим мы. Ключ живёт только здесь, в браузер он не уезжает.
 */
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
  const spotCode = arg("spot");
  const reserve = arg("reserve");
  const mintArg = arg("mint");
  const saleId = arg("sale");
  // Вещь по умолчанию одна, но прогон всей цепочки нельзя делать на витрине:
  // её места заняты идущими торгами, и подменять их ради проверки значит
  // ломать то, что люди в эту минуту смотрят.
  const thingSlug = arg("thing") ?? THING_SLUG;

  if (!spotCode || !reserve || !mintArg || !saleId) {
    throw new Error("нужны --sale, --spot, --reserve и --mint");
  }

  // Резерв приходит долларами, а живёт в двух видах: центы для показа и
  // базовые единицы монеты для программы. Считаем из центов, а не из доллара:
  // дробь в долларах разошлась бы с выплатой на доли цента.
  const reserveCents = Math.round(Number(reserve) * 100);
  if (!Number.isFinite(reserveCents) || reserveCents <= 0) {
    throw new Error(`резерв «${reserve}» не похож на сумму`);
  }

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

  // Комиссия, её получатель и срок живут в торге вещи, а не здесь: они общие
  // на все места футболки. Отсюда берётся только адрес самого торга.
  const saleBytes = Array.from(Buffer.from(saleId.replace(/-/g, ""), "hex"));
  const [salePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("sale"), Buffer.from(saleBytes)],
    program.programId,
  );
  const saleAccount = await connection.getAccountInfo(salePda);
  if (!saleAccount) throw new Error(`торга ${saleId} нет в цепочке - сперва open-sale.ts`);
  // Срок и продление читаем из него же: в базе они повторяются для показа, а
  // решает программа. Своих чисел здесь нет намеренно - разойдись они с торгом,
  // база считала бы торг закрытым, пока цепочка ещё принимает ставки.
  // Смещение - дискриминатор, uuid, продавец, площадка.
  const closesAt = new Date(
    Number(saleAccount.data.readBigInt64LE(8 + 16 + 32 + 32)) * 1000,
  );
  const extendSeconds = Number(saleAccount.data.readBigInt64LE(8 + 16 + 32 + 32 + 8));

  const mint = new PublicKey(mintArg);
  const { decimals } = await getMint(connection, mint);
  if (decimals < 2) throw new Error(`у монеты ${decimals} знаков, центы в неё не лягут`);
  const units = (cents: number) => cents * Math.pow(10, decimals - 2);

  const [thing] = await rest(`things?slug=eq.${thingSlug}&select=id,title`);
  if (!thing) throw new Error(`вещи ${thingSlug} нет в каталоге`);
  const [spot] = await rest(
    `thing_spots?thing_id=eq.${thing.id}&code=eq.${spotCode}&select=id,label`,
  );
  if (!spot) throw new Error(`у вещи нет места ${spotCode}`);

  const id = randomUUID();

  await rest("lots", {
    method: "POST",
    body: JSON.stringify({
      id,
      thing_id: thing.id,
      spot_id: spot.id,
      status: "draft",
      reserve_cents: reserveCents,
      min_step_cents: MIN_STEP_CENTS,
      closes_at: closesAt.toISOString(),
      extend_seconds: extendSeconds,
    }),
  });

  // uuid в шестнадцать байт: ровно то, что программа кладёт в сиды.
  const auction = Array.from(Buffer.from(id.replace(/-/g, ""), "hex"));
  const [lotPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("lot"), Buffer.from(auction)],
    program.programId,
  );

  const signature = await program.methods
    .sellerOpensLot(
      auction,
      new anchor.BN(units(reserveCents).toString()),
      new anchor.BN(units(MIN_STEP_CENTS).toString()),
    )
    .accounts({
      seller: seller.publicKey,
      sale: salePda,
      mint,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  await rest(`lots?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "open",
      chain_lot: lotPda.toBase58(),
      mint: mint.toBase58(),
    }),
  });

  console.log(`\n  ${thing.title} - ${spot.label}`);
  console.log(`  лот      ${id}`);
  console.log(`  в цепи   ${lotPda.toBase58()}`);
  console.log(`  монета   ${mint.toBase58()} (${decimals} знаков)`);
  console.log(`  резерв   $${(reserveCents / 100).toFixed(2)}, шаг $${MIN_STEP_CENTS / 100}`);
  console.log(`  до       ${closesAt.toISOString()} (срок торга вещи, продление ${extendSeconds} с)`);
  console.log(`  подпись  ${signature}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
