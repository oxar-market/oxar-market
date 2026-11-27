"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useExportWallet } from "@privy-io/react-auth/solana";
import { PublicKey } from "@solana/web3.js";
import {
  avatarLetter,
  formatUsd,
  passReach,
  shortWallet,
  spotName,
  unitsToCents,
  type Bidder,
  type Score,
} from "@oxar/core";
import { connection, walletUnits } from "@/lib/chain";
import { loadMyStands, type MyStand } from "@/lib/auction";
import { loadBidders } from "@/lib/board";
import {
  EMPTY,
  faceUrl,
  loadFaces,
  loadMyHistory,
  loadMyProfile,
  loadReach,
  type Face,
  type MyBidRow,
  type Profile,
  type Reach,
} from "@/lib/profile";
import { db } from "@/lib/session";
import { amISeller, loadDealsToRate, type DealToRate } from "@/lib/seller";
import { myApplication } from "@/lib/applications";
import { BuyerRating, SellerFlow } from "./seller/flow.tsx";
import { SellerApply } from "./seller/apply.tsx";
import { NoEmailHint, WinCard, useWins, winWord } from "./wins.tsx";
import { Notifications } from "./notify.tsx";
import { loadScoreOf } from "@/lib/reviews";
import { signedInWith } from "@/lib/identity";
import { load, type Data } from "./_site/data.ts";
import { mono } from "./_site/mono.ts";
import { Copy } from "./cabinet.tsx";
import { avatar } from "./_site/me.ts";
import { EditModal, ShareModal } from "./modals.tsx";
import { ReachPass, PassCard, type PassLine } from "./pass.tsx";
import "./you.css";

/**
 * Кабинет человека: слева пропуск охвата на двух лентах, справа он сам -
 * имя, кошелёк, цифры одной таблицей, одно дело, если оно есть, и вкладки.
 * Продажи - продавцу и тому, кто подал заявку, админка - нам.
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
  const signIn = signedInWith(user);
  // Privy помечает свой встроенный кошелёк; всё прочее - внешний, и ключ
  // от него у хозяина и так есть.
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

  // Где я стою на каждом лоте и каждая ставка по отдельности.
  const [stands, setStands] = useState<MyStand[]>([]);
  const [history, setHistory] = useState<MyBidRow[]>([]);
  useEffect(() => {
    if (!wallet) return;
    let live = true;
    void loadMyStands(wallet).then((rows) => live && setStands(rows));
    void loadMyHistory(wallet).then((rows) => live && setHistory(rows));
    return () => {
      live = false;
    };
  }, [wallet]);
  const { wins, reload, sign, winner } = useWins(stands);

  // Ключ кошелька Privy - в окне Privy на его же домене: приложение ключа не
  // видит, человек копирует его в Phantom или Solflare сам.
  const { exportWallet } = useExportWallet();
  const [exportFailed, setExportFailed] = useState(false);

  // Вкладку можно открыть ссылкой: /sell ведёт сразу в продажи.
  const [asked] = useState(firstTab);
  const [tab, setTab] = useState<Tab>(asked);
  // Открытая строка победы - её карточка с кнопками.
  const [opened, setOpened] = useState<string | null>(null);

  // Роли спрашиваем заново, как только сессия выписана на этого человека.
  // Раньше спрашивали один раз при открытии: после смены аккаунта вопрос
  // уходил ещё со старой сессией админа, и вкладка Admin держалась у чужого
  // кошелька до перезагрузки (нашли на живом торге 3 октября 2026).
  const [seller, setSeller] = useState(false);
  const [applied, setApplied] = useState(false);
  useEffect(() => {
    setSeller(false);
    setApplied(false);
    if (!linked) return;
    let live = true;
    void amISeller().then((yes) => live && setSeller(yes));
    void myApplication().then((mine) => live && setApplied(mine !== null));
    return () => {
      live = false;
    };
  }, [linked]);
  // Шаги кабинета продавца со своей шапкой прячут всё остальное.
  const [sellerView, setSellerView] = useState("home");

  // Счёт покупателя: как его оценили продавцы. Видно самому человеку.
  const [buyerScore, setBuyerScore] = useState<Score | null>(null);
  useEffect(() => {
    void db?.auth.getUser().then(({ data }) => {
      if (data.user) void loadScoreOf(data.user.id, "buyer").then(setBuyerScore);
    });
  }, [linked]);

  // Оценка сделки покупателем.
  const [toRate, setToRate] = useState<DealToRate[]>([]);
  const [rating, setRating] = useState<DealToRate | null>(null);
  useEffect(() => {
    void loadDealsToRate("buyer").then(setToRate);
  }, [rating, linked]);

  // Рейтинг, торги, охват вещей и лица кошельков - публичные данные, те же,
  // что видит любой.
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
  const [profile, setProfile] = useState<Profile>(EMPTY);
  useEffect(() => {
    if (linked) void loadMyProfile().then(setProfile);
  }, [linked]);
  const [open, setOpen] = useState<"share" | "edit" | null>(null);

  const me = wallet ? (bidders.find((one) => one.wallet === wallet) ?? null) : null;
  // Тот же аватар, что в шапке: зерно - кошелёк, без него почта.
  const seed = wallet ?? user?.email?.address ?? "you";
  const rank = me ? bidders.indexOf(me) + 1 : 0;
  const name = profile.display_name ?? (wallet ? shortWallet(wallet) : "You");
  const brands = profile.brand ?? me?.brands.join(", ") ?? "";
  const picture = faceUrl(profile.avatar_path);
  const ownerOf = (thingId: string) => data?.auctions.find((one) => one.id === thingId)?.owner ?? "The seller";

  // Ставки - только по лотам, что есть в кабинете: прогоны до открытия мимо.
  const shownLots = new Set(stands.map((one) => one.lotId));
  const bids = history.filter((one) => shownLots.has(one.lotId));
  const imageOf = (stand: MyStand) =>
    bids.find((one) => one.lotId === stand.lotId && one.cents === stand.mineCents)?.mediaUrl ??
    bids.find((one) => one.lotId === stand.lotId)?.mediaUrl;

  // Победы: и выплаченные, и вернувшиеся. Вещь, деньги за которую вернули
  // мимо программы, - «Refunded» своей строкой, что бы ни было у места.
  const won = stands
    .filter((one) => one.won || one.refunded)
    .sort((a, b) => Date.parse(b.closesAt) - Date.parse(a.closesAt))
    .map((stand) => {
      const refundedAt = bids.find((one) => one.lotId === stand.lotId)?.refundedAt ?? null;
      const win = wins?.find((one) => one.lotId === stand.lotId) ?? null;
      const status =
        refundedAt || stand.refunded
          ? { word: "Refunded", red: false }
          : win
            ? winWord(win)
            : { word: "Won", red: false };
      return { stand, refundedAt, win, status };
    });

  // Пропуск - сумма охватов торгов, где стоял логотип человека.
  const pass = passReach(me?.won ?? [], reach);
  const passLines: PassLine[] = pass.lines.map((line) => {
    const spots = won.filter((one) => one.stand.thingId === line.thingId).map((one) => spotName(one.stand.spot));
    return {
      title: reach[line.thingId]?.title ?? "Auction",
      reach: line.reach >= 1000 ? `${Math.round(line.reach / 1000)}K` : String(line.reach),
      note: `${spots.length} ${spots.length === 1 ? "spot" : "spots"} · ${spots.join(", ")}`,
    };
  });
  const passProps = {
    holder: name,
    reach: pass.total,
    estimated: pass.estimated,
    lines: passLines,
    picture,
    avatar: avatar(seed),
    letter: avatarLetter(seed),
  };

  // Одно дело, если оно есть: перебили на идущем торге, пора проверить фото
  // (окно на это - 72 часа), сделка ждёт оценки.
  const outbid = stands.find((one) => one.open && !one.leading);
  const check = won.find((one) => one.status.red);
  const deal = toRate[0];

  const sales = seller || applied || asked === "sales";
  const tabs: { id: Tab; label: string }[] = [
    { id: "wins", label: "Wins" },
    { id: "bids", label: "Bids" },
    { id: "board", label: "Leaderboard" },
    ...(sales ? [{ id: "sales" as const, label: "Sales" }] : []),
    { id: "settings", label: "Settings" },
  ];
  const current: Tab = tabs.some((one) => one.id === tab) ? tab : "wins";

  // Оценка сделки - после всех хуков: ранний return выше них менял число
  // хуков между рендерами, и React падал, стоило нажать «Rate».
  if (rating) {
    return (
      <section className="screen">
        <BuyerRating
          key={rating.lotId ?? rating.requestId}
          deal={rating}
          onDone={() => setRating(null)}
          // Оценки подряд: следующая сделка сама, пустая очередь - обратно в кабинет.
          onSent={() => void loadDealsToRate("buyer").then((left) => setRating(left[0] ?? null))}
        />
      </section>
    );
  }

  // Шаг продавца (новая вещь, места, пруф) - во всю ширину, без пропуска и
  // вкладок. Тот же SellerFlow в том же месте дерева: прежде на шаг рисовался
  // второй, новый, он начинал с главной и сразу возвращал туда.
  const focus = current === "sales" && seller && sellerView !== "home";

  return (
    <div className={`ym yo ${mono.className}${focus ? " focus" : ""}`}>
      <div className="yo-left">
        <ReachPass {...passProps} />
        <div className="yo-under">
          <span className="yo-mute">Drag the pass</span>
          <button type="button" className="yo-link" onClick={() => setOpen("share")}>
            [ Share the pass ]
          </button>
        </div>
      </div>

      <div className="yo-right">
        <div className="yo-head">
          <h1 className="yo-name">
            <span>{name}</span>
            {wallet && <Copy text={wallet} />}
          </h1>
          <p className="yo-mute yo-sub">
            {[wallet ? shortWallet(wallet) : null, me ? `bidding since ${day(me.since)}` : "no bids yet"]
              .filter(Boolean)
              .join(" · ")}
          </p>

          <dl className="yo-t yo-meta">
            <div>
              <dt>Rank</dt>
              <dd>{rank ? `#${rank} of ${bidders.length}` : "-"}</dd>
            </div>
            <div>
              <dt>Spots won</dt>
              <dd>
                {me?.spots ?? 0}, {formatUsd(me?.paidCents ?? 0)}
              </dd>
            </div>
            <div>
              <dt>Bids</dt>
              <dd>
                {me ? `${me.bids} on ${me.joined.length} ${me.joined.length === 1 ? "auction" : "auctions"}` : "0"}
              </dd>
            </div>
            <div>
              <dt>Seen by</dt>
              <dd>
                {pass.total
                  ? `${pass.estimated ? "~" : ""}${pass.total.toLocaleString("en-US")}${pass.estimated ? ", estimated" : ""}`
                  : "-"}
              </dd>
            </div>
            {buyerScore?.rating != null && (
              <div>
                <dt>Rating from sellers</dt>
                <dd>★ {buyerScore.rating.toFixed(1)}</dd>
              </div>
            )}
            <div>
              <dt>Balance</dt>
              <dd>{money(usdc)} USDC</dd>
            </div>
          </dl>

          {outbid ? (
            <div className="yo-act">
              <span>
                Outbid on {spotName(outbid.spot)} · {outbid.thing}. Top bid is {formatUsd(outbid.topCents)}.
              </span>
              <button
                type="button"
                className="yo-link"
                onClick={() => {
                  // Торг откроется сразу на этом месте.
                  window.sessionStorage.setItem("oxar.jump", outbid.code);
                  onOpenAuction(outbid.sellerThing ?? undefined);
                }}
              >
                [ Bid again ]
              </button>
            </div>
          ) : check ? (
            <div className="yo-act">
              <span>
                The photo for {spotName(check.stand.spot)} · {check.stand.thing} is up. Check it.
              </span>
              <button
                type="button"
                className="yo-link"
                onClick={() => {
                  setTab("wins");
                  setOpened(check.stand.lotId);
                }}
              >
                [ Check ]
              </button>
            </div>
          ) : deal ? (
            <div className="yo-act">
              <span>
                {toRate.length === 1 ? "1 deal to rate" : `${toRate.length} deals to rate`}: {deal.title}
              </span>
              <button type="button" className="yo-link" onClick={() => setRating(deal)}>
                [ Rate ]
              </button>
            </div>
          ) : null}
        </div>

        <div className="yo-tabs" role="tablist">
          {tabs.map((one) => (
            <button
              key={one.id}
              type="button"
              role="tab"
              aria-selected={current === one.id}
              className={current === one.id ? "on" : ""}
              onClick={() => setTab(one.id)}
            >
              [ <span>{one.label}</span> ]
            </button>
          ))}
        </div>

        {current === "wins" && (
          <div className="yo-list">
            {wins?.some((one) => one.lot) && (
              <NoEmailHint text="Proof arrives on its own schedule, and you have 72 hours to check it. Add an email so the window does not pass silently." />
            )}
            {won.length === 0 && (
              <p className="yo-mute yo-empty">
                No wins yet.{" "}
                <a className="yo-link" href="/?grid">
                  Pick a spot
                </a>{" "}
                and bid.
              </p>
            )}
            {won.map(({ stand, refundedAt, win, status }) => (
              <div key={stand.lotId} className={opened === stand.lotId ? "yo-win open" : "yo-win"}>
                <button
                  type="button"
                  className="yo-row"
                  onClick={() => setOpened(opened === stand.lotId ? null : stand.lotId)}
                >
                  <Thumb src={imageOf(stand)} />
                  <span>
                    <b>{spotName(stand.spot)}</b>
                    <span className="yo-mute">{stand.thing}</span>
                  </span>
                  <span className="yo-st">
                    {formatUsd(stand.mineCents)}
                    <em className={status.red ? "red" : undefined}>{status.word}</em>
                  </span>
                </button>
                {opened === stand.lotId && (
                  <div className="yo-more">
                    {refundedAt ? (
                      <>
                        <div className="yo-steps">
                          <span className="done">Won</span>
                          <span className="off">Trip off</span>
                          <span className="done">Refunded</span>
                        </div>
                        <p className="yo-mute">
                          {ownerOf(stand.thingId)} sent your {formatUsd(stand.mineCents)} back on{" "}
                          {day(Date.parse(refundedAt))}.
                        </p>
                      </>
                    ) : win ? (
                      <div className="ym-legacy">
                        <WinCard win={win} winner={winner} sign={sign} onDone={reload} />
                      </div>
                    ) : (
                      <p className="yo-mute">
                        {stand.refunded
                          ? "Your bid came back to your wallet."
                          : `Won on ${day(Date.parse(stand.closesAt))}.`}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {current === "bids" && (
          <div className="yo-list">
            {bids.length === 0 && (
              <p className="yo-mute yo-empty">
                No bids yet.{" "}
                <a className="yo-link" href="/?grid">
                  Pick a spot
                </a>{" "}
                and it shows up here.
              </p>
            )}
            {bids.map((one, at) => (
              <div key={`${one.lotId}-${one.at}-${at}`} className="yo-row">
                <Thumb src={one.mediaUrl} />
                <span>
                  <b>{spotName(one.spot)}</b>
                  <span className="yo-mute">
                    {one.thing} · {day(Date.parse(one.at))}
                  </span>
                </span>
                <span className="yo-st">
                  {formatUsd(one.cents)}
                  <em className={one.state === "outbid" ? "red" : undefined}>{BID_WORDS[one.state]}</em>
                </span>
              </div>
            ))}
          </div>
        )}

        {current === "board" && (
          <>
            <div className="yo-board">
              {bidders.map((one, at) => (
                <div key={one.wallet} className={one === me ? "me" : undefined}>
                  <span className="yo-mute">{String(at + 1).padStart(2, "0")}</span>
                  <span className="yo-who">
                    {faces[one.wallet]?.display_name ?? shortWallet(one.wallet)}
                    {one === me && " (you)"}
                    <small>{faces[one.wallet]?.brand ?? one.brands.join(", ")}</small>
                  </span>
                  <span className="yo-mute">
                    {one.spots} {one.spots === 1 ? "spot" : "spots"}
                  </span>
                  <span>{formatUsd(one.paidCents)}</span>
                </div>
              ))}
            </div>
            <p className="yo-mute yo-foot">Wallets by what they paid for spots they won.</p>
          </>
        )}

        {current === "sales" && (
          <div className="ym-legacy">
            {seller ? (
              <SellerFlow onView={setSellerView} onOpen={onOpenAuction} />
            ) : (
              <SellerApply wallet={wallet ?? null} />
            )}
          </div>
        )}

        {current === "settings" && (
          <div className="yo-settings">
            <h3>Wallet</h3>
            <dl className="yo-t">
              <div>
                <dt>Address</dt>
                <dd>
                  {wallet ? shortWallet(wallet) : "-"}
                  {wallet && <Copy text={wallet} />}
                </dd>
              </div>
              <div>
                <dt>USDC</dt>
                <dd>{money(usdc)}</dd>
              </div>
              <div>
                <dt>For network fees</dt>
                <dd>{sol === null ? "-" : `${sol.toFixed(3)} SOL`}</dd>
              </div>
              {signIn?.by === "email" && (
                <div>
                  <dt>Signed in with</dt>
                  <dd>{signIn.email}</dd>
                </div>
              )}
            </dl>
            {failed && (
              <p className="yo-bad">
                Could not read the balance from the network.{" "}
                <button type="button" className="yo-link" onClick={() => setTries((was) => was + 1)}>
                  Try again
                </button>
              </p>
            )}
            <p className="yo-mute yo-note">This wallet is yours, not ours. Only you can move the money.</p>
            {embedded && wallet && (
              <p className="yo-acts">
                <button
                  type="button"
                  className="yo-link"
                  onClick={() => {
                    setExportFailed(false);
                    exportWallet({ address: wallet }).catch(() => setExportFailed(true));
                  }}
                >
                  [ Export key ]
                </button>
              </p>
            )}
            {exportFailed && <p className="yo-bad">Could not open the export window. Sign in again and retry.</p>}

            <h3>Notifications</h3>
            <div className="ym-legacy">
              <Notifications />
            </div>

            <h3>Profile</h3>
            <dl className="yo-t">
              <div>
                <dt>Name</dt>
                <dd>{profile.display_name ?? "-"}</dd>
              </div>
              <div>
                <dt>Brand</dt>
                <dd>{profile.brand ?? "-"}</dd>
              </div>
              <div>
                <dt>X</dt>
                <dd>{profile.x_handle ? `@${profile.x_handle}` : "-"}</dd>
              </div>
              <div>
                <dt>Picture and logo</dt>
                <dd>
                  {[profile.avatar_path && "Picture", profile.logo_path && "Logo"].filter(Boolean).join(", ") || "-"}
                </dd>
              </div>
            </dl>
            <p className="yo-acts">
              {wallet && (
                <button type="button" className="yo-link" onClick={() => setOpen("edit")}>
                  [ Edit profile ]
                </button>
              )}
              <button type="button" className="yo-link" onClick={logout}>
                [ Sign out ]
              </button>
            </p>
          </div>
        )}
      </div>

      {open === "share" && (
        <ShareModal
          data={{ name, brands, reach: pass.total, estimated: pass.estimated, lines: passLines }}
          onClose={() => setOpen(null)}
        >
          <PassCard {...passProps} />
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

type Tab = "wins" | "bids" | "board" | "sales" | "settings";
const TABS: Tab[] = ["wins", "bids", "board", "sales", "settings"];

/** Вкладка из ссылки: ?tab=sales и прочие; незнакомая - победы. */
function firstTab(): Tab {
  const asked = new URLSearchParams(window.location.search).get("tab");
  return TABS.find((one) => one === asked) ?? "wins";
}

const BID_WORDS: Record<MyBidRow["state"], string> = {
  leading: "Leading",
  won: "Won",
  refunded: "Won, refunded",
  raised: "You raised it",
  outbid: "Outbid, came back",
};

/** Картинка ставки; нет её - пустой квадрат того же размера. */
function Thumb({ src }: { src?: string }) {
  return <span className="yo-thumb">{src && <img src={src} alt="" loading="lazy" />}</span>;
}

function day(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Деньги на балансе: прочерк, пока не прочитали, а не ноль. */
function money(usd: number | null): string {
  return usd === null ? "-" : `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
