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
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { fetchConfig, fetchLot, fetchSale, type ChainLot, type ChainSale } from "./lot";
import { hasWinner } from "../../packages/core/src/lot";
// Правила защиты покупателя - те же, что у приложения.
import { disputeLapsed, hasBuyerProtection, pays, proofMissed } from "../../packages/core/src/proof";

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
  // его счёте в монете площадки, уезжает владельцу - админу настроек
  // площадки. Продавец наших торгов (футболка) - рабочий ключ, и без этого
  // шага его 90% ждали бы ручного перегона. Комиссия сюда не попадает: она
  // приходит на кошелёк комиссии самими выплатами. Смётся и при пустом
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

    const to = getAssociatedTokenAddressSync(config.mint, config.admin);
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
      `выручка: $${(Number(amount) / 10 ** decimals).toFixed(2)} → владелец ${config.admin.toBase58()}, ${signature}`,
    );
  }

  // Правила защиты покупателя - те же, что у приложения: одно место на оба.
  const now = () => Math.floor(Date.now() / 1000);
  const asSale = (sale: ChainSale) => ({
    closesAt: Number(sale.closesAt.toString()),
    proofDeadline: Number(sale.proofDeadline.toString()),
    provedAt: Number(sale.provedAt.toString()),
  });
  const asSpot = (lot: ChainLot) => ({ disputed: lot.disputed, disputedAt: Number(lot.disputedAt.toString()) });

  const lotPdaOf = (id: string) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("lot"), Buffer.from(id.replace(/-/g, ""), "hex")],
      program.programId,
    )[0];

  // Программа платит на готовый счёт продавца в монете торга и сама его не
  // заводит. Заводим его сами, если нет; если есть - инструкция пустая.
  const sellerAccount = (lot: ChainLot, sale: ChainSale) =>
    createAssociatedTokenAccountIdempotentInstruction(
      crank.publicKey,
      getAssociatedTokenAddressSync(lot.mint, sale.seller),
      sale.seller,
      lot.mint,
    );

  const pay = (lotPda: PublicKey, lot: ChainLot, sale: ChainSale) =>
    program.methods
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
      .preInstructions([sellerAccount(lot, sale)])
      .rpc();

  // Закрыть место: без победителя - вернуть ставку ниже резерва, с
  // победителем - вернуть ставку, если пруф пропущен или арбитр молчал.
  // Счёт участника заводим, если его нет: закрыв свой счёт, он застопорил
  // бы возврат самому себе - и закрытие места вместе с ним.
  const close = (lotPda: PublicKey, lot: ChainLot, sale: ChainSale) =>
    program.methods
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
      .preInstructions([
        sellerAccount(lot, sale),
        ...(lot.topBidder
          ? [
              createAssociatedTokenAccountIdempotentInstruction(
                crank.publicKey,
                getAssociatedTokenAddressSync(lot.mint, lot.topBidder as PublicKey),
                lot.topBidder as PublicKey,
                lot.mint,
              ),
            ]
          : []),
      ])
      .rpc();

  const mark = (id: string, patch: Record<string, unknown>) =>
    rest(`lots?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });

  // Проход 1: торг закрылся по часам базы. Решают часы цепи - ставка могла
  // продлить торг.
  const due = await rest(`lots?status=eq.open&closes_at=lt.${new Date().toISOString()}&select=id`);
  for (const row of due) {
    const label = row.id.slice(0, 8);
    try {
      const lotPda = lotPdaOf(row.id);
      if (!(await connection.getAccountInfo(lotPda))) {
        // Строка есть, аккаунта нет: лот другой программы или закрыт мимо
        // базы. Чинить руками, а не автоматом: молча сменить статус значит
        // спрятать расхождение.
        console.log(`${label}: в цепи нет аккаунта - пропуск, нужен взгляд`);
        continue;
      }
      const lot = await fetchLot(program, lotPda);
      const sale = await fetchSale(program, lot.sale);
      if (now() < Number(sale.closesAt.toString())) {
        console.log(`${label}: цепь продлила торг, ещё идёт`);
        continue;
      }
      const won = hasWinner({
        topBid: BigInt(lot.topBid.toString()),
        reserve: BigInt(lot.reserve.toString()),
        hasBid: lot.topBidder !== null,
      });

      if (!won) {
        const signature = await close(lotPda, lot, sale);
        await mark(row.id, { status: "unsold", settle_signature: signature });
        console.log(`${label}: закрыт без победителя, ${signature}`);
      } else if (!hasBuyerProtection({ proofDeadline: Number(sale.proofDeadline.toString()) })) {
        // Торг до защиты покупателя: платит сразу, как раньше.
        const signature = await pay(lotPda, lot, sale);
        await mark(row.id, { status: "won", settle_signature: signature, chain_sale: lot.sale.toBase58() });
        console.log(`${label}: выплачен (старый торг), ${signature}`);
      } else {
        // Выигран, деньги ждут пруфа. Счёт продавца заводим сразу: выплату
        // может позвать и победитель из приложения, и арбитр.
        await provider.sendAndConfirm(new Transaction().add(sellerAccount(lot, sale)));
        // Адрес торга - из цепочки, а не тот, что вписал продавец при
        // публикации: по нему принимается пруф, и чужой адрес здесь позволил
        // бы занять пруф чужого торга.
        await mark(row.id, { status: "won", chain_sale: lot.sale.toBase58() });
        console.log(`${label}: выигран, ждёт пруфа до ${new Date(Number(sale.proofDeadline.toString()) * 1000).toISOString()}`);
      }
    } catch (error) {
      // Один упавший лот не должен запирать остальные: у каждого своя судьба.
      console.error(`${label}: не разобран -`, error);
      process.exitCode = 1;
    }
  }

  // Проход 2: выигранные места с защитой покупателя, ещё не рассчитанные.
  const waiting = await rest(
    "lots?status=eq.won&settle_signature=is.null&chain_sale=not.is.null&select=id",
  );
  for (const row of waiting) {
    const label = row.id.slice(0, 8);
    try {
      const lotPda = lotPdaOf(row.id);
      if (!(await connection.getAccountInfo(lotPda))) {
        // Место закрыли мимо расчёта: победитель подтвердил в приложении,
        // решил арбитр или кто-то позвал возврат. Итог - по той транзакции.
        const [last] = await connection.getSignaturesForAddress(lotPda, { limit: 1 });
        const tx = last ? await connection.getTransaction(last.signature, { maxSupportedTransactionVersion: 0 }) : null;
        const logs = (tx?.meta?.logMessages ?? []).join("\n");
        const refunded =
          logs.includes("Instruction: SellerClosesLot") ||
          (logs.includes("Instruction: ArbiterDecides") &&
            (await rest(`disputes?lot_id=eq.${row.id}&select=seller_bps`))[0]?.seller_bps === 0);
        await mark(row.id, { status: refunded ? "refunded" : "won", settle_signature: last?.signature ?? "closed" });
        console.log(`${label}: закрыт в приложении - ${refunded ? "возврат" : "выплата"}`);
        continue;
      }
      const lot = await fetchLot(program, lotPda);
      const sale = await fetchSale(program, lot.sale);
      const t = now();
      if (disputeLapsed(asSpot(lot), t)) {
        const signature = await close(lotPda, lot, sale);
        await mark(row.id, { status: "refunded", settle_signature: signature });
        console.log(`${label}: арбитр молчал 30 дней - ставка победителю, ${signature}`);
      } else if (lot.disputed) {
        console.log(`${label}: спор, ждёт арбитра`);
      } else if (proofMissed(asSale(sale), t)) {
        const signature = await close(lotPda, lot, sale);
        await mark(row.id, { status: "refunded", settle_signature: signature });
        console.log(`${label}: пруфа нет к сроку - ставка победителю, ${signature}`);
      } else if (pays(asSale(sale), t, false)) {
        const signature = await pay(lotPda, lot, sale);
        await mark(row.id, { settle_signature: signature });
        console.log(`${label}: окно прошло - выплачен, ${signature}`);
      }
    } catch (error) {
      console.error(`${label}: не разобран -`, error);
      process.exitCode = 1;
    }
  }

  await sweepProceeds();

  // Напоминания по времени - в очередь уведомлений: конец торга через час,
  // последние сутки на проверку пруфа, срок пруфа у продавца. Упало - расчёт
  // от этого не страдает, следующий проход положит их снова.
  try {
    const added = await rest("rpc/queue_reminders", { method: "POST", body: "{}" });
    if (added) console.log(`напоминаний в очередь: ${added}`);
  } catch (error) {
    console.error("напоминания не поставлены -", error);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});