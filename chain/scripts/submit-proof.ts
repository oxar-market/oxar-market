/**
 * Пруф нашего торга: фото в хранилище, хеш записи - в программу подписью
 * продавца, запись - в базу. То же, что кнопка «Submit proof» в кабинете
 * продавца, но для торгов, которые открывал скрипт: их продавец - рабочий
 * ключ на этой машине, а не кошелёк в Privy, и кнопка за него не подпишет.
 *
 *   cd chain
 *   SOLANA_RPC=<mainnet> pnpm exec ts-node --compilerOptions '{"module":"commonjs"}' \
 *     scripts/submit-proof.ts --sale=<uuid торга> --thing=<slug> --photo=<файл> \
 *       --note="..." [--links=https://a,https://b] [--dry]
 *
 * --dry - всё проверить и показать хеш, ничего не грузить и не подписывать.
 *
 * Хешируется ровно то, что ляжет в базу (proofPayload из packages/core): иначе
 * запись разойдётся с хешем в программе, и сверить пруф будет нечем.
 */
import * as anchor from "@anchor-lang/core";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { extname } from "node:path";
// Правила - из packages/core прямым путём: пакетом ts-node его не возьмёт.
import { normalizeProof, proofPayload } from "../../packages/core/src/proof-payload";

const RPC = process.env.SOLANA_RPC ?? "https://api.devnet.solana.com";

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
const auth = { apikey: key, Authorization: `Bearer ${key}` };

async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { ...auth, "Content-Type": "application/json", Prefer: "return=representation", ...init.headers },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${path}: ${response.status} ${body}`);
  return body ? JSON.parse(body) : null;
}

const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".mov": "video/quicktime" };

async function main() {
  const saleId = arg("sale");
  const thingSlug = arg("thing");
  const photoFile = arg("photo");
  const note = arg("note") ?? "";
  const links = (arg("links") ?? "").split(",");
  const dry = process.argv.includes("--dry");
  if (!saleId || !thingSlug || !photoFile) throw new Error("нужны --sale, --thing и --photo");
  const ext = extname(photoFile).toLowerCase();
  const type = TYPES[ext];
  if (!type) throw new Error(`не знаю тип файла ${ext}`);

  const seller = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, "utf8"))),
  );
  const connection = new Connection(RPC, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(seller), { commitment: "confirmed" });
  anchor.setProvider(provider);
  const idl = JSON.parse(readFileSync("idl/oxar_escrow.json", "utf8"));
  const program = new anchor.Program(idl, provider);

  const saleBytes = Buffer.from(saleId.replace(/-/g, ""), "hex");
  const [salePda] = PublicKey.findProgramAddressSync([Buffer.from("sale"), saleBytes], program.programId);
  const account = await connection.getAccountInfo(salePda);
  if (!account) throw new Error(`торга ${saleId} нет в цепочке`);
  // Продавец торга - сразу за дискриминатором и uuid. Подписать пруф может
  // только он: чужую подпись программа отвергнет, лучше узнать это до неё.
  const saleSeller = new PublicKey(account.data.subarray(8 + 16, 8 + 16 + 32));
  if (!saleSeller.equals(seller.publicKey)) {
    throw new Error(`продавец торга ${saleSeller.toBase58()}, а ключ здесь ${seller.publicKey.toBase58()}`);
  }

  const [thing] = await rest(`things?slug=eq.${thingSlug}&select=id,title`);
  if (!thing) throw new Error(`вещи ${thingSlug} нет в каталоге`);
  const [already] = await rest(`proofs?sale=eq.${salePda.toBase58()}&select=sale`);
  if (already) throw new Error("пруф этого торга уже записан");

  const path = `proof/${thing.id}/${randomUUID()}${ext}`;
  const parts = normalizeProof({ photos: [path], links, note });
  const hash = createHash("sha256").update(proofPayload(parts)).digest();

  console.log(`\n  ${thing.title}`);
  console.log(`  торг      ${salePda.toBase58()}`);
  console.log(`  продавец  ${seller.publicKey.toBase58()}`);
  console.log(`  фото      ${path}`);
  console.log(`  подпись   ${parts.note || "-"}`);
  console.log(`  хеш       ${hash.toString("hex")}`);
  if (dry) {
    console.log("\n  --dry: ничего не загружено и не подписано\n");
    return;
  }

  const upload = await fetch(`${url}/storage/v1/object/things/${path}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": type },
    body: readFileSync(photoFile),
  });
  if (!upload.ok) throw new Error(`фото не загрузилось: ${upload.status} ${await upload.text()}`);

  const signature = await program.methods
    .sellerSubmitsProof(Array.from(hash))
    .accounts({ seller: seller.publicKey, sale: salePda })
    .rpc();

  await rest("proofs", {
    method: "POST",
    body: JSON.stringify({
      sale: salePda.toBase58(),
      thing_id: thing.id,
      photos: parts.photos,
      links: parts.links,
      note: parts.note || null,
      hash: hash.toString("hex"),
      signature,
    }),
  });

  console.log(`  в цепи    ${signature}`);
  console.log("  пруф записан: у победителя 72 часа, подтвердит - выплата сразу\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
