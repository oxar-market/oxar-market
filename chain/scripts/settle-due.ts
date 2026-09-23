/**
 * Разобрать все торги, у которых вышел срок: состоявшиеся - выплатой,
 * несостоявшиеся - закрытием.
 *
 * В цепи будильников нет: программа не просыпается сама, и «кто-то должен
 * позвать» - это устройство Solana, а не недоделка. Этот скрипт и есть
 * будильник: его зовёт расписание (.github/workflows/settle.yml) раз в десять
 * минут, и вчерашняя ручная рутина становится фоном. Позвать руками
 * по-прежнему можно - скрипт ничего не знает о том, кто его позвал.
 *
 * Безопасность не на честном слове запускающего: получатели и комиссия
 * вморожены в торг при открытии, и позвавший выплату не может увести деньги
 * ни себе, ни третьему. Худшее, что сделает взломщик с этим ключом, -
 * потратит операционные SOL на комиссии сети.
 *
 *   cd chain
 *   pnpm exec ts-node --compilerOptions '{"module":"commonjs"}' scripts/settle-due.ts
 *
 * Переменные берутся из окружения, а при пустоте - из ../.env.local: на
 * расписании нет файла, за столом нет окружения. KEYPAIR_PATH указывает на
 * ключ, по умолчанию - обычный ключ соланы в домашней папке.
 */
import * as anchor from "@anchor-lang/core";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { fetchConfig, fetchLot, fetchSale } from "./lot";

const RPC = process.env.SOLANA_RPC ?? "https://api.devnet.solana.com";

function env(name: string): string {
  const straight = process.env[name];
  if (straight) return straight;
  const file = readFileSync("../.env.local", "utf8");
  for (const line of file.split("\n")) {
    const at = line.indexOf("=");
    if (at > 0 && line.slice(0, at).trim() === name) return line.slice(at + 1).trim();
  }
  throw new Error(`нет ${name} ни в окружении, ни в .env.local`);
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
  const crank = Keypair.fromSecretKey(
    new Uint8Array(
      JSON.parse(
        readFileSync(
          process.env.KEYPAIR_PATH ?? `${homedir()}/.config/solana/id.json`,
          "utf8",
        ),
      ),
    ),
  );
  const connection = new Connection(RPC, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(crank), {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  const idl = JSON.parse(readFileSync("idl/oxar_escrow.json", "utf8"));
  const program = new anchor.Program(idl, provider);

  // Просроченные по часам базы. Решают часы цепи, ниже: ставка могла продлить
  // торг, и тогда цепь ещё открыта, что бы ни думала база.
  // Выручка продавца не задерживается на рабочем ключе: всё, что лежит на
  // его счёте в монете площадки, уезжает в кассу. Продавец первых торгов -
  // рабочий ключ, и без этого шага его выручка ждала бы ручного перегона;
  // комиссия и так приходит в кассу самими выплатами. Смётся и при пустом
  // разборе - хвосты не должны зависеть от того, был ли сегодня торг.
  async function sweepProceeds() {
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId,
    );
    const config = await fetchConfig(program, configPda);
    if (!config) return;

    const from = getAssociatedTokenAddressSync(config.mint, crank.publicKey);
    const holding = await connection.getAccountInfo(from);
    if (!holding) return;
    const amount = (await getAccount(connection, from)).amount;
    if (amount === 0n) return;

    const to = getAssociatedTokenAddressSync(config.mint, config.platform);
    const { decimals } = await getMint(connection, config.mint);
    const signature = await provider.sendAndConfirm(
      new Transaction().add(
        createTransferCheckedInstruction(
          from,
          config.mint,
          to,
          crank.publicKey,
          amount,
          decimals,
        ),
      ),
    );
    console.log(
      `выручка: $${(Number(amount) / 10 ** decimals).toFixed(2)} → касса, ${signature}`,
    );
  }

  const due = await rest(
    `lots?status=eq.open&closes_at=lt.${new Date().toISOString()}&select=id`,
  );
  if (!due.length) {
    console.log("разбирать нечего");
    await sweepProceeds();
    return;
  }

  for (const row of due) {
    const label = row.id.slice(0, 8);
    try {
      const auction = Array.from(Buffer.from(row.id.replace(/-/g, ""), "hex"));
      const [lotPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("lot"), Buffer.from(auction)],
        program.programId,
      );

      if (!(await connection.getAccountInfo(lotPda))) {
        // Строка есть, аккаунта нет: лот другой программы или закрыт мимо
        // базы. Чинить руками, а не автоматом: молча сменить статус значит
        // спрятать расхождение.
        console.log(`${label}: в цепи нет аккаунта - пропуск, нужен взгляд`);
        continue;
      }

      const lot = await fetchLot(program, lotPda);
      const sale = await fetchSale(program, lot.sale);

      const now = Math.floor(Date.now() / 1000);
      if (now < Number(sale.closesAt.toString())) {
        console.log(`${label}: цепь продлила торг, ещё идёт`);
        continue;
      }

      const won =
        lot.topBidder !== null &&
        BigInt(lot.topBid.toString()) >= BigInt(lot.reserve.toString());

      if (won) {
        const signature = await program.methods
          .lotPaysSeller()
          .accounts({
            crank: crank.publicKey,
            sale: lot.sale,
            lot: lotPda,
            seller: sale.seller,
            platform: sale.platform,
            mint: lot.mint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        await rest(`lots?id=eq.${row.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "won" }),
        });
        console.log(`${label}: выплачен, ${signature}`);
      } else {
        const signature = await program.methods
          .sellerClosesLot()
          .accounts({
            crank: crank.publicKey,
            sale: lot.sale,
            lot: lotPda,
            seller: sale.seller,
            lastBidder: (lot.topBidder as PublicKey | null) ?? sale.seller,
            mint: lot.mint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        await rest(`lots?id=eq.${row.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "unsold" }),
        });
        console.log(`${label}: закрыт без победителя, ${signature}`);
      }
    } catch (error) {
      // Один упавший лот не должен запирать остальные: у каждого своя судьба.
      console.error(`${label}: не разобран -`, error);
      process.exitCode = 1;
    }
  }

  await sweepProceeds();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});