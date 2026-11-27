"use client";

import { useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useConnectedStandardWallets } from "@privy-io/react-auth/solana";
import { hasOpened, isCreativeUrl, isOpen, minBidCents, myLogos, originalUrl, rankBidders, shortWallet } from "@oxar/core";
import { SHIRT, ThingView, houseShape, isShirt } from "@oxar/stage";
import { loadFeed, loadMyBids, loadTopBids, type Bid as LotBid, type MyBid } from "@/lib/auction";
import { loadListedThing, type ListedThing } from "@/lib/listing";
import { useDbSession } from "@/lib/use-session";
import { BidForm } from "../auction/bid.tsx";
import { usd, type AuctionPage } from "./data.ts";
import "./live.css";

/**
 * Идущий торг: вещь живой моделью с логотипами лидеров, справа часы, таблица
 * и [ Spots ] [ Who bid ]. Место выбирают в списке или прямо на вещи.
 * Раскрытое место - свои прежние логотипы, новая картинка и ставка.
 *
 * Сама ставка - BidForm, тот же, что в приложении: подпись, транзакция и
 * порядок шагов не трогаем. Здесь только витрина вокруг него и примерка.
 */
export function LiveAuction({ page }: { page: AuctionPage }) {
  const [thing, setThing] = useState<ListedThing | null>(null);
  const [tops, setTops] = useState<Record<string, LotBid | undefined>>({});
  const [feed, setFeed] = useState<LotBid[]>([]);
  const [mine, setMine] = useState<MyBid[]>([]);
  const [tab, setTab] = useState<"spots" | "who">("spots");
  const [picked, setPicked] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ code: string; at: number } | null>(null);
  const [shots, setShots] = useState<Record<string, string>>({});
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);
  const [art, setArt] = useState<Record<string, { url: string; file: File }>>({});
  const [artError, setArtError] = useState("");
  const [brandHints, setBrandHints] = useState<Record<string, string>>({});
  const [toast, setToast] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const linked = useDbSession();
  const { authenticated } = usePrivy();
  const { wallets } = useConnectedStandardWallets();
  const wallet = wallets[0]?.address ?? null;

  useEffect(() => {
    void loadListedThing(page.id).then(setThing);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [page.id]);

  const lots = useMemo(() => thing?.lots ?? [], [thing]);
  const lotOf = (code: string) => lots.find((lot) => lot.spot_code === code) ?? null;

  function refresh() {
    if (lots.length === 0) return;
    void loadTopBids(lots.map((one) => one.id)).then(setTops);
    void loadFeed(lots.map((one) => one.id)).then(setFeed);
    if (wallet) void loadMyBids(wallet).then(setMine);
  }
  useEffect(refresh, [lots]);
  useEffect(() => {
    if (!wallet) return setMine([]);
    void loadMyBids(wallet).then(setMine);
  }, [wallet]);

  useEffect(() => {
    if (!toast) return;
    const gone = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(gone);
  }, [toast]);

  if (!thing) return <p className="auc-empty auc-mute">Loading the auction</p>;

  const shape = thing.shape ?? houseShape(thing.model) ?? (isShirt(thing.model) ? SHIRT : undefined);
  const model = shape?.model ?? thing.model ?? SHIRT.model;
  const noun = shape?.noun && shape.noun !== "thing" ? `the ${shape.noun}` : "the thing";
  const spots = thing.spots.filter((spot) => lotOf(spot.code));

  // Что лежит на вещи: своя примерка главнее лидера места.
  const logos: Record<string, string[]> = {};
  for (const spot of spots) {
    const url = art[spot.code]?.url ?? tops[lotOf(spot.code)!.id]?.media_url;
    if (url) logos[spot.code] = [url];
  }

  const closesAt = lots.length ? Math.min(...lots.map((one) => Date.parse(one.closes_at))) : null;
  const opensAt =
    lots.length && lots.every((one) => one.opens_at)
      ? Math.min(...lots.map((one) => Date.parse(one.opens_at as string)))
      : lots.length === 0 && thing.opensAt
        ? Date.parse(thing.opensAt)
        : null;
  const started = hasOpened(opensAt, now);
  const leads = spots.map((spot) => tops[lotOf(spot.code)!.id]).filter((bid): bid is LotBid => Boolean(bid));
  const bidsOn = (lotId: string) => feed.filter((bid) => bid.lot_id === lotId).length;
  const people = rankBidders(
    lots.map((lot) => ({ id: lot.id, status: lot.status, rehearsal: false, thing_id: thing.id })),
    feed,
  ).sort((a, b) => b.leadCents - a.leadCents || b.bestCents - a.bestCents);
  const logosOfMine = myLogos(mine);
  const label = (code: string) => thing.spots.find((spot) => spot.code === code)?.label ?? code;

  function pick(code: string | null, scroll: boolean) {
    setPicked(code);
    setHover(null);
    setArtError("");
    if (!code) return;
    setTab("spots");
    setFocus({ code, at: Date.now() });
    if (scroll) window.setTimeout(() => document.querySelector(".auc-live .auc-row.on")?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  }

  // Примерка своей картинки - как в приложении: проверить, что она читается.
  async function tryOn(code: string, file: File | undefined) {
    setArtError("");
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return setArtError("That file is over 8 MB. A logo should be far smaller.");
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      URL.revokeObjectURL(url);
      return setArtError("Could not read that image. PNG, JPEG, WebP or SVG.");
    }
    setArt((was) => {
      const old = was[code];
      if (old) URL.revokeObjectURL(old.url);
      return { ...was, [code]: { url, file } };
    });
  }

  // Свой прежний логотип: файл той же ставки, имя - её же. Чужой адрес вместо
  // нашего хранилища не берём.
  async function takeMine(code: string, one: MyBid) {
    const lot = lotOf(code);
    if (!lot) return;
    setBrandHints((was) => ({ ...was, [lot.id]: one.brand }));
    const url = originalUrl(one.mediaUrl);
    if (!isCreativeUrl(url, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) return;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      const ext = (url.split(".").pop() ?? "png").toLowerCase();
      await tryOn(code, new File([blob], `${one.brand} logo.${ext}`, { type: blob.type }));
    } catch {
      setArtError("Could not load that logo. Upload it yourself.");
    }
  }

  const hovered = hover ? lotOf(hover.code) : null;

  return (
    <main className="auc-main auc-live">
      {linked === "failed" && <p className="auc-banner">Could not reach the database. Bidding is off until it is back.</p>}
      <div className="auc-view">
        <ThingView model={model} shape={shape} logos={logos} focus={focus} onShots={setShots} onHover={setHover} onPick={(code) => pick(code, true)} />
        {hover && hovered && (
          <span className="auc-tag" style={{ left: hover.x, top: hover.y }}>
            {label(hover.code)} · {tops[hovered.id] ? usd(tops[hovered.id]!.amount_cents) : `from ${usd(hovered.reserve_cents)}`}
          </span>
        )}
        <span className="auc-hint">
          <b>{picked ? label(picked) : "Tap a spot to bid"}</b> · drag to turn
        </span>
      </div>

      <div className="auc-info">
        <a className="auc-back" href="/?grid">
          [ All auctions ]
        </a>
        <div className="auc-title">
          <h1>{page.title}</h1>
          <span className="auc-live-tag">
            <i />
            {started ? "Live" : "Soon"}
          </span>
        </div>
        <p className="auc-mute">{page.owner}</p>
        {(started ? closesAt : opensAt) !== null && (
          <>
            <p className="auc-clock">{clock((started ? closesAt! : opensAt!) - now)}</p>
            <p className="auc-mute">
              {started ? "Ends" : "Bidding opens"} {stamp(started ? closesAt! : opensAt!)}, your time
            </p>
          </>
        )}
        <dl className="auc-meta">
          <div>
            <dt>Bid so far</dt>
            <dd>{usd(leads.reduce((sum, bid) => sum + bid.amount_cents, 0))}</dd>
          </div>
          <div>
            <dt>Spots</dt>
            <dd>
              {leads.length} of {spots.length} have a bid
            </dd>
          </div>
          <div>
            <dt>Bids</dt>
            <dd>
              {feed.length} from {people.length} {people.length === 1 ? "bidder" : "bidders"}
            </dd>
          </div>
          {thing.reach && (
            <div>
              <dt>Seen by</dt>
              <dd>
                ~{thing.reach.toLocaleString("en-US")} expected{thing.reachChecked ? "" : ", estimated"}
              </dd>
            </div>
          )}
        </dl>

        <div className="auc-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "spots"} onClick={() => setTab("spots")}>
            [ <span>Spots</span> ]
          </button>
          <button type="button" role="tab" aria-selected={tab === "who"} onClick={() => setTab("who")}>
            [ <span>Who bid</span> ]
          </button>
        </div>

        {tab === "spots" ? (
          <div className="auc-spots">
            {!picked && started && (
              <p className="auc-pick">
                <i />
                Pick a spot: tap it on {noun} or in the list
              </p>
            )}
            {spots.map((spot) => {
              const lot = lotOf(spot.code)!;
              const top = tops[lot.id] ?? null;
              const yours = top && wallet && top.bidder_wallet === wallet;
              const count = bidsOn(lot.id);
              const open = picked === spot.code;
              const need = minBidCents(lot.reserve_cents, top?.amount_cents ?? null, lot.min_step_cents);
              const running = started && isOpen(Date.parse(lot.closes_at), now);
              const artBlock = (
                <div className="auc-art">
                  {logosOfMine.length > 0 && (
                    <div className="auc-mine">
                      <span className="auc-label">Your logos</span>
                      <div className="auc-chips">
                        {logosOfMine.slice(0, 8).map((one) => (
                          <button
                            type="button"
                            key={one.mediaUrl}
                            title={one.brand}
                            className={brandHints[lot.id] === one.brand && art[spot.code] ? "on" : undefined}
                            onClick={() => void takeMine(spot.code, one)}
                          >
                            <img src={one.mediaUrl} alt={one.brand} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <label className="auc-upload">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      hidden
                      onChange={(event) => {
                        setBrandHints((was) => ({ ...was, [lot.id]: "" }));
                        void tryOn(spot.code, event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                    <span>{logosOfMine.length ? "Or a new logo" : "Try your logo on this spot"}</span>
                    <span>[ Upload ]</span>
                  </label>
                  {art[spot.code] && brandHints[lot.id] && <p className="auc-mute">Bidding as {brandHints[lot.id]}</p>}
                  {artError && <p className="bad">{artError}</p>}
                </div>
              );
              return (
                <div key={spot.code}>
                  <button
                    type="button"
                    className={["auc-spot", "auc-row", top ? "" : "auc-unsold", yours ? "auc-yours" : "", open ? "on" : ""].join(" ")}
                    onClick={() => pick(open ? null : spot.code, false)}
                  >
                    {shots[spot.code] ? <img src={shots[spot.code]} alt="" /> : <span className="auc-blank" />}
                    <span>
                      <b>{top ? (yours ? "You lead" : top.brand || shortWallet(top.bidder_wallet)) : "No bids yet"}</b>
                      <span className="auc-mute">
                        {spot.label}
                        {count > 1 && ` · ${count} bids`}
                      </span>
                    </span>
                    <span className={top ? undefined : "auc-mute"}>{top ? usd(top.amount_cents) : `from ${usd(lot.reserve_cents)}`}</span>
                  </button>
                  {open && (
                    <div className="auc-bid">
                      {!running ? (
                        <p className="auc-mute">{started ? "Bidding on this spot is closed." : "Bidding opens when the clock runs out."}</p>
                      ) : (
                        <>
                          {/* Без входа форма ставки - одна кнопка входа; примерить можно и до неё. */}
                          {!authenticated && artBlock}
                          <BidForm
                            key={lot.id}
                            lot={lot}
                            need={need}
                            spotLabel={spot.label}
                            topCents={top?.amount_cents ?? null}
                            topBrand={top?.brand ?? ""}
                            art={art[spot.code]}
                            brandHint={brandHints[lot.id]}
                            onPlaced={(bid) => {
                              refresh();
                              setToast(`${usd(bid.cents)} is in escrow. ${top ? `${top.brand || "The last leader"} got their bid back.` : "You lead this spot."}`);
                            }}
                          >
                            {authenticated && artBlock}
                          </BidForm>
                        </>
                      )}
                      <p className="auc-mute auc-note">Minimum {usd(need)}. Paid now, held in escrow until the photo is up.</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="auc-who">
            {people.map((one, at) => {
              const me = wallet === one.wallet;
              return (
                <div key={one.wallet}>
                  <span className="auc-mute">{String(at + 1).padStart(2, "0")}</span>
                  <span className={me ? "auc-me" : undefined}>
                    {me ? "You" : one.brands.join(", ") || shortWallet(one.wallet)}
                    <small>{shortWallet(one.wallet)}</small>
                  </span>
                  <span className="auc-mute">{one.bids === 1 ? "1 bid" : `${one.bids} bids`}</span>
                  <span className={one.leads ? undefined : "auc-mute"}>
                    {one.leads ? `leads ${one.leads} · ${usd(one.leadCents)}` : `outbid · best ${usd(one.bestCents)}`}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <ul className="auc-rules">
          <li>The highest bid when the clock runs out wins the spot.</li>
          <li>A bid in the last 5 minutes adds 5 minutes, so nobody wins by sniping.</li>
          <li>Your bid is paid when you place it and waits in escrow.</li>
          <li>Outbid? It comes straight back. No photo by the deadline? Full refund.</li>
        </ul>
      </div>
      {toast && <p className="auc-toast">{toast}</p>}
    </main>
  );
}

/** Часы до конца: дни отдельным числом, дальше часы, минуты, секунды. */
function clock(ms: number) {
  let left = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(left / 86400);
  left %= 86400;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <>
      {days > 0 && <span className="auc-days">{days}d </span>}
      {pad(Math.floor(left / 3600))}:{pad(Math.floor(left / 60) % 60)}:{pad(left % 60)}
    </>
  );
}

/** Дата и время в часах читателя: «в полдень» у каждого своё. */
function stamp(at: number) {
  return new Date(at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
