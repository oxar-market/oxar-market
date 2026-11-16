"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useExportWallet } from "@privy-io/react-auth/solana";
import { PublicKey } from "@solana/web3.js";
import { avatarLetter, formatUsd, passReach, shortWallet, unitsToCents, type Bidder, type Score } from "@oxar/core";
import { connection, walletUnits } from "@/lib/chain";
import { loadMyStands, type MyStand } from "@/lib/auction";
import { loadBidders } from "@/lib/board";
import { EMPTY, faceUrl, loadFaces, loadMyProfile, loadReach, type Face, type Profile, type Reach } from "@/lib/profile";
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
import { NEXT, load, type Data } from "./_site/data.ts";
import { useViews } from "./_site/spots.tsx";
import { BoardRow, Box, Copy, Laurel, Podium } from "./cabinet.tsx";
import { avatar } from "./_site/me.ts";
import { EditModal, ShareModal } from "./modals.tsx";
import { ReachPass } from "./pass.tsx";

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
  // Страница рейтинга: по 25 кошельков.
  const [page, setPage] = useState(0);

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

  // Рейтинг, все торги, охват вещей и лица кошельков - публичные данные, те
  // же, что видит любой.
  const [bidders, setBidders] = useState<Bidder[]>([]);
  const [data, setData] = useState<Data | null>(null);
  const [reach, setReach] = useState<Record<string, Reach>>({});
  const [faces, setFaces] = useState<Record<string, Face>>({});
  useEffect(() => {
    void loadBidders().then(setBidders);
    void load().then(setData);
    void loadReach().then(setReach);
    void loadFaces().then(setFaces);
  }, []);
  // Свой профиль - когда сессия базы выписана на этого человека.
  const [profile, setProfile] = useState<Profile>(EMPTY);
  useEffect(() => {
    if (linked) void loadMyProfile().then(setProfile);
  }, [linked]);
  const [open, setOpen] = useState<"share" | "edit" | null>(null);
  const auctions = data?.auctions ?? [];
  const { views, shooter } = useViews(auctions);

  const me = wallet ? (bidders.find((one) => one.wallet === wallet) ?? null) : null;
  // Тот же аватар, что в шапке: зерно - кошелёк, без него почта.
  const seed = wallet ?? user?.email?.address ?? "you";
  const rank = me ? bidders.indexOf(me) + 1 : 0;
  // Под пьедесталом - с четвёртого места.
  const rest = bidders.slice(3);
  const joined = user?.createdAt ? new Date(user.createdAt) : null;
  const standsOf = (thingId: string) => stands.filter((one) => one.thingId === thingId);
  const shown = mineOnly ? auctions.filter((one) => standsOf(one.id).length > 0) : auctions;
  const name = profile.display_name ?? (signIn?.by === "email" ? signIn.email : wallet ? shortWallet(wallet) : "You");
  const brands = profile.brand ?? me?.brands.join(", ") ?? "";
  const picture = faceUrl(profile.avatar_path);
  const sub = [
    (profile.display_name || signIn?.by === "email") && wallet ? shortWallet(wallet) : null,
    brands ? `Bids as ${brands}` : "No bids yet",
    joined ? `since ${joined.toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Пропуск - сумма охватов торгов, где стоял логотип человека.
  const pass = passReach(me?.won ?? [], reach);
  const thumbs: Record<string, string | undefined> = {};
  for (const one of auctions) thumbs[one.id] = one.slug === "the-van" ? "/site/van-card.jpg" : views[one.id]?.src;
  const passLines = pass.lines.map((line) => ({
    title: reach[line.thingId]?.title ?? "Auction",
    reach: line.reach >= 1000 ? `${Math.round(line.reach / 1000)}K` : String(line.reach),
    thumb: thumbs[line.thingId],
  }));
  const holder = profile.display_name ?? (wallet ? shortWallet(wallet) : name);
  const makePass = () => (
    <ReachPass
      holder={holder}
      brands={brands}
      reach={pass.total}
      estimated={pass.estimated}
      lines={passLines}
      avatar={avatar(seed)}
      picture={picture}
    />
  );

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
            <span className="ym-avatar" style={picture ? undefined : avatar(seed)}>
              {picture ? <img src={picture} alt="" /> : avatarLetter(seed)}
            </span>
            <div className="ym-icons">
              {pass.total > 0 && (
                <button type="button" aria-label="Share your reach" onClick={() => setOpen("share")}>
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <circle cx="18" cy="5" r="2.5" />
                    <circle cx="6" cy="12" r="2.5" />
                    <circle cx="18" cy="19" r="2.5" />
                    <path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" />
                  </svg>
                </button>
              )}
              {wallet && (
                <button type="button" aria-label="Edit profile" onClick={() => setOpen("edit")}>
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <div className="ym-who">
            <h1>
              <span className="ym-name">{name}</span>
              {wallet && <Copy text={wallet} />}
            </h1>
            <p>{sub}</p>
          </div>

          {pass.total > 0 && <div className="ym-pad">{makePass()}</div>}

          <div className="ym-stats">
            {wallet && (
              <>
                <p className="ym-divider">
                  <span>Wallet</span>
                </p>
                <dl>
                  <div>
                    <dt>Balance</dt>
                    <dd>{money(usdc)} USDC</dd>
                  </div>
                  <div>
                    <dt>For network fees</dt>
                    <dd>{sol === null ? "-" : `${sol.toFixed(3)} SOL`}</dd>
                  </div>
                </dl>
                {failed && (
                  <p className="ym-bad">
                    Could not read the balance from the network.{" "}
                    <button type="button" className="ym-link" onClick={() => setTries((was) => was + 1)}>
                      Try again
                    </button>
                  </p>
                )}
                {embedded && (
                  <p className="ym-acts">
                    <button
                      type="button"
                      className="ym-link"
                      onClick={() => {
                        setExportFailed(false);
                        exportWallet({ address: wallet }).catch(() => setExportFailed(true));
                      }}
                    >
                      Export key
                    </button>
                  </p>
                )}
                {exportFailed && <p className="ym-bad">Could not open the export window. Sign in again and retry.</p>}
              </>
            )}
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
                <b>{me?.spots ?? 0}</b>
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
                    reach={reach[one.id]}
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
              <Podium top={bidders.slice(0, 3)} me={me} faces={faces} />
              <div className="ym-board">
                <div className="ym-row head">
                  <span>#</span>
                  <span>Wallet</span>
                  <span>Spots</span>
                  <span>Paid</span>
                </div>
                {rest.slice(page * PAGE, (page + 1) * PAGE).map((one, at) => (
                  <BoardRow key={one.wallet} one={one} at={page * PAGE + at + 4} me={one === me} face={faces[one.wallet]} />
                ))}
                {/* Свою строку видно всегда: не на пьедестале и не на этой странице - внизу. */}
                {me && rank > 3 && (rank - 3 <= page * PAGE || rank - 3 > (page + 1) * PAGE) && (
                  <BoardRow one={me} at={rank} pinned face={faces[me.wallet]} />
                )}
              </div>
              <div className="ym-pages">
                <span>
                  {rest.length ? page * PAGE + 4 : 0}-{Math.min((page + 1) * PAGE, rest.length) + 3} of {bidders.length}
                </span>
                <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  Prev
                </button>
                <button type="button" disabled={(page + 1) * PAGE >= rest.length} onClick={() => setPage(page + 1)}>
                  Next
                </button>
              </div>
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
            </div>
          )}

          {tab === "admin" && admin && (
            <div className="ym-pane ym-legacy">
              <Admin />
            </div>
          )}
        </section>
      </div>
      {open === "share" && (
        <ShareModal
          data={{ name: holder, brands, reach: pass.total, estimated: pass.estimated, lines: passLines }}
          onClose={() => setOpen(null)}
        >
          {makePass()}
        </ShareModal>
      )}
      {open === "edit" && wallet && (
        <EditModal
          profile={profile}
          wallet={wallet}
          avatarStyle={avatar(seed)}
          onSaved={(next) => {
            setProfile(next);
            // Шапка тоже показывает аватар - пусть узнает о новом сразу.
            window.dispatchEvent(new CustomEvent("oxar:face", { detail: faceUrl(next.avatar_path) }));
            void loadFaces().then(setFaces);
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

type Tab = "auctions" | "leaders" | "campaigns" | "sales" | "settings" | "admin";

/** Кошельков на странице рейтинга. */
const PAGE = 25;

/** Деньги на балансе: прочерк, пока не прочитали, а не ноль. */
function money(usd: number | null): string {
  return usd === null
    ? "-"
    : `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
