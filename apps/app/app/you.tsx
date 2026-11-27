"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useExportWallet } from "@privy-io/react-auth/solana";
import { PublicKey } from "@solana/web3.js";
import {
  avatarLetter,
  BRAND_MAX,
  cleanProfile,
  formatUsd,
  HANDLE_MAX,
  NAME_MAX,
  passReach,
  shortWallet,
  spotName,
  unitsToCents,
  type Bidder,
  type MyBidState,
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
  saveProfile,
  uploadFace,
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
import type { Win } from "@/lib/wins";
import { Notifications } from "./notify.tsx";
import { loadScoreOf } from "@/lib/reviews";
import { signedInWith } from "@/lib/identity";
import { load, type Data } from "./_site/data.ts";
import { mono } from "./_site/mono.ts";
import { Copy } from "./cabinet.tsx";
import { avatar } from "./_site/me.ts";
import { ShareModal } from "./modals.tsx";
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
  const { user } = usePrivy();
  const wallet = user?.wallet?.address;
  const signIn = signedInWith(user);
  // Privy помечает свой встроенный кошелёк; всё прочее - внешний, и ключ
  // от него у хозяина и так есть.
  const embedded = user?.wallet?.walletClientType === "privy";

  // Балансы из цепочки: USDC - чем ставят, SOL - чем платят комиссию сети.
  // null - ещё не прочитали; показываем прочерк, а не врём нулём.
  const [usdc, setUsdc] = useState<number | null>(null); // центы
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
      if (live) setUsdc(unitsToCents(units));
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
  const [open, setOpen] = useState<"share" | null>(null);

  const me = wallet ? (bidders.find((one) => one.wallet === wallet) ?? null) : null;
  // Тот же аватар, что в шапке: зерно - кошелёк, без него почта.
  const seed = wallet ?? user?.email?.address ?? "you";
  const rank = me ? bidders.indexOf(me) + 1 : 0;
  const wonSpots = (me?.spots ?? 0) + (me?.refundedSpots ?? 0);
  const name = profile.display_name ?? (wallet ? shortWallet(wallet) : "You");
  const brands = profile.brand ?? me?.brands.join(", ") ?? "";
  const picture = faceUrl(profile.avatar_path);

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

  // Активность: торг - заголовком, под ним по строке на место - моя старшая
  // ставка и чем она кончилась. Слово ставки - из core (myBidStates), здесь
  // только подписи.
  const groups = new Map<string, MyStand[]>();
  for (const stand of stands) groups.set(stand.thingId, [...(groups.get(stand.thingId) ?? []), stand]);
  const activity = [...groups.entries()]
    .map(([thingId, spots]) => ({
      thingId,
      title: spots[0]!.thing,
      open: spots.some((one) => one.open),
      closes: Math.max(...spots.map((one) => Date.parse(one.closesAt))),
      refundedAt: bids.find((one) => one.thingId === thingId && one.refundedAt)?.refundedAt ?? null,
      spots: spots
        .sort((a, b) => a.spot.localeCompare(b.spot, "en", { numeric: true }))
        .map((stand) => {
          const mine = bids.filter((one) => one.lotId === stand.lotId);
          return {
            stand,
            count: mine.length,
            state: mine.find((one) => one.cents === stand.mineCents)?.state ?? null,
            win: wins?.find((one) => one.lotId === stand.lotId) ?? null,
          };
        }),
    }))
    .sort((a, b) => Number(b.open) - Number(a.open) || b.closes - a.closes);
  const liveNow = data?.auctions.find((one) => one.status === "live") ?? null;
  // Имя хозяина вещи, если оно есть; без него витрина подставляет название.
  const ownerName = (thingId: string) => {
    const one = data?.auctions.find((auction) => auction.id === thingId);
    return one && one.owner !== one.title ? one.owner : null;
  };
  const titleOf = (thingId: string) =>
    data?.auctions.find((one) => one.id === thingId)?.title ?? reach[thingId]?.title ?? null;

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
    { id: "activity", label: "Activity" },
    { id: "board", label: "Leaderboard" },
    ...(sales ? [{ id: "sales" as const, label: "Sales" }] : []),
    { id: "settings", label: "Settings" },
  ];
  const current: Tab = tabs.some((one) => one.id === tab) ? tab : "activity";

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
            {[
              wallet ? shortWallet(wallet) : null,
              me ? `bidding since ${day(me.since)}` : "no bids yet",
              buyerScore?.rating != null ? `★ ${buyerScore.rating.toFixed(1)} from sellers` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>

          {/* Три цифры строкой. Выигранное - вместе с выигрышами, деньги за
              которые вернули: ставка была настоящей. Баланс - в меню кошелька
              в шапке и в Settings. */}
          <div className="yo-stats">
            <div>
              <b>{rank ? `#${rank}` : "-"}</b>
              <span>{rank ? `of ${bidders.length} bidders` : "Not ranked yet"}</span>
            </div>
            <div>
              <b>{formatUsd((me?.paidCents ?? 0) + (me?.refundedCents ?? 0))}</b>
              <span>
                {wonSpots ? `${wonSpots} ${wonSpots === 1 ? "spot" : "spots"} won` : "No spots yet"}
                {me?.refundedSpots ? " · refunded" : ""}
              </span>
            </div>
            <div>
              <b>{pass.total ? `${pass.estimated ? "~" : ""}${compact(pass.total)}` : "0"}</b>
              <span>People saw your logo</span>
            </div>
          </div>

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
                  setTab("activity");
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
              {one.label}
              {one.id === "activity" && stands.length > 0 && <sup>{stands.length}</sup>}
            </button>
          ))}
        </div>

        {current === "activity" && (
          <div className="yo-pane">
            {wins?.some((one) => one.lot) && (
              <NoEmailHint text="Proof arrives on its own schedule, and you have 72 hours to check it. Add an email so the window does not pass silently." />
            )}
            {activity.length === 0 && (
              <div className="yo-empty">
                <b>No bids yet.</b>
                <p className="yo-mute">
                  Your bids and wins show up here, with the logo you sent. Outbid money goes back to your wallet
                  right away.
                </p>
                {liveNow ? (
                  <div className="yo-next">
                    <span>
                      <span className="yo-mute yo-up">Live now</span>
                      <br />
                      {liveNow.title}
                      <br />
                      <span className="yo-mute">
                        {liveNow.spots} {liveNow.spots === 1 ? "spot" : "spots"} · {liveNow.owner}
                      </span>
                    </span>
                    <a className="yo-btn" href={`/auction?thing=${liveNow.id}`}>
                      Bid
                    </a>
                  </div>
                ) : (
                  <p>
                    Nothing is live right now.{" "}
                    <a className="yo-link" href="/">
                      See the auctions
                    </a>
                  </p>
                )}
              </div>
            )}
            {activity.map((auction) => {
              const owner = ownerName(auction.thingId);
              return (
                <div key={auction.thingId} className="yo-auc">
                  <div className="yo-auc-h">
                    <span>{auction.title}</span>
                    <span className="yo-mute yo-up">
                      {auction.open ? `Live, closes ${moment(auction.closes)}` : `Ended ${day(auction.closes)}`}
                      {auction.refundedAt && (
                        <>
                          {" · "}
                          <span className="yo-red">Refunded</span>
                        </>
                      )}
                    </span>
                  </div>
                  {auction.spots.map(({ stand, count, state, win }) => {
                    // Победа с эскроу раскрывается в карточку: фото, выплата, спор.
                    const opens = !!win && !auction.refundedAt;
                    const word = state ? stateWord(state, stand.open, auction.refundedAt ? null : win) : null;
                    const row = (
                      <>
                        <Thumb src={imageOf(stand)} />
                        <span>
                          <b>{spotName(stand.spot)}</b>
                          <span className="yo-mute">
                            {count} {count === 1 ? "bid" : "bids"}
                          </span>
                        </span>
                        <span className="yo-st">
                          {formatUsd(stand.mineCents)}
                          {word && (
                            <em className={word.red ? "red" : undefined}>
                              {word.tag && <span className="yo-tag">Won</span>}
                              {word.tag && word.text ? " " : ""}
                              {word.text}
                            </em>
                          )}
                        </span>
                      </>
                    );
                    return (
                      <div key={stand.lotId} className={opened === stand.lotId ? "yo-win open" : "yo-win"}>
                        {opens ? (
                          <button
                            type="button"
                            className="yo-row"
                            aria-expanded={opened === stand.lotId}
                            onClick={() => setOpened(opened === stand.lotId ? null : stand.lotId)}
                          >
                            {row}
                          </button>
                        ) : (
                          <div className="yo-row">{row}</div>
                        )}
                        {opens && opened === stand.lotId && (
                          <div className="yo-more ym-legacy">
                            <WinCard win={win!} winner={winner} sign={sign} onDone={reload} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {auction.refundedAt && (
                    <p className="yo-note-box yo-mute">
                      {auction.title} did not go out.{" "}
                      {owner
                        ? `${owner} sent every winning bid back on ${day(Date.parse(auction.refundedAt))}.`
                        : `Every winning bid was sent back on ${day(Date.parse(auction.refundedAt))}.`}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {current === "board" && (
          <div className="yo-pane">
            <div className="yo-board">
              <div className="yo-board-h yo-up">
                <span>#</span>
                <span>Bidder</span>
                <span className="yo-n">Spots</span>
                <span className="yo-sum">Won</span>
              </div>
              {bidders.map((one, at) => {
                const face = faces[one.wallet];
                const spots = one.spots + one.refundedSpots;
                const first = one.joined[0] ? titleOf(one.joined[0]) : null;
                return (
                  <div key={one.wallet} className={one === me ? "me" : undefined}>
                    <span className="yo-mute">{String(at + 1).padStart(2, "0")}</span>
                    <span className="yo-who">
                      {face?.display_name ?? face?.brand ?? one.brands[0] ?? shortWallet(one.wallet)}
                      {one === me && " (you)"}
                      <small>{[shortWallet(one.wallet), first].filter(Boolean).join(" · ")}</small>
                    </span>
                    <span className="yo-n yo-mute">{spots || "-"}</span>
                    <span className="yo-sum">
                      {spots ? (
                        formatUsd(one.paidCents + one.refundedCents)
                      ) : (
                        <span className="yo-mute">{formatUsd(one.bestCents)} bid</span>
                      )}
                      {one.refundedCents > 0 && (
                        <small className="yo-up">
                          {one.paidCents ? `${formatUsd(one.refundedCents)} of it refunded` : "refunded"}
                        </small>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="yo-mute yo-foot">
              By spots won, paid first. A refunded win still counts: the bid was real, the thing did not go out.
            </p>
          </div>
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
            <section className="yo-grp">
              <h3>
                Profile<small>How you show up on the board and on the pass</small>
              </h3>
              <ProfileForm
                key={JSON.stringify(profile)}
                profile={profile}
                avatarStyle={avatar(seed)}
                onSaved={(next) => {
                  setProfile(next);
                  // Шапка тоже показывает аватар - пусть узнает о новом сразу.
                  window.dispatchEvent(new CustomEvent("oxar:face", { detail: faceUrl(next.avatar_path) }));
                  void loadFaces().then(setFaces);
                }}
              />
            </section>

            <section className="yo-grp">
              <h3>
                Wallet<small>Yours, not ours. Only you can move the money</small>
              </h3>
              <div>
                <div className="yo-kv">
                  <span className="yo-mute">Address</span>
                  <span>{wallet ? shortWallet(wallet) : "-"}</span>
                  {wallet ? <Copy text={wallet} /> : <span />}
                </div>
                <div className="yo-kv">
                  <span className="yo-mute">USDC</span>
                  <span>{usdc === null ? "-" : formatUsd(usdc)}</span>
                  <span />
                </div>
                <div className="yo-kv">
                  <span className="yo-mute">For fees</span>
                  <span>{sol === null ? "-" : `${sol.toFixed(3)} SOL`}</span>
                  <span />
                </div>
                {signIn?.by === "email" && (
                  <div className="yo-kv">
                    <span className="yo-mute">Signed in with</span>
                    <span className="yo-cut">{signIn.email}</span>
                    <span />
                  </div>
                )}
                {failed && (
                  <p className="yo-bad">
                    Could not read the balance from the network.{" "}
                    <button type="button" className="yo-link" onClick={() => setTries((was) => was + 1)}>
                      Try again
                    </button>
                  </p>
                )}
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
              </div>
            </section>

            <section className="yo-grp">
              <h3>
                Alerts<small>Outbid, won, proof is up</small>
              </h3>
              <Notifications />
            </section>
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
    </div>
  );
}

type Tab = "activity" | "board" | "sales" | "settings";
const TABS: Tab[] = ["activity", "board", "sales", "settings"];

/** Вкладка из ссылки: ?tab=sales и прочие; прежние wins и bids - активность, незнакомая - тоже. */
function firstTab(): Tab {
  const asked = new URLSearchParams(window.location.search).get("tab");
  return TABS.find((one) => one === asked) ?? "activity";
}

/**
 * Чем кончилась моя старшая ставка на месте - подписью строки. tag - метка
 * «Won»; у победы с эскроу рядом её стадия, red - ждёт действия.
 */
function stateWord(
  state: MyBidState,
  open: boolean,
  win: Win | null,
): { tag: boolean; text: string; red: boolean } {
  if (state === "leading") return { tag: false, text: "Leading", red: false };
  if (state === "raised") return { tag: false, text: "You raised it", red: false };
  if (state === "outbid") return { tag: false, text: "Outbid, money back", red: open };
  if (state === "refunded") return { tag: true, text: "money back", red: false };
  const word = win ? winWord(win) : null;
  return { tag: true, text: word?.word ?? "", red: word?.red ?? false };
}

/**
 * Профиль на месте, без окна: поля правятся сразу, «Save» появляется, когда
 * что-то поменялось. Правила полей - cleanProfile в core, запись - как в
 * прежнем окне: картинки грузятся сразу, в профиль попадают по Save.
 */
function ProfileForm({
  profile,
  avatarStyle,
  onSaved,
}: {
  profile: Profile;
  avatarStyle: CSSProperties;
  onSaved: (next: Profile) => void;
}) {
  const [name, setName] = useState(profile.display_name ?? "");
  const [brand, setBrand] = useState(profile.brand ?? "");
  const [x, setX] = useState(profile.x_handle ? `@${profile.x_handle}` : "");
  const [picture, setPicture] = useState(profile.avatar_path);
  const [logo, setLogo] = useState(profile.logo_path);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const changed =
    name !== (profile.display_name ?? "") ||
    brand !== (profile.brand ?? "") ||
    x !== (profile.x_handle ? `@${profile.x_handle}` : "") ||
    picture !== profile.avatar_path ||
    logo !== profile.logo_path;

  async function pick(list: FileList | null, kind: "avatar" | "logo") {
    const file = list?.[0];
    if (!file) return;
    setError("");
    setBusy(true);
    const result = await uploadFace(file, kind);
    setBusy(false);
    if ("error" in result) return setError(result.error);
    if (kind === "avatar") setPicture(result.path);
    else setLogo(result.path);
  }

  async function save() {
    const clean = cleanProfile({ name, brand, x });
    if (!clean.ok) return setError(clean.error);
    const next: Profile = { ...clean.value, avatar_path: picture, logo_path: logo };
    setBusy(true);
    const failed = await saveProfile(next);
    setBusy(false);
    if (failed) return setError(failed);
    onSaved(next);
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="yo-pics">
        <label className="yo-pic">
          <i className="round" style={picture ? undefined : avatarStyle}>
            {picture && <img src={faceUrl(picture) ?? ""} alt="" />}
          </i>
          <span className="yo-link yo-up">Picture</span>
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void pick(event.target.files, "avatar")} />
        </label>
        <label className="yo-pic">
          <i>{logo ? <img src={faceUrl(logo) ?? ""} alt="" /> : "Logo"}</i>
          <span className="yo-link yo-up">Brand logo</span>
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void pick(event.target.files, "logo")} />
        </label>
      </div>
      <label className="yo-kv">
        <span className="yo-mute">Name</span>
        <input value={name} maxLength={NAME_MAX} onChange={(event) => setName(event.target.value)} placeholder="Shown instead of your wallet" />
      </label>
      <label className="yo-kv">
        <span className="yo-mute">Brand</span>
        <input value={brand} maxLength={BRAND_MAX} onChange={(event) => setBrand(event.target.value)} placeholder="Shown next to your name" />
      </label>
      <label className="yo-kv">
        <span className="yo-mute">X</span>
        <input value={x} maxLength={HANDLE_MAX + 1} onChange={(event) => setX(event.target.value)} placeholder="@handle" />
      </label>
      {(changed || error) && (
        <div className="yo-save yo-up">
          <span>{error || (busy ? "Saving…" : "Profile changed")}</span>
          <button type="submit" className="yo-link" disabled={busy || !changed}>
            [ Save ]
          </button>
        </div>
      )}
    </form>
  );
}

/** Картинка ставки; нет её - пустой квадрат того же размера. */
function Thumb({ src }: { src?: string }) {
  return <span className="yo-thumb">{src && <img src={src} alt="" loading="lazy" />}</span>;
}

/** «Oct 30»; год - только если не нынешний. */
function day(ms: number): string {
  const date = new Date(ms);
  const year = date.getFullYear() === new Date().getFullYear() ? undefined : "numeric";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year });
}

/** Когда закрывается идущий торг: день и время. */
function moment(ms: number): string {
  return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Охват крупной цифрой: 50K, а не 50,000. */
function compact(people: number): string {
  return people >= 1000 ? `${Math.round(people / 1000)}K` : String(people);
}
