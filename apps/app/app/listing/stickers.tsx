"use client";

import { useEffect, useState } from "react";
import { useLogin, usePrivy } from "@privy-io/react-auth";
import {
  useConnectedStandardWallets,
  useStandardSignTransaction,
} from "@privy-io/react-auth/solana";
import { PublicKey } from "@solana/web3.js";
import { BRAND_MAX, cleanBrand, formatUsd, unitsToCents } from "@oxar/core";
import {
  WALLET_CHAIN,
  buyStickersTransaction,
  readSheet,
  sendSigned,
  settled,
  walletUnits,
  type ChainSheet,
} from "@/lib/chain";
import { uploadCreative } from "@/lib/auction";
import {
  STICKER_SIZES,
  draftSticker,
  loadStickers,
  type PaidSticker,
  type StickerSize,
} from "@/lib/stickers";

/**
 * Стикеры на вещи: цена одна, перебить нельзя, номеров ограниченно.
 *
 * Порядок шагов: логотип в хранилище, строка в базе, потом деньги. Строка
 * раньше денег намеренно: её id уходит в покупку тегом, и витрина покажет её,
 * только когда покупка с этим тегом есть в цепочке.
 */
export function Stickers({ thingId, sheetId }: { thingId: string; sheetId: string }) {
  const { authenticated } = usePrivy();
  const { login } = useLogin();
  const { wallets } = useConnectedStandardWallets();
  const { signTransaction } = useStandardSignTransaction();
  const wallet = wallets[0];

  const [sheet, setSheet] = useState<ChainSheet | null>(null);
  const [paid, setPaid] = useState<PaidSticker[]>([]);
  const [name, setName] = useState("");
  const [size, setSize] = useState<StickerSize>("10x10");
  const [count, setCount] = useState(1);
  const [logo, setLogo] = useState<{ url: string; file: File } | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bought, setBought] = useState(false);

  useEffect(() => {
    let live = true;
    void loadStickers(thingId, sheetId).then((loaded) => {
      if (!live || !loaded) return;
      setSheet(loaded.sheet);
      setPaid(loaded.paid);
    });
    return () => {
      live = false;
    };
  }, [thingId, sheetId, bought]);

  useEffect(() => {
    if (!wallet || !sheet) return;
    let live = true;
    void walletUnits(sheet.mint, new PublicKey(wallet.address)).then((units) => {
      if (live) setBalance(unitsToCents(units));
    });
    return () => {
      live = false;
    };
  }, [wallet, sheet]);

  if (!sheet) return null;

  const price = unitsToCents(sheet.price);
  const left = sheet.cap - sheet.sold;
  const total = price * count;

  async function buy() {
    setError("");
    if (!wallet) return setError("No wallet connected. Sign in again to get one.");
    if (!logo) return setError("Add your logo first - it is what we print.");
    const brand = cleanBrand(name);
    if (!brand) return setError("Name the project - people have to know whose logo this is.");

    setBusy(true);
    try {
      // Сколько осталось, спрашиваем у цепочки: пока человек выбирал, могли
      // раскупить. Номер покупки - тоже оттуда.
      const fresh = await readSheet(sheetId);
      if (!fresh) return setError("Could not read the stickers on chain. Try again.");
      if (fresh.cap - fresh.sold < count) {
        setSheet(fresh);
        return setError(fresh.sold >= fresh.cap ? "All stickers are sold." : `Only ${fresh.cap - fresh.sold} left.`);
      }

      const logoUrl = await uploadCreative(`stickers-${thingId}`, logo.file);
      if (!logoUrl) return setError("Could not upload the logo. Try again.");
      const id = crypto.randomUUID();
      if (!(await draftSticker({ id, thingId, name: brand, size, logoUrl }))) {
        return setError("Could not save the sticker. Nothing was charged. Try again.");
      }

      const buyer = new PublicKey(wallet.address);
      const transaction = await buyStickersTransaction(sheetId, fresh, buyer, count, id);
      const { signedTransaction } = await signTransaction({
        transaction: transaction.serialize(),
        wallet,
        chain: WALLET_CHAIN,
      });
      const signature = await sendSigned(signedTransaction);
      const outcome = await settled(signature);
      if (outcome === "failed") {
        return setError("The chain turned the purchase down. Nothing was charged. Try again.");
      }
      if (outcome === "unknown") {
        return setError(`We lost sight of the purchase. Look up ${signature} before buying again.`);
      }

      setName("");
      setLogo(null);
      setCount(1);
      setBought((was) => !was);
    } catch (cause) {
      const said = cause instanceof Error ? cause.message : String(cause);
      setError(/reject|denied|cancel/i.test(said) ? "You turned the purchase down." : `The purchase did not go through: ${said}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stickers">
      <div className="pick-head">
        <span className="pick-title">Stickers</span>
        <span className="muted small">
          {left > 0 ? `${left} of ${sheet.cap} left` : `All ${sheet.cap} sold`} · {formatUsd(price)} each
        </span>
      </div>
      <p className="muted small">
        Your logo and project name as a sticker on the van. Fixed price, no outbid. The crew gets{" "}
        {formatUsd(price - (price * sheet.feeBps) / 10_000)} of every sticker, OXAR keeps the rest.
      </p>

      {paid.length > 0 && (
        <div className="sticker-wall" role="list" aria-label="Stickers on the van">
          {paid.map((sticker) => (
            <div key={sticker.id} className="sticker-tile" role="listitem">
              <img src={sticker.logoUrl} alt="" />
              <span>{sticker.name}</span>
              {sticker.count > 1 && <em>×{sticker.count}</em>}
            </div>
          ))}
        </div>
      )}

      {left > 0 &&
        (!authenticated ? (
          <button type="button" className="primary" onClick={login}>
            Sign in to buy a sticker
          </button>
        ) : (
          <div className="bid-card">
            <label className="bid-brand">
              <input
                value={name}
                maxLength={BRAND_MAX}
                placeholder="Project name"
                aria-label="Whose logo is this"
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <label className="art-row">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) setLogo({ url: URL.createObjectURL(file), file });
                  event.target.value = "";
                }}
              />
              {logo ? (
                <>
                  <img src={logo.url} alt="" />
                  <span className="art-row-name">{logo.file.name}</span>
                </>
              ) : (
                <>
                  <span className="art-row-name">Upload logo</span>
                  <span className="art-row-hint">PNG, JPG, SVG or WebP</span>
                </>
              )}
            </label>

            <div className="bumps" role="group" aria-label="Sticker size">
              {STICKER_SIZES.map((one) => (
                <button
                  key={one.code}
                  type="button"
                  className={one.code === size ? "bump on" : "bump"}
                  aria-pressed={one.code === size}
                  onClick={() => setSize(one.code)}
                >
                  {one.label}
                </button>
              ))}
            </div>

            <div className="bumps" role="group" aria-label="How many stickers">
              <button type="button" className="bump" disabled={count <= 1} onClick={() => setCount(count - 1)}>
                -
              </button>
              <span className="sticker-count">
                {count} {count === 1 ? "sticker" : "stickers"}
              </span>
              <button type="button" className="bump" disabled={count >= left} onClick={() => setCount(count + 1)}>
                +
              </button>
            </div>

            {balance !== null && (
              <span className="bal-row">
                <span>Wallet balance</span>
                <b>{formatUsd(balance)} USDC</b>
              </span>
            )}
            {balance !== null && total > balance && (
              <span className="bid-balance short">Not enough USDC. Top up on the You tab.</span>
            )}
            {error && <p className="bad">{error}</p>}

            <button type="button" className="primary bid-go" disabled={busy} onClick={() => void buy()}>
              {busy ? "Buying…" : `Buy for ${formatUsd(total)}`}
            </button>
          </div>
        ))}
    </div>
  );
}
