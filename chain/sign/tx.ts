/**
 * Транзакция обновления программы владельцем: общая для страницы подписи и
 * для проверки скриптом, чтобы проверялся ровно тот код, которым подписывают.
 */
import { Buffer } from "buffer";
import {
  Connection,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

export const LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
// Загрузчик не расширяет программу меньше чем на 10 КБ за раз.
const MIN_EXTEND = 10_240;
// Заголовки аккаунтов загрузчика: буфер - 37 байт, данные программы - 45.
const BUFFER_HEADER = 37;
const PROGRAMDATA_HEADER = 45;

function u32(index: number, value?: number): Buffer {
  const data = Buffer.alloc(value === undefined ? 4 : 8);
  data.writeUInt32LE(index, 0);
  if (value !== undefined) data.writeUInt32LE(value, 4);
  return data;
}

/** Права и размеры прямо из сети: у программы, у её данных и у буфера. */
export async function inspect(connection: Connection, program: PublicKey, buffer: PublicKey) {
  const [programData] = PublicKey.findProgramAddressSync([program.toBuffer()], LOADER);
  const [data, buf] = await connection.getMultipleAccountsInfo([programData, buffer]);
  if (!data) throw new Error("у программы нет аккаунта данных в этой сети");
  if (!buf) throw new Error("буфера с таким адресом нет в этой сети");
  if (!buf.owner.equals(LOADER)) throw new Error("это не буфер загрузчика программ");
  // ProgramData: тег 3, слот (8), есть ли владелец (1), владелец (32).
  const upgradeAuthority = data.data[12] === 1 ? new PublicKey(data.data.subarray(13, 45)) : null;
  // Buffer: тег 1, есть ли владелец (1), владелец (32).
  const bufferAuthority = buf.data[4] === 1 ? new PublicKey(buf.data.subarray(5, 37)) : null;
  const codeNow = data.data.length - PROGRAMDATA_HEADER;
  const codeNew = buf.data.length - BUFFER_HEADER;
  const missing = Math.max(0, codeNew - codeNow);
  const extend = missing === 0 ? 0 : Math.max(missing, MIN_EXTEND);
  return { programData, upgradeAuthority, bufferAuthority, codeNow, codeNew, extend, bufferLamports: buf.lamports };
}

/**
 * Расширить данные программы под новый код. Отдельной транзакцией: загрузчик
 * помечает программу изменённой в этом блоке, и обновление в том же блоке
 * отклоняется («Program was deployed in this block already»).
 *
 * ExtendProgramChecked (9) - с подписью владельца. Сети, где он ещё не
 * включён, знают только ExtendProgram (6) без неё: какой брать, решает
 * холостой прогон.
 */
export function buildExtend(
  owner: PublicKey,
  program: PublicKey,
  programData: PublicKey,
  extend: number,
  checked: boolean,
): Transaction {
  const keys = [
    { pubkey: programData, isSigner: false, isWritable: true },
    { pubkey: program, isSigner: false, isWritable: true },
    ...(checked ? [{ pubkey: owner, isSigner: true, isWritable: true }] : []),
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: owner, isSigner: true, isWritable: true },
  ];
  const tx = new Transaction().add(
    new TransactionInstruction({ programId: LOADER, keys, data: u32(checked ? 9 : 6, extend) }),
  );
  tx.feePayer = owner;
  return tx;
}

/** Заменить код на код из буфера; залог буфера - на кошелёк владельца (spill). */
export function buildUpgrade(owner: PublicKey, program: PublicKey, buffer: PublicKey, programData: PublicKey): Transaction {
  const tx = new Transaction().add(
    new TransactionInstruction({
      programId: LOADER,
      keys: [
        { pubkey: programData, isSigner: false, isWritable: true },
        { pubkey: program, isSigner: false, isWritable: true },
        { pubkey: buffer, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: false, isWritable: true },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: owner, isSigner: true, isWritable: false },
      ],
      data: u32(3),
    }),
  );
  tx.feePayer = owner;
  return tx;
}

/**
 * Следующий шаг и его холостой прогон. Код не влезает - шаг «расширить», иначе
 * «обновить». Возвращает транзакцию, прошедшую прогон, и баланс владельца
 * после неё.
 */
export async function nextStep(
  connection: Connection,
  owner: PublicKey,
  program: PublicKey,
  buffer: PublicKey,
  programData: PublicKey,
  extend: number,
) {
  const blockhash = (await connection.getLatestBlockhash()).blockhash;
  const run = async (tx: Transaction) => {
    tx.recentBlockhash = blockhash;
    const sim = await connection.simulateTransaction(tx.compileMessage(), undefined, [owner]);
    return { tx, sim: sim.value };
  };
  let step: "extend" | "upgrade" = extend > 0 ? "extend" : "upgrade";
  let checked = true;
  let result =
    step === "extend"
      ? await run(buildExtend(owner, program, programData, extend, true))
      : await run(buildUpgrade(owner, program, buffer, programData));
  if (step === "extend" && JSON.stringify(result.sim.err ?? "").includes("InvalidInstructionData")) {
    checked = false;
    result = await run(buildExtend(owner, program, programData, extend, false));
  }
  return {
    step,
    checked,
    tx: result.tx,
    err: result.sim.err,
    logs: result.sim.logs ?? [],
    after: result.sim.accounts?.[0]?.lamports ?? null,
  };
}
