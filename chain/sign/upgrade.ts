/// <reference lib="dom" />
/**
 * Страница подписи обновления программы кошельком Phantom.
 *
 * Право обновления - у ключа владельца в Phantom, на машине его нет. Поэтому
 * обновление в два шага:
 *
 * 1. Рабочий ключ заливает новую версию во временный буфер и отдаёт буфер
 *    владельцу (`solana program write-buffer`, `set-buffer-authority`). Это
 *    сотни транзакций, и подписывать их в Phantom по одной незачем.
 * 2. Владелец здесь подписывает одну транзакцию: расширить программу, если
 *    новая версия больше, и заменить код на код из буфера. Залог буфера
 *    возвращается на кошелёк владельца - он указан получателем возврата.
 *
 * Перед подписью страница сверяет с сетью, что право обновления и буфер
 * принадлежат подключённому кошельку, и прогоняет транзакцию вхолостую:
 * показывает, сколько SOL будет на кошельке после неё.
 *
 * Сборка (из chain/): ../node_modules/.pnpm/esbuild@0.28.1/node_modules/esbuild/bin/esbuild
 *   sign/upgrade.ts --bundle --format=iife --platform=browser
 *   --alias:buffer=./node_modules/.pnpm/buffer@6.0.3/node_modules/buffer
 *   --outfile=sign/dist/upgrade.js
 * Запуск: python3 -m http.server 3200 -d sign, открыть localhost:3200.
 */
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { inspect, nextStep } from "./tx";

type Phantom = {
  isPhantom?: boolean;
  publicKey: PublicKey | null;
  connect(): Promise<{ publicKey: PublicKey }>;
  signAndSendTransaction(tx: Transaction): Promise<{ signature: string }>;
};

const $ = (id: string) => document.getElementById(id)!;
const say = (id: string, text: string) => ($(id).textContent = text);
const sol = (lamports: number) => `${(lamports / 1e9).toFixed(6)} SOL`;

// Адрес программы - полем: репетиция идёт на копии программы в devnet.
let PROGRAM = new PublicKey("4zBp61iGL7f9zybTfrtwydUZmM2WxRsskedqFNdHiDpe");

let ready: { tx: Transaction; connection: Connection } | null = null;

async function check() {
  ready = null;
  ($("sign") as HTMLButtonElement).disabled = true;
  say("report", "Проверяю…");
  try {
    const phantom = (window as unknown as { phantom?: { solana?: Phantom } }).phantom?.solana;
    if (!phantom?.isPhantom) throw new Error("Phantom не найден в этом браузере");
    const owner = phantom.publicKey ?? (await phantom.connect()).publicKey;
    const connection = new Connection(($("rpc") as HTMLInputElement).value.trim(), "confirmed");
    PROGRAM = new PublicKey(($("program") as HTMLInputElement).value.trim());
    const buffer = new PublicKey(($("buffer") as HTMLInputElement).value.trim());
    const info = await inspect(connection, PROGRAM, buffer);

    const lines = [
      `Сеть:                 ${($("rpc") as HTMLInputElement).value.trim()}`,
      `Кошелёк:              ${owner.toBase58()}`,
      `Программа:            ${PROGRAM.toBase58()}`,
      `Право обновления:     ${info.upgradeAuthority?.toBase58() ?? "нет - программа заморожена"}`,
      `Владелец буфера:      ${info.bufferAuthority?.toBase58() ?? "нет"}`,
      `Код сейчас / новый:   ${info.codeNow} / ${info.codeNew} байт`,
      `Расширить на:         ${info.extend} байт`,
      `Залог буфера:         ${sol(info.bufferLamports)} - вернётся на кошелёк`,
    ];
    if (!info.upgradeAuthority?.equals(owner)) throw new Error(`${lines.join("\n")}\n\nПраво обновления не у этого кошелька.`);
    if (!info.bufferAuthority?.equals(owner)) throw new Error(`${lines.join("\n")}\n\nБуфер не передан этому кошельку.`);

    const before = await connection.getBalance(owner);
    // Холостой прогон: та же транзакция без подписи, с балансом кошелька после.
    const sim = await nextStep(connection, owner, PROGRAM, buffer, info.programData, info.extend);
    if (sim.err) {
      throw new Error(`${lines.join("\n")}\n\nХолостой прогон не прошёл: ${JSON.stringify(sim.err)}\n${sim.logs.join("\n")}`);
    }
    const tx = sim.tx;
    ($("sign") as HTMLButtonElement).textContent = sim.step === "extend" ? "Подписать: расширить" : "Подписать: обновить";
    const after = sim.after ?? before;
    lines.push(
      "",
      sim.step === "extend"
        ? `Шаг 1 из 2: расширить программу${sim.checked ? "" : " (прежней инструкцией - новая в этой сети не включена)"}. После него нажми «Проверить» ещё раз.`
        : `Шаг ${info.extend === 0 && info.codeNew > info.codeNow ? "2 из 2" : "последний"}: обновить код. Залог буфера вернётся на кошелёк.`,
      `Холостой прогон: прошёл`,
      `На кошельке сейчас:   ${sol(before)}`,
      `После подписи:        ${sol(after)}  (${after >= before ? "+" : ""}${sol(after - before)})`,
    );
    say("report", lines.join("\n"));
    ready = { tx, connection };
    ($("sign") as HTMLButtonElement).disabled = false;
  } catch (error) {
    say("report", error instanceof Error ? error.message : String(error));
  }
}

async function sign() {
  if (!ready) return;
  ($("sign") as HTMLButtonElement).disabled = true;
  try {
    const phantom = (window as unknown as { phantom: { solana: Phantom } }).phantom.solana;
    const { signature } = await phantom.signAndSendTransaction(ready.tx);
    say("result", `Отправлено: ${signature}\nЖду подтверждения…`);
    await ready.connection.confirmTransaction(signature, "confirmed");
    say("result", `Готово: ${signature}\nПроверь: solana program show ${PROGRAM.toBase58()}`);
  } catch (error) {
    say("result", error instanceof Error ? error.message : String(error));
  }
}

$("check").addEventListener("click", () => void check());
$("sign").addEventListener("click", () => void sign());
const params = new URLSearchParams(location.search);
if (params.get("rpc")) ($("rpc") as HTMLInputElement).value = params.get("rpc")!;
if (params.get("program")) ($("program") as HTMLInputElement).value = params.get("program")!;
if (params.get("buffer")) ($("buffer") as HTMLInputElement).value = params.get("buffer")!;
