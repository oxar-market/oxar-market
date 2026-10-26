"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { PublicKey } from "@solana/web3.js";
import { avatarLetter, formatUsd, shortWallet, spotName, unitsToCents, type Score } from "@oxar/core";
import { BUILD } from "@/lib/build";
import { connection, walletUnits } from "@/lib/chain";
import { loadMyStands, type MyStand } from "@/lib/auction";
import { db } from "@/lib/session";
import { amISeller, loadDealsToRate, type DealToRate } from "@/lib/seller";
import { BuyerRating, SellerFlow } from "./seller/flow.tsx";
import { amIAdmin } from "@/lib/admin";
import { Admin } from "./admin/admin.tsx";
import { SellerApply } from "./seller/apply.tsx";
import { YourWins } from "./wins.tsx";
import { Notifications } from "./notify.tsx";
import { loadScoreOf } from "@/lib/reviews";
import { signedInWith } from "@/lib/identity";

/**
 * Страница человека, собранная по дизайн-борду «OXAR Auction design
 * directions»: кошелёк сразу под личностью, баланс - герой экрана, ставки
 * с красной карточкой «перебили», роли одним переключателем.
 *
 * Кошелёк нарочно не называется «кошельком OXAR»: он принадлежит человеку -
 * либо создан Privy при входе почтой, либо это его собственный Phantom.
 * Путаница здесь стоила бы доверия, поэтому подпись говорит это прямо.
 */

export function You({
  onOpenAuction,
  linked,
}: {
  onOpenAuction: (thingId?: string) => void;
  /**
   * Сессия базы выписана на этого человека. До того в ней может сидеть
   * прежний вошедший, и всё, что читается от его имени - роль админа,
   * продавца, оценки, - ждёт этого флага.
   */
  linked: boolean;
}) {
  const { user, logout } = usePrivy();
  const wallet = user?.wallet?.address;
  // В шапке - чем вошёл, а не какая почта привязана для писем.
  const signIn = signedInWith(user);
  // Privy помечает свой встроенный кошелёк; всё прочее - внешний, и его
  // хозяину не нужны наши объяснения про пополнение.
  const embedded = user?.wallet?.walletClientType === "privy";

  // Балансы из цепочки: USDC - чем ставят, SOL - чем платят комиссию сети.
  // null - ещё не прочитали; показываем прочерк, а не врём нулём.
  const [usdc, setUsdc] = useState<number | null>(null);
  const [sol, setSol] = useState<number | null>(null);
  // Чтение упало - говорим об этом и даём повторить. Раньше любая ошибка
  // глоталась и оставляла прочерк, а прочерк на телефоне читался как «денег
  // нет», когда на деле не ответила нода (сказали на показе 1 октября 2026).
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (!wallet || !db) return;
    let live = true;
    setFailed(false);
    let owner: PublicKey;
    try {
      owner = new PublicKey(wallet);
    } catch {
      // Не адрес Solana: такое бывает у старого кошелька Privy другой сети.
      setFailed(true);
      return;
    }
    // SOL и USDC читаем порознь: отказ одного не прячет другой.
    connection.getBalance(owner).then(
      (lamports) => {
        if (live) setSol(lamports / 1e9);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    (async () => {
      // Монету берём у последнего торга, а не у открытого: между торгами
      // открытых нет, и баланс пропадал бы ровно тогда, когда человек
      // смотрит, что ему вернулось или ушло.
      const { data, error } = await db!
        .from("lots")
        .select("mint")
        .not("mint", "is", null)
        .order("closes_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      const mint = data?.[0]?.mint;
      if (!mint) return;
      const units = await walletUnits(new PublicKey(mint), owner);
      if (live) setUsdc(unitsToCents(units) / 100);
    })().catch(() => {
      if (live) setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [wallet, tries]);

  // Мои ставки: живые наверху экрана, закрытые - историей внизу.
  const [stands, setStands] = useState<MyStand[]>([]);
  useEffect(() => {
    if (!wallet) return;
    let live = true;
    void loadMyStands(wallet).then((rows) => live && setStands(rows));
    return () => {
      live = false;
    };
  }, [wallet]);

  // Часы для «closes in»: перебитая ставка - вопрос времени, и оно тикает.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const [copied, setCopied] = useState(false);
  function copyAddress() {
    if (!wallet) return;
    void navigator.clipboard.writeText(wallet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }


  // Разделы страницы: меню слева на широком экране, лентой сверху на
  // телефоне. Кабинет продавца - раздел Sales, админка - раздел Admin.
  const [pane, setPane] = useState<Pane>("you");

  // Продавцу роль выдаём мы после звонка. У него переключатель встаёт наверх
  // и Seller открывает кабинет; остальным Seller - по-прежнему разговор.
  //
  // Роли спрашиваем заново, как только сессия выписана на этого человека.
  // Раньше спрашивали один раз при открытии: после смены аккаунта вопрос
  // уходил ещё со старой сессией админа, и вкладка Admin держалась у чужого
  // кошелька до перезагрузки (нашли на живом торге 3 октября 2026).
  const [seller, setSeller] = useState(false);
  // Админ - это мы: третья вкладка переключателя, остальным её нет.
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    setSeller(false);
    setAdmin(false);
    setPane("you");
    if (!linked) return;
    let live = true;
    void amISeller().then((yes) => live && setSeller(yes));
    void amIAdmin().then((yes) => live && setAdmin(yes));
    return () => {
      live = false;
    };
  }, [linked]);
  // Шаги кабинета со своей шапкой прячут шапку экрана и переключатель.
  const [sellerView, setSellerView] = useState("home");

  // Счёт покупателя: как его оценили продавцы. Видно самому человеку.
  const [buyerScore, setBuyerScore] = useState<Score | null>(null);
  useEffect(() => {
    void db?.auth.getUser().then(({ data }) => {
      if (data.user) void loadScoreOf(data.user.id, "buyer").then(setBuyerScore);
    });
  }, [linked]);

  // Оценка сделки покупателем: вход отсюда, из режима Buyer.
  const [toRate, setToRate] = useState<DealToRate[]>([]);
  const [rating, setRating] = useState<DealToRate | null>(null);
  useEffect(() => {
    void loadDealsToRate("buyer").then(setToRate);
  }, [rating, linked]);

  const outbid = stands.filter((one) => one.open && !one.leading);
  const leading = stands.filter((one) => one.open && one.leading);
  const history = stands.filter((one) => !one.open);
  const activeCount = outbid.length + leading.length;

  if (rating) {
    return (
      <section className="screen">
        <BuyerRating
          key={rating.lotId ?? rating.requestId}
          deal={rating}
          onDone={() => setRating(null)}
          // Оценки подряд: следующая сделка сама, пустая очередь - обратно на You.
          onSent={() => void loadDealsToRate("buyer").then((left) => setRating(left[0] ?? null))}
        />
      </section>
    );
  }

  // Счётчик у Auctions: что ждёт человека - перебитые ставки и сделки на
  // оценку.
  const alerts = outbid.length + toRate.length;
  const wins = stands.filter((one) => one.won).length;
  const joined = user?.createdAt ? new Date(user.createdAt) : null;

  const panes: { id: Pane; label: string }[] = [
    { id: "you", label: "You" },
    { id: "wallet", label: "Wallet" },
    { id: "auctions", label: "Auctions" },
    { id: "sales", label: "Sales" },
    { id: "settings", label: "Settings" },
    ...(admin ? [{ id: "admin" as const, label: "Admin" }] : []),
  ];

  // Шаги кабинета продавца со своей шапкой прячут шапку экрана и меню.
  const bare = pane === "sales" && seller && sellerView !== "home";

  const walletCard = wallet && (
    <div className="wallet-card">
      <div className="wallet-head">
        <div className="wallet-name">
          <span className="wallet-title">Your wallet</span>
          <span className="wallet-cap">
            {embedded
              ? "Created by Privy when you signed in. Yours, not ours."
              : "Connected from your own wallet app."}
          </span>
        </div>
      </div>

      <div className="balance">
        <span className="balance-usdc">{money(usdc)}</span>
        <span className="balance-unit">USDC</span>
        <span className="balance-sol">
          {sol === null ? "" : `${sol.toFixed(3)} `}
          <span className="balance-unit">SOL</span>
        </span>
      </div>
      {failed && (
        <p className="bad">
          Could not read the balance from the network.{" "}
          <button type="button" className="link" onClick={() => setTries((was) => was + 1)}>
            Try again
          </button>
        </p>
      )}

      <div className="addr-box">
        <span>{wallet}</span>
        <button type="button" className="ghost small" onClick={copyAddress}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {embedded && (
        <div className="funds">
          <span className="funds-head">Add funds</span>
          <p className="role-note">
            Send USDC, plus a little SOL for fees, on the Solana network to
            the address above. Anything sent on another network is lost.
          </p>
        </div>
      )}

      <p className="wallet-cap">
        Transfers are irreversible. <a href="/terms">See terms</a>.
      </p>
    </div>
  );

  // Лента событий - из тех же ставок: что поставил, где перебили, что
  // выиграл. Пополнений и выводов мы не записываем, их здесь нет.
  const activity = stands.slice(0, 5).map((one) => {
    const kind = one.open
      ? one.leading
        ? { icon: "bid" as const, title: "Leading bid", sign: "-" }
        : { icon: "back" as const, title: "Outbid, refunded", sign: "+" }
      : one.won
        ? { icon: "won" as const, title: "Auction won", sign: "-" }
        : { icon: "back" as const, title: one.refunded ? "Refunded" : "Not won", sign: "+" };
    return { one, ...kind };
  });

  return (
    <section className="screen you">
      {!bare && (
        <h1 className="mk-title">
          OXAR <span>You</span>
        </h1>
      )}

      <div className={bare ? "you-layout bare" : pane === "admin" || pane === "sales" ? "you-layout wide" : "you-layout"}>
        {!bare && (
          <nav className="you-nav" aria-label="Your account">
            {panes.map((one) => (
              <button
                key={one.id}
                type="button"
                className={pane === one.id ? "you-tab on" : "you-tab"}
                aria-current={pane === one.id ? "page" : undefined}
                onClick={(event) => {
                  setPane(one.id);
                  // На телефоне лента пилюль шире экрана: выбранную подкручиваем
                  // в поле зрения, иначе Settings выбирался за краем.
                  const tab = event.currentTarget;
                  tab.parentElement?.scrollTo({ left: tab.offsetLeft - 20, behavior: "smooth" });
                }}
              >
                <PaneIcon pane={one.id} />
                <span>{one.label}</span>
                {one.id === "auctions" && alerts > 0 && <span className="you-badge">{alerts}</span>}
              </button>
            ))}
          </nav>
        )}

        <div className="you-main">
          {pane === "you" && (
            <>
              <div className="you-panel you-profile">
                <div className="you-card">
                  <span className="you-face" aria-hidden>
                    {avatarLetter(signIn?.by === "email" ? signIn.email : signIn?.wallet ?? "?")}
                  </span>
                  <div className="you-id">
                    {signIn?.by === "email" && <p className="you-mail">{signIn.email}</p>}
                    {signIn?.by === "wallet" && <p className="you-mail mono">{shortWallet(signIn.wallet)}</p>}
                    <p className="you-sub">
                      {signIn?.by === "email" ? "Signed in with email" : "Signed in with a wallet"}
                    </p>
                  </div>
                </div>
                <div className="you-stats">
                  <div>
                    <b>{wins}</b>
                    <span>Auctions won</span>
                  </div>
                  <div>
                    <b>{activeCount}</b>
                    <span>Active bids</span>
                  </div>
                  <div>
                    <b>{buyerScore?.rating != null ? `★ ${buyerScore.rating.toFixed(1)}` : "-"}</b>
                    <span>Rating</span>
                  </div>
                </div>
              </div>

              {wallet && (
                <div className="you-panel you-balance">
                  <span className="you-panel-title">Balance</span>
                  <div className="you-balance-row">
                    <span className="you-balance-num">{money(usdc)}</span>
                    <span className="usdc-chip">USDC</span>
                    <button type="button" className="you-more" onClick={() => setPane("wallet")}>
                      Wallet <span aria-hidden>&rarr;</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="you-panel">
                <span className="you-panel-title">Account information</span>
                <div className="you-info">
                  <div className="you-info-row">
                    <span className="you-info-cap">Email</span>
                    <span className="you-info-val">{user?.email?.address ?? "Not added"}</span>
                    <button type="button" className="you-more" onClick={() => setPane("settings")}>
                      {user?.email?.address ? "Change" : "Add"}
                    </button>
                  </div>
                  {wallet && (
                    <div className="you-info-row">
                      <span className="you-info-cap">Wallet</span>
                      <span className="you-info-val mono">{shortWallet(wallet)}</span>
                      <button type="button" className="you-more" onClick={copyAddress}>
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                  )}
                  <div className="you-info-row">
                    <span className="you-info-cap">Signed in with</span>
                    <span className="you-info-val">{signIn?.by === "email" ? "Email" : "Wallet"}</span>
                  </div>
                  {joined && (
                    <div className="you-info-row">
                      <span className="you-info-cap">Joined</span>
                      <span className="you-info-val">
                        {joined.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="you-panel">
                <div className="you-panel-head">
                  <span className="you-panel-title">Recent activity</span>
                  {stands.length > 0 && (
                    <button type="button" className="you-more" onClick={() => setPane("auctions")}>
                      View all <span aria-hidden>&rarr;</span>
                    </button>
                  )}
                </div>
                {activity.length === 0 ? (
                  <p className="muted">Nothing yet. Your bids, refunds and wins show up here.</p>
                ) : (
                  <div className="you-activity">
                    {activity.map(({ one, icon, title, sign }) => (
                      <div className="you-act-row" key={one.lotId}>
                        <span className="you-act-icon" aria-hidden>
                          <ActIcon kind={icon} />
                        </span>
                        <span className="you-act-what">
                          <b>{title}</b>
                          <span>
                            {spotName(one.spot)} · {one.thing}
                          </span>
                        </span>
                        <span className="you-act-amt">
                          <b className={sign === "+" ? "plus" : undefined}>
                            {sign} {formatUsd(one.mineCents)}
                          </b>
                          <span>{day(one.closesAt)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <a className="you-help" href="mailto:support@oxar.app">
                <span className="you-help-icon" aria-hidden>
                  <svg viewBox="0 0 24 24">
                    <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" />
                    <path d="M9 12l2 2 4-4" />
                  </svg>
                </span>
                <span className="you-help-text">
                  <b>Need help?</b>
                  <span>Write to support@oxar.app.</span>
                </span>
                <span className="you-help-go" aria-hidden>
                  &rarr;
                </span>
              </a>
            </>
          )}

          {pane === "wallet" &&
            (walletCard || <p className="muted">No wallet on this account yet.</p>)}

          {pane === "auctions" && (
            <>
              <div className="bids-head">
                <span className="bids-title">Your bids</span>
                <span className="muted">{activeCount} active</span>
              </div>
              {activeCount === 0 && (
                <p className="muted">No active bids. Pick a spot on the Market to bid.</p>
              )}

              {outbid.map((one) => (
                <div className="outbid-card" key={one.lotId}>
                  <div className="outbid-top">
                    <span className="outbid-badge">OUTBID</span>
                    <span className="outbid-when">closes in {left(one.closesAt, now)}</span>
                  </div>
                  <span className="outbid-title">
                    {spotName(one.spot)} · {one.thing}
                  </span>
                  <div className="outbid-grid">
                    <div>
                      <span className="outbid-cap">
                        {one.leaderBrand ? `Leader - ${one.leaderBrand}` : "Leader"}
                      </span>
                      <span className="outbid-num lead">{formatUsd(one.topCents)}</span>
                    </div>
                    <div>
                      <span className="outbid-cap">Your bid</span>
                      <span className="outbid-num mine">{formatUsd(one.mineCents)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="raise"
                    onClick={() => {
                      // Торг откроется сразу на этом месте: код едет через
                      // sessionStorage, вкладки - состояние экрана, а не адреса.
                      window.sessionStorage.setItem("oxar.jump", one.code);
                      onOpenAuction(one.sellerThing ?? undefined);
                    }}
                  >
                    Raise your bid
                  </button>
                  <span className="outbid-note">
                    Your {formatUsd(one.mineCents)} is already back in your wallet.
                  </span>
                </div>
              ))}

              {leading.length > 0 && (
                <div className="leading-card">
                  {leading.map((one) => (
                    <div className="leading-row" key={one.lotId}>
                      <div className="leading-what">
                        <span>{spotName(one.spot)}</span>
                        <span className="muted small">{one.thing}</span>
                      </div>
                      <span className="tagchip">LEADING</span>
                      <span className="leading-amt">{formatUsd(one.mineCents)}</span>
                    </div>
                  ))}
                </div>
              )}

              {toRate[0] && (
                <button type="button" className="sl-waiting" onClick={() => setRating(toRate[0]!)}>
                  <span className="dot" />
                  <span>
                    <b>{toRate.length === 1 ? "1 deal to rate" : `${toRate.length} deals to rate`}</b>
                    <small>{toRate[0].title}</small>
                  </span>
                  <span className="go">Rate</span>
                </button>
              )}

              <YourWins stands={stands} />

              <div className="bids-head">
                <span className="hist-title">History</span>
              </div>
              {history.length === 0 ? (
                // Пустая история - не пустое место: она говорит, когда наполнится.
                // Победы и поражения записываются после закрытия торга, и до первого
                // разбора здесь честно нечего показывать.
                <p className="muted">
                  Nothing here yet. Bid on a spot - wins and losses land here after
                  the auction closes.
                </p>
              ) : (
                <div className="hist-list">
                  {history.map((one) => (
                    <div className="hist-row" key={one.lotId}>
                      <span className="hist-date">{day(one.closesAt)}</span>
                      <span className="hist-what">
                        {spotName(one.spot)} · {one.thing}
                      </span>
                      <span
                        className="tagchip"
                        style={{ color: one.won || one.refunded ? "#16181d" : undefined }}
                      >
                        {one.won ? "WON" : one.refunded ? "REFUNDED" : "LOST"}
                      </span>
                      <span className="hist-amt">{formatUsd(one.mineCents)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {pane === "sales" &&
            (seller ? (
              <SellerFlow onView={setSellerView} onOpen={onOpenAuction} />
            ) : (
              <div className="role-card">
                <SellerApply wallet={wallet ?? null} />
              </div>
            ))}

          {pane === "settings" && (
            <>
              <Notifications />
              <ThemeRow />
              <button type="button" className="signout" onClick={logout}>
                Sign out
              </button>
              <p className="you-foot">
                <span className="build">build {BUILD}</span>
                <a href="/how">how it works</a>
                <a href="/terms">terms</a>
              </p>
            </>
          )}

          {pane === "admin" && admin && (
            <div className="sl-column">
              <Admin />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

type Pane = "you" | "wallet" | "auctions" | "sales" | "settings" | "admin";

/** Деньги на балансе: прочерк, пока не прочитали, а не ноль. */
function money(usd: number | null): string {
  return usd === null
    ? "-"
    : `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Значки меню - контуром, одной толщины. */
function PaneIcon({ pane }: { pane: Pane }) {
  const paths: Record<Pane, string[]> = {
    you: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 21c0-4 4-6 8-6s8 2 8 6"],
    wallet: ["M3 7h15a3 3 0 0 1 3 3v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z", "M3 7l12-3v3", "M16 14h2"],
    auctions: ["M14 4l6 6", "M11 7l6 6", "M12.5 5.5l-6 6 6 6 6-6", "M9 15l-5 5"],
    sales: ["M4 4h16v16H4z", "M9 12h6", "M12 9v6"],
    settings: [
      "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
      "M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z",
    ],
    admin: ["M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z"],
  };
  return (
    <svg className="you-tab-icon" viewBox="0 0 24 24" aria-hidden>
      {paths[pane].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** Значок события в ленте: ставка, возврат, победа. */
function ActIcon({ kind }: { kind: "bid" | "back" | "won" }) {
  const d =
    kind === "bid"
      ? ["M7 17L17 7", "M9 7h8v8"]
      : kind === "back"
        ? ["M17 7L7 17", "M15 17H7V9"]
        : ["M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z"];
  return (
    <svg viewBox="0 0 24 24">
      {d.map((one) => (
        <path key={one} d={one} />
      ))}
    </svg>
  );
}

/**
 * Ряд темы: светлая, тёмная или системная. По умолчанию светлая; системная -
 * такой же явный выбор, как две другие. Живёт и у гостя - тёмная тема не
 * привилегия вошедшего. Применяется атрибутом на html, тем же, что ставит
 * скрипт в layout до первой отрисовки.
 */
export function ThemeRow() {
  const [theme, setTheme] = useState<"light" | "dark" | "system">("light");
  useEffect(() => {
    const saved = window.localStorage.getItem("oxar.theme");
    if (saved === "dark" || saved === "system") setTheme(saved);
  }, []);
  function pickTheme(next: "light" | "dark" | "system") {
    setTheme(next);
    window.localStorage.setItem("oxar.theme", next);
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme =
      next === "system" ? (dark ? "dark" : "light") : next;
  }
  return (
    <div className="theme-row">
      <span className="muted">Theme</span>
      <div className="role-toggle slim">
        {(["light", "dark", "system"] as const).map((one) => (
          <button
            key={one}
            type="button"
            className={theme === one ? "role-tab on" : "role-tab"}
            onClick={() => pickTheme(one)}
          >
            {one === "light" ? "Light" : one === "dark" ? "Dark" : "System"}
          </button>
        ))}
      </div>
    </div>
  );
}

/** День для истории: коротко, в часах читателя. */
function day(at: string): string {
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Сколько осталось торгу: часы тикают на глазах у перебитого. */
function left(closesAt: string, now: number): string {
  const ms = Math.max(0, Date.parse(closesAt) - now);
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}
