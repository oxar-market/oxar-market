"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useExportWallet } from "@privy-io/react-auth/solana";
import { PublicKey } from "@solana/web3.js";
import { formatUsd, shortWallet, unitsToCents, type Bidder, type Score } from "@oxar/core";
import { BUILD } from "@/lib/build";
import { connection, walletUnits } from "@/lib/chain";
import { loadMyStands, type MyStand } from "@/lib/auction";
import { loadBidders } from "@/lib/board";
import { db } from "@/lib/session";
import { amISeller, loadDealsToRate, type DealToRate } from "@/lib/seller";
import { BuyerRating, SellerFlow } from "./seller/flow.tsx";
import { amIAdmin } from "@/lib/admin";
import { Admin } from "./admin/admin.tsx";
import { SellerApply } from "./seller/apply.tsx";
import { YourWins } from "./wins.tsx";
import { Notifications } from "./notify.tsx";
import { Usdc } from "./usdc.tsx";
import { loadScoreOf } from "@/lib/reviews";
import { signedInWith } from "@/lib/identity";
import { NEXT, load, type Data } from "./_site/data.ts";
import { useViews } from "./_site/spots.tsx";
import { BoardRow, Box, Copy, Laurel, avatar } from "./cabinet.tsx";

/**
 * Кабинет человека - страница сайта: слева он сам, баланс и цифры, справа
 * вкладки - все торги (с фильтром «свои»), рейтинг, кампании, а продажи,
 * настройки и админка - тем, кому они есть.
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

  // Ключ кошелька Privy - в окне Privy на его же домене: приложение ключа не
  // видит, человек копирует его в Phantom или Solflare сам.
  const { exportWallet } = useExportWallet();
  const [exportFailed, setExportFailed] = useState(false);
  // Вкладки кабинета. Продажи - продавцу и тому, кто хочет им стать,
  // админка - нам.
  const [tab, setTab] = useState<Tab>("auctions");
  // Все торги - только свои.
  const [mineOnly, setMineOnly] = useState(false);
  // Пополнить: адрес и правило сети раскрываются по кнопке.
  const [funds, setFunds] = useState(false);

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
    setTab("auctions");
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

  // Рейтинг и все торги - публичные данные, те же, что видит любой.
  const [bidders, setBidders] = useState<Bidder[]>([]);
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    void loadBidders().then(setBidders);
    void load().then(setData);
  }, []);
  const auctions = data?.auctions ?? [];
  const { views, shooter } = useViews(auctions);

  const me = wallet ? (bidders.find((one) => one.wallet === wallet) ?? null) : null;
  const rank = me ? bidders.indexOf(me) + 1 : 0;
  const wins = stands.filter((one) => one.won).length;
  const joined = user?.createdAt ? new Date(user.createdAt) : null;
  const standsOf = (thingId: string) => stands.filter((one) => one.sellerThing === thingId);
  const shown = mineOnly ? auctions.filter((one) => standsOf(one.id).length > 0) : auctions;
  const name = signIn?.by === "email" ? signIn.email : wallet ? shortWallet(wallet) : "You";
  const sub = [
    signIn?.by === "email" && wallet ? shortWallet(wallet) : null,
    me?.brands.length ? `Bids as ${me.brands.join(", ")}` : "No bids yet",
    joined ? `since ${joined.toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const tabs: { id: Tab; label: string; soon?: boolean; count?: number }[] = [
    { id: "auctions", label: "Auctions", count: outbid.length + toRate.length },
    { id: "leaders", label: "Leaderboard" },
    { id: "campaigns", label: "Campaigns", soon: true },
    { id: "sales", label: "Sales" },
    { id: "settings", label: "Settings" },
    ...(admin ? [{ id: "admin" as const, label: "Admin" }] : []),
  ];

  // Шаги кабинета продавца со своей шапкой занимают весь кабинет.
  if (tab === "sales" && seller && sellerView !== "home") {
    return (
      <section className="ym-bare">
        <SellerFlow onView={setSellerView} onOpen={onOpenAuction} />
      </section>
    );
  }

  return (
    <div className="ym">
      {shooter}
      <div className="ym-grid">
        <aside className="ym-side">
          <div className="ym-banner">
            <span className="ym-avatar" style={avatar(wallet ?? name)} />
          </div>
          <div className="ym-who">
            <h1>
              <span className="ym-name">{name}</span>
              {wallet && <Copy text={wallet} />}
            </h1>
            <p>{sub}</p>
          </div>

          {wallet && (
            <div className="ym-balance">
              <span className="ym-cap">Balance</span>
              <div className="ym-balance-row">
                <b>{money(usdc)}</b>
                <Usdc />
                <span className="ym-sol">{sol === null ? "" : `${sol.toFixed(3)} SOL`}</span>
              </div>
              {failed && (
                <p className="ym-bad">
                  Could not read the balance from the network.{" "}
                  <button type="button" className="ym-link" onClick={() => setTries((was) => was + 1)}>
                    Try again
                  </button>
                </p>
              )}
              <div className="ym-balance-acts">
                <button type="button" className="ym-btn" onClick={() => setFunds(!funds)}>
                  {funds ? "Hide" : "Add funds"}
                </button>
                {embedded && (
                  <button
                    type="button"
                    className="ym-btn ghost"
                    onClick={() => {
                      setExportFailed(false);
                      exportWallet({ address: wallet }).catch(() => setExportFailed(true));
                    }}
                  >
                    Export key
                  </button>
                )}
              </div>
              {exportFailed && <p className="ym-bad">Could not open the export window. Sign in again and retry.</p>}
              {funds && (
                <div className="ym-funds">
                  <code>{wallet}</code>
                  <p>
                    Send USDC, plus a little SOL for fees, on the Solana network to this address. Anything sent on
                    another network is lost.
                  </p>
                  <p>
                    {embedded
                      ? "Created by Privy when you signed in. Yours, not ours: export the key into Phantom or Solflare any time. OXAR never sees it."
                      : "Connected from your own wallet app."}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="ym-stats">
            <p className="ym-divider">
              <span>Stats</span>
            </p>
            <div className="ym-two">
              <div>
                <span>Rank</span>
                {/* Первые три места - в венке своего металла. */}
                <b className={rank && rank <= 3 ? "ym-ranked" : undefined}>
                  {rank > 0 && rank <= 3 && <Laurel place={rank} />}
                  {rank ? (rank <= 3 ? rank : `#${rank}`) : "-"}
                </b>
              </div>
              <div>
                <span>Spots won</span>
                <b>{wins}</b>
              </div>
            </div>
            <dl>
              <div>
                <dt>Paid for spots</dt>
                <dd>{me ? formatUsd(me.paidCents) : "-"}</dd>
              </div>
              <div>
                <dt>Bids placed</dt>
                <dd>{me?.bids ?? 0}</dd>
              </div>
              <div>
                <dt>Came back when outbid</dt>
                <dd>{me ? formatUsd(me.backCents) : "-"}</dd>
              </div>
              <div>
                <dt>Rating from sellers</dt>
                <dd>{buyerScore?.rating != null ? `★ ${buyerScore.rating.toFixed(1)}` : "-"}</dd>
              </div>
            </dl>
            <p className="ym-divider">
              <span>What to do next?</span>
            </p>
            <a className="ym-cta" href="/auctions">
              Browse auctions
            </a>
          </div>
        </aside>

        <section className="ym-main">
          <div className="ym-tabs" role="tablist">
            {tabs.map((one) => (
              <button
                key={one.id}
                type="button"
                role="tab"
                aria-selected={tab === one.id}
                className={tab === one.id ? "on" : ""}
                onClick={() => setTab(one.id)}
              >
                {one.label}
                {one.soon && <em>Soon</em>}
                {!!one.count && <span className="ym-count">{one.count}</span>}
              </button>
            ))}
          </div>

          {tab === "auctions" && (
            <div className="ym-pane">
              <div className="ym-pane-head">
                <div>
                  <h2>Auctions</h2>
                  <p>Every auction so far, and where your bids stand.</p>
                </div>
                <div className="ym-seg">
                  <button type="button" className={mineOnly ? "" : "on"} onClick={() => setMineOnly(false)}>
                    All
                  </button>
                  <button type="button" className={mineOnly ? "on" : ""} onClick={() => setMineOnly(true)}>
                    Yours
                  </button>
                </div>
              </div>

              {toRate[0] && (
                <button type="button" className="ym-alert" onClick={() => setRating(toRate[0]!)}>
                  <span>
                    <b>{toRate.length === 1 ? "1 deal to rate" : `${toRate.length} deals to rate`}</b>
                    {toRate[0].title}
                  </span>
                  <em>Rate</em>
                </button>
              )}
              <YourWins stands={stands} />

              <div className="ym-boxes">
                {!mineOnly && NEXT && (
                  <div className="ym-box">
                    <span className="ym-pill soon">Coming soon</span>
                    <div className="ym-box-art show" aria-hidden>
                      <span>
                        The
                        <br />
                        Ecosystem
                        <br />
                        Call
                      </span>
                    </div>
                    <h3>{NEXT.owner}</h3>
                    <p className="ym-meta">
                      {NEXT.title} · opens in {NEXT.when}
                    </p>
                    <p className="ym-you">Spots announced soon</p>
                    <div className="ym-bar">
                      <span style={{ width: "0%" }} />
                    </div>
                    <p className="ym-small">Follow along to hear first</p>
                    <a className="ym-btn" href="https://x.com/oxar_app">
                      Get notified
                    </a>
                  </div>
                )}
                {shown.map((one) => (
                  <Box
                    key={one.id}
                    one={one}
                    view={views[one.id]?.src}
                    places={views[one.id] ? Object.keys(views[one.id]!.quads).length : null}
                    stands={standsOf(one.id)}
                    onRaise={(stand) => {
                      // Торг откроется сразу на этом месте.
                      window.sessionStorage.setItem("oxar.jump", stand.code);
                      onOpenAuction(stand.sellerThing ?? undefined);
                    }}
                  />
                ))}
              </div>
              {mineOnly && shown.length === 0 && (
                <p className="ym-empty">No bids yet. Pick a spot on a live auction and it shows up here.</p>
              )}
            </div>
          )}

          {tab === "leaders" && (
            <div className="ym-pane">
              <div className="ym-pane-head">
                <div>
                  <h2>Leaderboard</h2>
                  <p>Wallets by what they paid for spots they won.</p>
                </div>
              </div>
              <div className="ym-board">
                <div className="ym-row head">
                  <span>#</span>
                  <span>Wallet</span>
                  <span>Spots</span>
                  <span>Paid</span>
                </div>
                {bidders.slice(0, 10).map((one, at) => (
                  <BoardRow key={one.wallet} one={one} at={at + 1} me={one === me} />
                ))}
                {me && rank > 10 && <BoardRow one={me} at={rank} pinned />}
              </div>
              <p className="ym-foot">
                1-{Math.min(10, bidders.length)} of {bidders.length}
              </p>
            </div>
          )}

          {tab === "campaigns" && (
            <div className="ym-pane ym-soon">
              <span className="ym-pill soon">Coming soon</span>
              <h2>Campaigns</h2>
              <p>We are building it. Follow along on X to hear first.</p>
              <a className="ym-btn" href="https://x.com/oxar_app">
                Get notified
              </a>
            </div>
          )}

          {tab === "sales" && (
            <div className="ym-pane ym-legacy">
              {seller ? (
                <SellerFlow onView={setSellerView} onOpen={onOpenAuction} />
              ) : (
                <SellerApply wallet={wallet ?? null} />
              )}
            </div>
          )}

          {tab === "settings" && (
            <div className="ym-pane ym-legacy">
              <Notifications />
              <button type="button" className="ym-btn ghost ym-signout" onClick={logout}>
                Sign out
              </button>
              <p className="ym-foot">
                build {BUILD} · <a href="/terms">Terms</a> · <a href="mailto:support@oxar.app">support@oxar.app</a>
              </p>
            </div>
          )}

          {tab === "admin" && admin && (
            <div className="ym-pane ym-legacy">
              <Admin />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

type Tab = "auctions" | "leaders" | "campaigns" | "sales" | "settings" | "admin";

/** Деньги на балансе: прочерк, пока не прочитали, а не ноль. */
function money(usd: number | null): string {
  return usd === null
    ? "-"
    : `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
