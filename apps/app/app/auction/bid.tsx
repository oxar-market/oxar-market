"use client";

import { useEffect, useRef, useState } from "react";
import { useLogin, usePrivy } from "@privy-io/react-auth";
import {
  useConnectedStandardWallets,
  useStandardSignTransaction,
} from "@privy-io/react-auth/solana";
import { PublicKey } from "@solana/web3.js";
import { BRAND_MAX, cleanBrand, formatUsd, parseUsd } from "@oxar/core";
import {
  WALLET_CHAIN,
  bidTransaction,
  minNextCents,
  readLot,
  sendSigned,
  settled,
  walletUnits,
} from "@/lib/chain";
import { recordBid, uploadCreative, type Lot } from "@/lib/auction";

/**
 * Ставка.
 *
 * Деньги уходят из кошелька той же секунды - это и есть ответ на «поставлю
 * миллиард, а платить не буду». Прежнему лидеру его сумма возвращается той же
 * транзакцией, поэтому его счёт стоит в ней отдельной строкой, и берётся он
 * из цепочки, а не из нашей базы: разойдись они, транзакция просто не пройдёт.
 *
 * Порядок шагов выбран так, чтобы неудача на любом из них не оставила ставку
 * без картинки: сначала креатив в хранилище, потом деньги, потом строка.
 * Строка - последняя и самая безобидная: она витрина, а торг живёт в цепочке.
 */

/** Прибавки к сумме. Три штуки: длинный ряд читается как работа. */
const BUMPS = [500, 1000, 2500];

type Art = { url: string; file: File };

export function BidForm({
  lot,
  need,
  spotLabel,
  topCents,
  art,
  onPlaced,
}: {
  lot: Lot;
  /** Минимум по нашей витрине. Цепочку спросим ещё раз перед отправкой. */
  need: number;
  /** Подпись места - форма называет, за что торг. */
  spotLabel: string;
  /** Верхняя ставка места; null - ставок ещё нет. */
  topCents: number | null;
  art: Art | undefined;
  onPlaced: () => void;
}) {
  const { authenticated } = usePrivy();
  const { login } = useLogin();
  const { wallets } = useConnectedStandardWallets();
  const { signTransaction } = useStandardSignTransaction();

  const [amount, setAmount] = useState("");
  const [brand, setBrand] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Сколько USDC на кошельке, в центах. null - ещё не прочитали или прочитать
  // не вышло: тогда строку баланса просто не показываем, а не врём нулём.
  const [balance, setBalance] = useState<number | null>(null);

  // Поле само встаёт на минимум и следует за ним, пока цифру не тронул
  // человек. Помним, что вписал автомат: верхние ставки доезжают позже
  // формы, и первый минимум бывает резервом - без этой памяти поле застревало
  // на $5, когда перебить уже стоило $15. Своё, набранное руками, не трогаем.
  const auto = useRef("");
  useEffect(() => {
    if (busy) return;
    const next = (need / 100).toFixed(2);
    setAmount((was) => {
      if (was !== "" && was !== auto.current) return was;
      auto.current = next;
      return next;
    });
  }, [need, busy]);

  const wallet = wallets[0];

  // Баланс кошелька по монете торга. Читаем, когда кошелёк известен, и заново
  // после каждой прошедшей ставки: она меняет остаток. Монету берём из лота в
  // цепочке - ставка идёт в неё. Всё в try внутри walletUnits, рендер этим не
  // уронить.
  useEffect(() => {
    if (!wallet) return;
    let live = true;
    (async () => {
      const chainLot = await readLot(lot.id);
      if (!chainLot || !live) return;
      const units = await walletUnits(chainLot.mint, new PublicKey(wallet.address));
      if (live) setBalance(Number(units / 10_000n));
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, [wallet, lot.id, busy]);
  const cents = parseUsd(amount);
  // Чего не хватает до ставки. Оба условия обязательны и проверяются всё
  // равно - но проверялись они только при нажатии, а кнопка к этому моменту
  // уже стояла серой, и человек оставался с недоступной кнопкой и без причины.
  const needsArt = !art;
  const needsName = !cleanBrand(brand);
  const ready = !needsArt && !needsName;

  function bump(by: number) {
    const from = cents ?? need;
    setAmount(((from + by) / 100).toFixed(2));
  }

  async function place() {
    setError("");
    if (!art) return setError("Add your artwork first - it goes in with the bid.");
    if (!wallet) return setError("No wallet connected. Sign in again to get one.");
    if (cents === null) return setError("That is not an amount. Try 75 or 75.50.");
    const name = cleanBrand(brand);
    if (!name) {
      return setError("Name the startup - people have to know whose logo this is.");
    }

    setBusy(true);
    try {
      // Минимум спрашиваем у цепочки, а не у экрана: пока человек набирал,
      // его могли перебить, и тогда программа отвергла бы ставку сама.
      const chainLot = await readLot(lot.id);
      if (!chainLot) {
        return setError("This spot is not open on chain yet. Nothing to bid on.");
      }
      const least = Math.max(need, minNextCents(chainLot));
      if (cents < least) {
        return setError(`The bid has to be at least ${formatUsd(least)} now.`);
      }

      const mediaUrl = await uploadCreative(lot.id, art.file);
      if (!mediaUrl) return setError("Could not upload the artwork. Try again.");

      const bidder = new PublicKey(wallet.address);
      const transaction = await bidTransaction(lot.id, chainLot, bidder, cents);
      // Privy только подписывает, а шлём и ждём подтверждения мы сами.
      // Раньше звали signAndSendTransaction - он отправляет и ждёт по своему
      // WebSocket, и на нестабильном сокете падал «Something went wrong» уже
      // после того, как транзакция ушла в сеть: деньги списывались, а ставка
      // до записи в базу не доходила. Своя отправка ждёт по HTTP (`settled`),
      // и один сорванный сокет её не роняет.
      const { signedTransaction } = await signTransaction({
        transaction: transaction.serialize(),
        wallet,
        chain: WALLET_CHAIN,
      });
      const signature = await sendSigned(signedTransaction);

      const outcome = await settled(signature);
      if (outcome === "failed") {
        return setError("The chain turned the bid down. Nothing was charged.");
      }
      if (outcome === "unknown") {
        return setError(
          `We lost sight of the bid. Look up ${signature} before bidding again.`,
        );
      }

      // Деньги уже в хранилище торга, поэтому неудача записи - не отказ в
      // ставке, а расхождение витрины с цепочкой. Подпись показываем: по ней
      // ставку видно в обозревателе, даже если наш экран о ней не знает.
      const written = await recordBid({
        lotId: lot.id,
        wallet: wallet.address,
        amountCents: cents,
        mediaUrl,
        brand: name,
        signature,
      });
      if (!written) {
        return setError(
          `Your bid went through as ${signature}, but we could not show it here.`,
        );
      }

      setAmount("");
      onPlaced();
    } catch (cause) {
      setError(reason(cause));
    } finally {
      setBusy(false);
    }
  }

  if (!authenticated) {
    return (
      <div className="bidding">
        <button type="button" className="primary" onClick={login}>
          Sign in to bid
        </button>
        <p className="muted">
          Bidding takes a wallet with USDC. Signing in makes you one if you do
          not have it.
        </p>
      </div>
    );
  }

  return (
    <div className="bidding">
      <div className="bid-card">
        {/* Форма называет место и цену, которую бьём: человек пришёл сюда
            кнопкой или сеткой, и заголовок подтверждает, куда он попал. */}
        <div className="bid-head">
          <span className="bid-head-title">Bid on spot {spotLabel}</span>
          <span className="muted small">
            {topCents === null ? `reserve ${formatUsd(need)}` : `leading ${formatUsd(topCents)}`}
          </span>
        </div>

        {/* Чьё лого - вопрос той же важности, что сумма: картинка без имени
            остаётся картинкой без хозяина, по кошельку его не узнать.
            Поэтому имя стоит в той же рамке, а не отдельным шагом. */}
        <label className="bid-brand">
          <input
            value={brand}
            maxLength={BRAND_MAX}
            placeholder="Startup name"
            aria-label="Whose logo is this"
            onChange={(event) => setBrand(event.target.value)}
          />
        </label>

        {/* Поле суммы и под ним баланс - одним блоком, чтобы баланс читался
            как свойство этой суммы, а не как отдельная строка где-то ниже.
            Ставить, не видя своих денег, - вслепую; красным, когда набранной
            ставки не хватает, до нажатия, а не после отказа. Нет числа -
            строки нет: пустого «$0.00» на непрочитанном балансе быть не должно. */}
        <div className="bid-amount">
          <label className="bid-field">
            <span className="bid-sign">$</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-label="Your bid in USDC"
            />
            <span className="bid-unit">USDC</span>
          </label>
          {balance !== null && (
            <span className="bal-row">
              <span>Wallet balance</span>
              <b>{formatUsd(balance)} USDC</b>
            </span>
          )}
          {balance !== null && cents !== null && cents > balance && (
            // Когда не хватает - сразу и куда идти: человек с нулём на этом
            // месте однажды решил, что деньги пропали.
            <span className="bid-balance short">
              Not enough for this bid. Top up on the You tab.
            </span>
          )}
        </div>

        <div className="bumps">
          {/* Первый чип - минимум: одно нажатие возвращает поле к цене,
              которую примет программа. */}
          <button
            type="button"
            className="bump"
            onClick={() => setAmount((need / 100).toFixed(2))}
          >
            Min {formatUsd(need)}
          </button>
          {BUMPS.map((by) => (
            <button key={by} type="button" className="bump" onClick={() => bump(by)}>
              +{formatUsd(by)}
            </button>
          ))}
        </div>

        {/* Кнопка приглушена, но нажимается. Недоступная кнопка не отвечает
            на «почему», и человек остаётся гадать; эта на нажатие называет
            недостающий шаг - проверки для этого уже написаны в `place`. */}
        <button
          type="button"
          className={ready ? "primary bid-go" : "primary bid-go waiting"}
          aria-disabled={!ready}
          aria-describedby="bid-hint"
          disabled={busy}
          onClick={() => void place()}
        >
          {busy ? "Bidding…" : "Bid"}
        </button>
      </div>

      {error ? (
        <p className="bad">{error}</p>
      ) : (
        <p className="muted" id="bid-hint">
          {needsArt && needsName
            ? "Two things before you can bid: your artwork on the shirt, and the name of the startup it belongs to."
            : needsArt
              ? "Try your artwork on the shirt first - a bid without it has nothing to print."
              : needsName
                ? "Name the startup - people have to know whose logo they are looking at."
                : "Your artwork goes public with the bid. The money leaves your wallet now and comes back if someone outbids you."}
        </p>
      )}
    </div>
  );
}

/** Что показать вместо отказа кошелька. Их собственные слова читать нельзя. */
function reason(cause: unknown): string {
  const said = cause instanceof Error ? cause.message : String(cause);
  if (/reject|denied|cancel/i.test(said)) return "You turned the bid down.";
  if (/insufficient|0x1$/i.test(said)) return "Not enough USDC in the wallet.";
  // На время охоты за багами запуска показываем настоящую причину, а не
  // «did not go through»: без неё на телефоне не понять, что сломалось.
  // Вернуть общий текст, когда торги пойдут.
  return `The bid did not go through: ${said || "unknown error"}`;
}
