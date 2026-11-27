"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatUsd, parseUsd, shortWallet, spotName } from "@oxar/core";
import { ThingStage, type Stage } from "@oxar/stage";
import {
  awaitsReview,
  reviewThing,
  dropPermit,
  grantPermit,
  openStickers,
  loadAdminThings,
  saleModeOk,
  saveSpotGeo,
  updateThing,
  uploadModel,
  uploadProof,
  type AdminThing,
} from "@/lib/admin";
import { afterTodos, shelfOf, type AfterTodo, type Shelf } from "@/lib/admin-things";
import { photoUrl } from "@/lib/seller";
import { STICKER_CAP, STICKER_PRICE_CENTS } from "@/lib/stickers";
import { Media } from "../gallery.tsx";
import { shapeOf } from "@/lib/listing";
import { decideSeller, loadApplications, type Application } from "@/lib/applications";
import { SpotMark } from "../seller/parts.tsx";
import { reviewState } from "@/lib/thing-review";
import { Disputes, MoveCard } from "./disputes.tsx";
import { PrepareThing } from "./prepare.tsx";
import { GiveToSeller } from "./give.tsx";
import { FeeTerms } from "./terms.tsx";
import { BidPhotos } from "../winners.tsx";
import { loadAwaitingProof, loadDisputes, type AwaitingProof, type Dispute } from "@/lib/arbiter";
import { readTerms, type Terms } from "@/lib/chain";

/**
 * Админка - своя страница /admin. Наверху две вкладки: Inbox - только то,
 * где нужно действие, и Things - все вещи с фильтром. Вещь открывается одним
 * экраном с четырьмя разделами по жизни торга: Listing, Spots, After auction,
 * On-chain. Заявки продавцов решаются прямо во входящих, споры и комиссия -
 * своими экранами оттуда же.
 */

type Section = "listing" | "spots" | "after" | "chain";
type View =
  | { kind: "list" }
  | { kind: "thing"; id: string; section?: Section }
  | { kind: "prepare" }
  | { kind: "disputes" }
  | { kind: "fee" };
type Row = { thing: AdminThing; shelf: Shelf; todo: AfterTodo[] };

const SHELF_LABEL: Record<Shelf, string> = {
  live: "Live",
  ended: "Ended",
  hidden: "Hidden",
  test: "Test run",
  draft: "Draft",
};

const FILTERS: { id: "all" | "live" | "ended" | "hidden" | "test"; label: string; keep: (row: Row) => boolean }[] = [
  // Тесты и спрятанные - своими полками: в «All» только настоящие вещи.
  { id: "all", label: "All", keep: (row) => row.shelf !== "test" && row.shelf !== "hidden" },
  { id: "live", label: "Live", keep: (row) => row.shelf === "live" },
  { id: "ended", label: "Ended", keep: (row) => row.shelf === "ended" },
  { id: "hidden", label: "Hidden", keep: (row) => row.shelf === "hidden" },
  { id: "test", label: "Test runs", keep: (row) => row.shelf === "test" },
];

const TODO_LABEL: Record<AfterTodo, string> = { reach: "Add reach", photos: "Add results photos" };

const LOCKUP_MISMATCH =
  "Its auction on chain pays at close without proof, but this thing is not marked No money lockup. Do not approve it.";

/** Что было открыто - из адреса: ?tab=things, ?thing=<id>. */
function firstView(): { tab: "inbox" | "things"; view: View } {
  const params = new URLSearchParams(window.location.search);
  const thing = params.get("thing");
  return {
    tab: params.get("tab") === "things" ? "things" : "inbox",
    view: thing && /^[0-9a-f-]{36}$/.test(thing) ? { kind: "thing", id: thing } : { kind: "list" },
  };
}

export function Admin() {
  const [first] = useState(firstView);
  const [tab, setTab] = useState(first.tab);
  const [view, setView] = useState<View>(first.view);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [things, setThings] = useState<AdminThing[] | null>(null);
  const [people, setPeople] = useState<Application[] | null>(null);
  const [disputes, setDisputes] = useState<Dispute[] | null>(null);
  const [terms, setTerms] = useState<Terms | null | undefined>(undefined);
  // Действие прямо во входящих: какая строка занята и что не вышло.
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState("");

  function reload() {
    void loadAdminThings().then(setThings);
    void loadApplications().then(setPeople);
    void loadDisputes().then(setDisputes);
    void readTerms()
      .catch(() => null)
      .then(setTerms);
  }
  useEffect(reload, []);

  // Адрес повторяет экран: обновил страницу - остался там же.
  useEffect(() => {
    const url = view.kind === "thing" ? `?thing=${view.id}` : view.kind === "list" && tab === "things" ? "?tab=things" : "";
    window.history.replaceState(null, "", `${window.location.pathname}${url}`);
  }, [view, tab]);

  function go(next: View) {
    setView(next);
    setProblem("");
    window.scrollTo(0, 0);
  }

  // Решение принято - сразу следующая вещь, что ждёт решения; нет таких -
  // обратно к списку. Список берём свежий: решение только что его изменило.
  async function next(done: string) {
    const list = await loadAdminThings();
    setThings(list);
    const waiting = list.find((one) => one.id !== done && awaitsReview(one));
    go(waiting ? { kind: "thing", id: waiting.id } : { kind: "list" });
  }

  const rows: Row[] = (things ?? []).map((thing) => {
    const shelf = shelfOf(thing);
    return { thing, shelf, todo: afterTodos({ ...thing, shelf }) };
  });

  if (view.kind === "thing") {
    const row = rows.find((one) => one.thing.id === view.id);
    if (!row) {
      return <p className="adm-wait">{things === null ? "Loading" : "This thing is not here."}</p>;
    }
    return (
      <AdminThingView
        key={row.thing.id}
        row={row}
        section={view.section}
        onBack={() => go({ kind: "list" })}
        onChanged={reload}
        onReviewed={() => void next(row.thing.id)}
      />
    );
  }

  if (view.kind !== "list") {
    return (
      <div className="adm-sub">
        {/* Спор решён или комиссия сменена - входящие и цифры перечитываем. */}
        <button
          type="button"
          className="adm-back"
          onClick={() => {
            reload();
            go({ kind: "list" });
          }}
        >
          &larr; Admin
        </button>
        {view.kind === "prepare" && (
          <PrepareThing
            onCancel={() => go({ kind: "list" })}
            onPrepared={(id) => {
              void loadAdminThings().then((list) => {
                setThings(list);
                go({ kind: "thing", id });
              });
            }}
          />
        )}
        {view.kind === "disputes" && <Disputes />}
        {view.kind === "fee" && <FeeTerms />}
      </div>
    );
  }

  const open = (id: string, section?: Section) => go({ kind: "thing", id, section });

  async function approve(thing: AdminThing) {
    setBusy(thing.id);
    setProblem("");
    if (!(await saleModeOk(thing))) {
      setBusy(null);
      return setProblem(`${thing.title}: ${LOCKUP_MISMATCH}`);
    }
    const ok = await reviewThing(thing.id, true);
    setBusy(null);
    if (!ok) setProblem(`Could not approve ${thing.title}.`);
    reload();
  }

  async function decide(one: Application, yes: boolean) {
    setBusy(one.userId);
    setProblem("");
    const ok = await decideSeller(one.userId, yes);
    setBusy(null);
    if (!ok) setProblem("Could not save the seller decision. Try again.");
    reload();
  }

  // Входящие - только то, где нужно действие; срочное (одобрить, спор) - красным.
  const tasks: { key: string; kind: string; hot?: boolean; title: ReactNode; sub: string; acts: ReactNode }[] = [];
  for (const { thing } of rows.filter((one) => awaitsReview(one.thing))) {
    const closes = thing.prices.map((one) => one.closesAt).sort().at(-1);
    tasks.push({
      key: `review:${thing.id}`,
      kind: "Approve",
      hot: true,
      title: <Opener onClick={() => open(thing.id)}>{thing.title}</Opener>,
      sub: [plural(thing.spots.length, "spot"), thing.model ? "3D added" : "no 3D", closes && `closes ${day(closes)}`]
        .filter(Boolean)
        .join(" · "),
      acts: (
        <>
          <button type="button" className="adm-btn" disabled={busy === thing.id} onClick={() => void approve(thing)}>
            Approve
          </button>
          <button type="button" className="adm-link" onClick={() => open(thing.id, "listing")}>
            Decline
          </button>
        </>
      ),
    });
  }
  for (const one of (disputes ?? []).filter((d) => d.lot && d.sellerBps === null)) {
    tasks.push({
      key: `dispute:${one.lotId}`,
      kind: "Dispute",
      hot: true,
      title: `${one.thing} · ${spotName(one.spot)}`,
      sub: `Winner says: ${one.reason}`,
      acts: (
        <button type="button" className="adm-btn" onClick={() => go({ kind: "disputes" })}>
          Open
        </button>
      ),
    });
  }
  for (const one of people ?? []) {
    tasks.push({
      key: `seller:${one.userId}`,
      kind: "Seller",
      title: `${one.contact} wants to sell`,
      sub: [one.about, one.wallet ? shortWallet(one.wallet) : "no wallet", day(one.createdAt)].filter(Boolean).join(" · "),
      acts: (
        <>
          <button type="button" className="adm-btn" disabled={busy === one.userId} onClick={() => void decide(one, true)}>
            Approve
          </button>
          <button type="button" className="adm-link" disabled={busy === one.userId} onClick={() => void decide(one, false)}>
            Decline
          </button>
        </>
      ),
    });
  }
  for (const { thing } of rows.filter((one) => giveable(one.thing))) {
    tasks.push({
      key: `give:${thing.id}`,
      kind: "Give",
      title: <Opener onClick={() => open(thing.id)}>{thing.title}</Opener>,
      sub: `${plural(thing.spots.length, "spot")} · prepared, not given to a seller yet`,
      acts: (
        <button type="button" className="adm-btn" onClick={() => open(thing.id, "chain")}>
          Give
        </button>
      ),
    });
  }
  for (const { thing, todo } of rows.filter((one) => one.todo.length > 0)) {
    tasks.push({
      key: `after:${thing.id}`,
      kind: "After auction",
      title: <Opener onClick={() => open(thing.id, "after")}>{thing.title}</Opener>,
      sub: todo
        .map((one) =>
          one === "photos"
            ? "No results photos yet"
            : thing.reach
              ? `Reach is an estimate (${thing.reach.toLocaleString("en-US")}). Put the real post numbers`
              : "No reach yet",
        )
        .join(" · "),
      acts: todo.map((one, at) => (
        <button key={one} type="button" className={at === 0 ? "adm-btn" : "adm-link"} onClick={() => open(thing.id, "after")}>
          {TODO_LABEL[one]}
        </button>
      )),
    });
  }

  const real = rows.filter((row) => row.shelf !== "test");
  const openDisputes = (disputes ?? []).filter((one) => one.lot && one.sellerBps === null).length;
  const loaded = things !== null && people !== null && disputes !== null;
  const shown = rows.filter(FILTERS.find((one) => one.id === filter)!.keep);

  return (
    <>
      <div className="adm-top">
        <h1>Admin</h1>
        <button type="button" className="adm-btn" onClick={() => go({ kind: "prepare" })}>
          + New auction
        </button>
      </div>
      <div className="adm-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "inbox"} className={tab === "inbox" ? "on" : ""} onClick={() => setTab("inbox")}>
          Inbox{tasks.length > 0 && <sup className="hot">{tasks.length}</sup>}
        </button>
        <button type="button" role="tab" aria-selected={tab === "things"} className={tab === "things" ? "on" : ""} onClick={() => setTab("things")}>
          Things{things && <sup>{rows.filter(FILTERS[0]!.keep).length}</sup>}
        </button>
      </div>

      {tab === "inbox" ? (
        <div className="adm-side">
          <div>
            {problem && <p className="bad adm-problem">{problem}</p>}
            {!loaded && tasks.length === 0 ? (
              <p className="adm-clear">Loading</p>
            ) : tasks.length === 0 ? (
              <p className="adm-clear">
                <b>All clear.</b>
                <br />
                Approvals, sellers, disputes and after-auction steps land here.
              </p>
            ) : (
              <div className="adm-tasks">
                {tasks.map((one) => (
                  <div className="adm-task" key={one.key}>
                    <span className={one.hot ? "adm-kind hot" : "adm-kind"}>{one.kind}</span>
                    <div className="adm-task-text">
                      <b>{one.title}</b>
                      <span className="adm-mute">{one.sub}</span>
                    </div>
                    <div className="adm-acts">{one.acts}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="adm-box">
              <h3>
                <span>Now</span>
              </h3>
              <Kv k="Live auctions">{things ? real.filter((row) => row.shelf === "live").length : "-"}</Kv>
              <Kv k="Raised, all time">
                {things
                  ? formatUsd(real.filter((row) => !row.thing.refunded).reduce((sum, row) => sum + row.thing.raisedCents, 0))
                  : "-"}
              </Kv>
              <Kv k="Things on the market">
                {things ? real.filter((row) => row.thing.active && !row.thing.hidden).length : "-"}
              </Kv>
              <Kv k="Open disputes">
                {disputes ? openDisputes : "-"}
                <button type="button" className="adm-link" onClick={() => go({ kind: "disputes" })}>
                  View
                </button>
              </Kv>
            </div>
            <div className="adm-box">
              <h3>
                <span>Settings</span>
              </h3>
              <Kv k="Fee">
                {terms === undefined ? "-" : terms === null ? "Could not read" : `${terms.feeBps / 100}%`}
                <button type="button" className="adm-link" onClick={() => go({ kind: "fee" })}>
                  Change
                </button>
              </Kv>
            </div>
          </div>
        </div>
      ) : (
        <div className="adm-pane">
          <div className="adm-chips">
            {FILTERS.map((one) => (
              <button key={one.id} type="button" className={filter === one.id ? "on" : ""} onClick={() => setFilter(one.id)}>
                {one.label} {things ? rows.filter(one.keep).length : ""}
              </button>
            ))}
          </div>
          {things === null && <p className="adm-clear">Loading</p>}
          {things && shown.length === 0 && <p className="adm-clear">Nothing here.</p>}
          <div className="adm-things">
            {shown.map(({ thing, shelf, todo }) => {
              const thumb = thing.photos[0] ?? thing.winnerImage;
              return (
                <button type="button" key={thing.id} className="adm-thing" onClick={() => open(thing.id)}>
                  {thumb ? <img className="adm-thumb" src={thumb} alt="" loading="lazy" /> : <span className="adm-thumb" />}
                  <span className="adm-thing-text">
                    <b>{thing.title}</b>
                    <span className="adm-mute">
                      {plural(thing.spots.length, "spot")} · {thing.house ? "ours" : "seller"}
                      {thing.refunded ? " · refunded" : ""}
                    </span>
                  </span>
                  <span className="adm-c3">
                    <State shelf={shelf} thing={thing} />
                  </span>
                  <span className="adm-c4 adm-r">
                    {thing.raisedCents ? formatUsd(thing.raisedCents) : <span className="adm-mute">-</span>}
                    <br />
                    <span className="adm-mute">{plural(thing.bids, "bid")}</span>
                  </span>
                  <span className={todo.length ? "adm-r adm-up adm-todo" : "adm-r adm-up adm-mute"}>
                    {todo[0] ? TODO_LABEL[todo[0]] : thing.reach ? `${seen(thing.reach)} seen` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function Opener({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="adm-open" onClick={onClick}>
      {children}
    </button>
  );
}

function Kv({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="adm-kv">
      <span className="adm-mute">{k}</span>
      <span>{children}</span>
    </div>
  );
}

/** Точка и слово: идёт, прошла, спрятана; у неоткрытой - где она в проверке. */
function State({ shelf, thing }: { shelf: Shelf; thing: AdminThing }) {
  const review = reviewState(thing);
  const label =
    shelf !== "draft"
      ? SHELF_LABEL[shelf]
      : giveable(thing)
        ? "Prepared"
        : review === "awaiting" && thing.published
          ? "Awaiting approval"
          : review === "declined"
            ? "Declined"
            : "Draft";
  return (
    <span className={`adm-state ${shelf}`}>
      <i />
      {label}
      {thing.closesAt && <span className="adm-mute"> {day(thing.closesAt)}</span>}
    </span>
  );
}

/** Подготовленная вещь с местами, ещё не переданная продавцу. */
function giveable(thing: AdminThing): boolean {
  return (
    thing.prepared &&
    !thing.published &&
    !thing.declinedReason &&
    !thing.hidden &&
    thing.drafts.length === 0 &&
    thing.spots.length > 0
  );
}

/** Размер места на модели по умолчанию - в единицах сцены, вещь в ней ~0.62. */
const SIZE = 0.1;

const SECTIONS: { id: Section; label: string }[] = [
  { id: "listing", label: "Listing" },
  { id: "spots", label: "Spots" },
  { id: "after", label: "After auction" },
  { id: "chain", label: "On-chain" },
];

function AdminThingView({
  row,
  section,
  onBack,
  onChanged,
  onReviewed,
}: {
  row: Row;
  /** Раздел, к которому прокрутить при открытии: «Add reach» ведёт в After auction. */
  section?: Section;
  onBack: () => void;
  onChanged: () => void;
  /** Одобрена или отклонена - дальше следующая. */
  onReviewed: () => void;
}) {
  const { thing, shelf, todo } = row;
  const [title, setTitle] = useState(thing.title);
  const [reach, setReach] = useState(thing.reach && thing.reachChecked ? String(thing.reach) : "");
  const [tagline, setTagline] = useState(thing.tagline ?? "");
  const [busy, setBusy] = useState(false);
  // Видео грузится десятки секунд: кнопка говорит, что идёт загрузка.
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  // «Кто, где, когда, особенность» правит и админ: продавец пишет это до
  // публикации, а поправить после неё, когда торг уже идёт, можем только мы.
  const [worn, setWorn] = useState(thing.worn);
  const [stickers, setStickers] = useState({ price: String(STICKER_PRICE_CENTS / 100), count: String(STICKER_CAP) });
  // Спрятать вещь с идущим торгом - с подтверждением: торг в цепочке не
  // останавливается, и админ должен это прочитать до нажатия.
  const [confirmHide, setConfirmHide] = useState(false);
  const state = reviewState(thing);
  const [viewing, setViewing] = useState<number | null>(null);
  const [picked, setPicked] = useState(
    () => (thing.spots.find((spot) => !spot.geo) ?? thing.spots[0])?.code ?? null,
  );
  const spot = thing.spots.find((one) => one.code === picked) ?? null;
  const [size, setSize] = useState<[string, string]>(() => sizeOf(spot));
  const stage = useRef<Stage | null>(null);
  // Сроки пруфа этой вещи: торги с победителями, где пруфа ещё нет.
  const [waiting, setWaiting] = useState<AwaitingProof[]>([]);
  const [at, setAt] = useState<Section>(section ?? "listing");

  useEffect(() => setSize(sizeOf(spot)), [spot?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  function reloadWaiting() {
    void loadAwaitingProof().then((list) => setWaiting(list.filter((one) => one.thingId === thing.id)));
  }
  useEffect(reloadWaiting, [thing.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Открыли с разделом - сразу к нему; дальше меню слева следит за прокруткой.
  useEffect(() => {
    if (section) document.getElementById(`adm-${section}`)?.scrollIntoView();
    const spy = () => {
      let current: Section = "listing";
      for (const one of SECTIONS) {
        const box = document.getElementById(`adm-${one.id}`);
        if (box && box.getBoundingClientRect().top < 160) current = one.id;
      }
      setAt(current);
    };
    window.addEventListener("scroll", spy, { passive: true });
    return () => window.removeEventListener("scroll", spy);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Решение: получилось - к следующей вещи, нет - остаёмся с ошибкой.
  async function decide(job: () => Promise<boolean>, failure: string) {
    setBusy(true);
    setError("");
    const ok = await job();
    setBusy(false);
    if (ok) onReviewed();
    else setError(failure);
  }

  async function run(job: () => Promise<boolean>, failure: string) {
    setBusy(true);
    setError("");
    const ok = await job();
    setBusy(false);
    if (!ok) setError(failure);
    onChanged();
  }

  // На сцене - только уже поставленные места: сцена строится один раз, и
  // каждое новое место пересобирает её ключом.
  const placed = thing.spots.filter((one) => one.geo);
  const shape = thing.model ? (shapeOf(thing.model, placed) ?? emptyShape(thing.model)) : null;
  const sceneKey = JSON.stringify(placed.map((one) => [one.code, one.geo]));
  const allPlaced = thing.spots.length > 0 && placed.length === thing.spots.length;

  // Решение по вещи продавца: одобрить или отклонить. У нашей и у
  // подготовленной, ещё не переданной, решения нет.
  const reviewed = !thing.house && !giveable(thing);
  const onChain =
    giveable(thing) ||
    ((!thing.published || thing.noLockup) && !giveable(thing)) ||
    ((thing.stickerSheet || thing.sellerWallet) && !giveable(thing)) ||
    waiting.length > 0;

  return (
    <div className="adm-ed">
      <nav className="adm-nav">
        <button type="button" className="adm-back" onClick={onBack}>
          &larr; Admin
        </button>
        {SECTIONS.map((one) => (
          <button
            key={one.id}
            type="button"
            className={at === one.id ? "on" : ""}
            onClick={() => document.getElementById(`adm-${one.id}`)?.scrollIntoView({ behavior: "smooth" })}
          >
            {one.label}
            {one.id === "after" && todo.length > 0 && <em>{todo.length}</em>}
          </button>
        ))}
        {/* Спрятать и вернуть на маркет - тихой ссылкой: трогают её редко. */}
        {reviewed && state === "approved" && !confirmHide && (
          <button
            type="button"
            className="adm-nav-quiet"
            disabled={busy}
            onClick={() =>
              thing.prices.length > 0
                ? setConfirmHide(true)
                : run(() => updateThing(thing.id, { active: false, hidden: true }), "Could not hide it.")
            }
          >
            Hide from market
          </button>
        )}
        {reviewed && state === "hidden" && (
          <button
            type="button"
            className="adm-nav-quiet"
            disabled={busy}
            onClick={async () => {
              if (!(await saleModeOk(thing))) return setError(LOCKUP_MISMATCH);
              void run(() => updateThing(thing.id, { active: true, hidden: false }), "Could not show it.");
            }}
          >
            Show on market
          </button>
        )}
      </nav>

      <div className="adm-ed-body">
        <div className="adm-top">
          <div>
            <State shelf={shelf} thing={thing} />
            <h1>{thing.title}</h1>
            {reviewed && state === "approved" && (
              <p className="muted">Approved. It shows on the Market while its auction is open.</p>
            )}
            {reviewed && state === "hidden" && (
              <p className="muted">Approved, hidden from the Market. Bidding continues on chain.</p>
            )}
          </div>
          <a className="adm-link" href={`/auction?thing=${thing.id}`}>
            View page &rarr;
          </a>
        </div>

        {confirmHide && (
          <div className="adm-warn">
            <p className="muted">
              Bidding continues on chain; the current leader keeps the spot. You can show it on the Market
              again any time.
            </p>
            <div className="ad-decide">
              <button type="button" className="sl-btn light" disabled={busy} onClick={() => setConfirmHide(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="sl-btn dark"
                disabled={busy}
                onClick={() => {
                  setConfirmHide(false);
                  void run(() => updateThing(thing.id, { active: false, hidden: true }), "Could not hide it.");
                }}
              >
                Hide it
              </button>
            </div>
          </div>
        )}

        <section id="adm-listing" className="adm-section">
          <h2>Listing</h2>
          <p className="muted">What buyers see before they bid.</p>

          {/* Решение по вещи - первым: ради него админ сюда и пришёл. */}
          {reviewed && (state === "draft" || state === "awaiting" || state === "declined") && (
            <div className="sl-card ad-card adm-review">
              <h3>Review</h3>
              {thing.declinedReason ? (
                <p className="muted">Declined: {thing.declinedReason}</p>
              ) : (
                <p className="muted">
                  {thing.published
                    ? "The seller published the auction. Check the prices and approve it to show it on the Market."
                    : "Draft. The seller has not set prices and published yet - approve once they do."}
                </p>
              )}
              {/* Отклонённую не одобряют: продавцу остаётся только удалить её.
                  Черновик тоже: без цен и «кто, где, когда» одобрять нечего. */}
              {state === "awaiting" && thing.published && (
                <button
                  type="button"
                  className="sl-btn dark"
                  disabled={busy}
                  onClick={async () => {
                    if (!(await saleModeOk(thing))) return setError(LOCKUP_MISMATCH);
                    void decide(() => reviewThing(thing.id, true), "Could not approve it.");
                  }}
                >
                  Approve
                </button>
              )}
              {/* Отклонить можно только до одобрения: после него торг уже идёт
                  или прошёл, и отказ продавцу ничего бы не значил. */}
              {(state === "draft" || state === "awaiting") && (
                <>
                  <label className="sl-field ad-reason">
                    Reason to decline - the seller sees it
                    <textarea
                      value={reason}
                      maxLength={500}
                      rows={3}
                      placeholder="The spots are on a curved part, logos would not print well."
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="sl-btn light"
                    disabled={busy || reason.trim().length < 3}
                    onClick={() => decide(() => reviewThing(thing.id, false, reason.trim()), "Could not decline it.")}
                  >
                    Decline
                  </button>
                </>
              )}
            </div>
          )}

          <div className="sl-card ad-card">
            <label className="sl-field">
              Title
              <span className="sl-input soft">
                <input value={title} onChange={(event) => setTitle(event.target.value)} />
              </span>
            </label>
            <label className="sl-field">
              Tagline
              <span className="sl-input soft">
                <input value={tagline} placeholder="One line under the title" onChange={(event) => setTagline(event.target.value)} />
              </span>
            </label>
            <button
              type="button"
              className="sl-btn light"
              disabled={busy || !title.trim() || (title === thing.title && tagline === (thing.tagline ?? ""))}
              onClick={() =>
                run(
                  () => updateThing(thing.id, { title: title.trim(), tagline: tagline.trim() || null }),
                  "Could not save the name.",
                )
              }
            >
              Save name
            </button>
          </div>

          <div className="sl-card ad-card">
            <h3>Who, where and when</h3>
            {(["by", "where", "when"] as const).map((key) => (
              <label className="sl-field" key={key}>
                {key === "by" ? "Who has it" : key === "where" ? "Where" : "When it's worn"}
                <span className="sl-input soft">
                  <input
                    value={worn[key]}
                    maxLength={120}
                    onChange={(event) => setWorn({ ...worn, [key]: event.target.value })}
                  />
                </span>
              </label>
            ))}
            <label className="sl-field ad-reason">
              What makes it special (optional)
              <textarea
                value={worn.about}
                maxLength={1000}
                rows={3}
                onChange={(event) => setWorn({ ...worn, about: event.target.value })}
              />
            </label>
            <p className="muted">Who, where and when are needed before the auction opens. The rest is optional.</p>
            <button
              type="button"
              className="sl-btn light"
              disabled={busy || JSON.stringify(worn) === JSON.stringify(thing.worn)}
              onClick={() =>
                run(
                  () =>
                    updateThing(thing.id, {
                      worn_by: worn.by.trim() || null,
                      worn_where: worn.where.trim() || null,
                      worn_when: worn.when.trim() || null,
                      worn_about: worn.about.trim() || null,
                    }),
                  "Could not save it.",
                )
              }
            >
              Save
            </button>
          </div>

          {/* Снимки открываются крупно - для 3D-модели их смотрят с разметкой и
              без, и сохраняют оригинал. */}
          <div className="sl-card ad-card">
            <h3>Photos · {thing.photos.length}</h3>
            {thing.photos.length > 0 ? (
              <div className="ad-photos">
                {thing.photos.map((url, index) => (
                  <button type="button" className="sl-photo ad-photo" key={url} onClick={() => setViewing(index)}>
                    <img src={url} alt="" />
                    {thing.spots.map((one, at) =>
                      one.rect && one.photo === index ? (
                        <SpotMark key={one.id} rect={one.rect} outline={one.outline} number={at + 1} />
                      ) : null,
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">No photos.</p>
            )}
          </div>
          {viewing !== null && (
            <PhotoViewer thing={thing} at={viewing} onAt={setViewing} onClose={() => setViewing(null)} />
          )}
        </section>

        <section id="adm-spots" className="adm-section">
          <h2>Spots</h2>
          <p className="muted">
            {plural(thing.spots.length, "spot")}
            {thing.spots.length > 0 ? `: ${thing.spots.map((one) => one.label).join(", ")}.` : "."}
          </p>

          {/* У наших вещей модель и места живут в коде: ставить их здесь нечего. */}
          {thing.house ? (
            <p className="muted">Our things keep the 3D model and spots in code.</p>
          ) : (
            <div className="sl-card ad-card">
              <h3>3D model</h3>
              <label className="sl-btn light">
                {thing.model ? "Replace .glb" : "Upload .glb"}
                <input
                  type="file"
                  accept=".glb,model/gltf-binary"
                  hidden
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void run(async () => Boolean(await uploadModel(thing.id, file)), "Upload failed.");
                  }}
                />
              </label>

              {shape && (
                <>
                  <p className="muted">
                    Pick a spot below, then click the model where it goes. Faces
                    should stand upright: the spot is found by a level ray to the
                    center.
                  </p>
                  <div className="lot-scene ad-scene">
                    <ThingStage
                      key={`${thing.model}:${sceneKey}`}
                      shape={shape}
                      picked={picked}
                      onPick={setPicked}
                      stage={stage}
                      onSurface={(at) => {
                        if (!spot || busy) return;
                        const geo = {
                          height: round(at.height),
                          azimuth: round(at.azimuth),
                          size: [Number(size[0]) || SIZE, Number(size[1]) || SIZE] as [number, number],
                        };
                        const next = thing.spots.find((one) => !one.geo && one.code !== spot.code);
                        void run(() => saveSpotGeo(spot.id, geo), "Could not save the spot.").then(() => {
                          if (next) setPicked(next.code);
                        });
                      }}
                    />
                  </div>
                  <div className="ad-spots">
                    {thing.spots.map((one, at) => (
                      <button
                        type="button"
                        key={one.id}
                        className={one.code === picked ? "ad-spot on" : "ad-spot"}
                        onClick={() => setPicked(one.code)}
                      >
                        {at + 1}. {one.label} {one.geo ? "✓" : ""}
                      </button>
                    ))}
                  </div>
                  {spot && (
                    <div className="ad-size">
                      <label className="sl-field">
                        Width
                        <span className="sl-input soft">
                          <input
                            inputMode="decimal"
                            value={size[0]}
                            onChange={(event) => setSize([event.target.value, size[1]])}
                          />
                        </span>
                      </label>
                      <label className="sl-field">
                        Height
                        <span className="sl-input soft">
                          <input
                            inputMode="decimal"
                            value={size[1]}
                            onChange={(event) => setSize([size[0], event.target.value])}
                          />
                        </span>
                      </label>
                      {spot.geo && (
                        <button
                          type="button"
                          className="sl-btn light"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () =>
                                saveSpotGeo(spot.id, {
                                  ...spot.geo!,
                                  size: [Number(size[0]) || SIZE, Number(size[1]) || SIZE],
                                }),
                              "Could not save the size.",
                            )
                          }
                        >
                          Apply size
                        </button>
                      )}
                    </div>
                  )}
                  {!allPlaced && (
                    <p className="muted">
                      Buyers see the model once every spot is on it. Until then the
                      auction shows the photo.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Цены продавца: резерв, шаг и сроки проверяем до одобрения. */}
          {!thing.house && thing.prices.length > 0 && (
            <div className="sl-card ad-card">
              <h3>Prices</h3>
              <ul className="ad-prices">
                {thing.spots.map((spot) => {
                  const price = thing.prices.find((one) => one.spotId === spot.id);
                  if (!price) return null;
                  return (
                    <li key={spot.id}>
                      <b>{spot.label}</b>
                      <span>
                        {formatUsd(price.reserveCents)} reserve · {formatUsd(price.stepCents)} step
                      </span>
                      <small>
                        {price.opensAt ? `${moment(price.opensAt)} - ` : "Until "}
                        {moment(price.closesAt)}
                      </small>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Подготовленная вещь: цены поставил админ, публикует продавец. */}
          {thing.prepared && !thing.published && thing.drafts.length > 0 && (
            <div className="sl-card ad-card">
              <h3>Prepared prices</h3>
              <p className="muted">
                The seller ({thing.sellerWallet ? shortWallet(thing.sellerWallet) : "no wallet"}) sees these and publishes
                from their wallet. Closes {new Date(thing.drafts[0]!.closesAt).toLocaleString()}.
              </p>
              <ul className="ad-prices">
                {thing.drafts.map((draft) => (
                  <li key={draft.id}>
                    {thing.spots.find((one) => one.id === draft.spotId)?.label ?? "Spot"} · from{" "}
                    {formatUsd(draft.reserveCents)} · step {formatUsd(draft.stepCents)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section id="adm-after" className="adm-section">
          <h2>After auction</h2>
          <p className="muted">Numbers for the auction page and the results page.</p>
          {thing.refunded && <p className="adm-warn">Refunded. Nothing to do here.</p>}

          {/* Охват - сколько людей увидели наши посты о торге: показы постов в X
              и просмотры эфиров. Сохранили - страница торга показывает «Who saw
              it» и цену тысячи показов; пока не внесён, охвата там нет. */}
          <div className="sl-card ad-card">
            <h3>Reach</h3>
            <p className="muted">
              Views of our posts about this auction: impressions from X analytics plus stream views. Shown on the
              auction page with the cost per 1,000 views.
            </p>
            <label className="sl-field">
              People who saw it
              <span className="sl-input soft">
                <input
                  inputMode="numeric"
                  value={reach}
                  placeholder={thing.reach && !thing.reachChecked ? `${thing.reach} (test estimate)` : "e.g. 12400"}
                  onChange={(event) => setReach(event.target.value.replace(/[^0-9]/g, ""))}
                />
              </span>
            </label>
            <button
              type="button"
              className="sl-btn light"
              disabled={busy || !reach || (thing.reachChecked && Number(reach) === thing.reach)}
              onClick={() =>
                run(
                  () =>
                    updateThing(thing.id, { post_reach: Number(reach), post_reach_checked_at: new Date().toISOString() }),
                  "Could not save the reach.",
                )
              }
            >
              Save reach
            </button>
          </div>

          {/* Фото итогов: вещь в деле для страницы итогов. Пока их нет, итоги
              говорят «preparing». Это не пруф защиты покупателя - тот шлёт
              продавец из кабинета в программу, и только он отпускает деньги. */}
          <div className="sl-card ad-card">
            <h3>Results photos · {thing.proof.length}</h3>
            <p className="muted">
              Shown on the results page. The proof that releases payment is sent by the seller from their cabinet.
            </p>
            {thing.proof.length > 0 ? (
              <div className="ad-photos">
                {thing.proof.map((path) => (
                  <span className="sl-photo ad-proof" key={path}>
                    <Media src={photoUrl(path)} />
                    <button
                      type="button"
                      className="ghost small"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => updateThing(thing.id, { proof_photos: thing.proof.filter((one) => one !== path) }),
                          "Could not remove it.",
                        )
                      }
                    >
                      Remove
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted">No photos yet. The results page says the thing is being prepared.</p>
            )}
            <label className="sl-btn light">
              {uploading ? "Uploading…" : "Add photos or videos"}
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                hidden
                disabled={busy}
                onChange={(event) => {
                  const files = [...(event.target.files ?? [])];
                  event.target.value = "";
                  if (!files.length) return;
                  setUploading(true);
                  void run(() => uploadProof(thing.id, files, thing.proof), "Upload failed. Each file must be under 50 MB.").finally(() =>
                    setUploading(false),
                  );
                }}
              />
            </label>
          </div>

          {/* Фото ставок: всё, что участники загрузили со ставками, - по любой
              вещи, нашей и продавца. */}
          <div className="sl-card ad-card">
            <h3>Bid photos</h3>
            <BidPhotos thingId={thing.id} title={thing.title} />
          </div>
        </section>

        <section id="adm-chain" className="adm-section">
          <h2>On-chain</h2>
          <p className="muted">Each needs a Phantom signature.</p>
          {!onChain && <p className="muted">Nothing on chain to set for this thing.</p>}

          {/* Подготовленная вещь без черновиков - её ещё не передали продавцу. */}
          {giveable(thing) && <GiveToSeller thing={thing} onDone={onChanged} />}

          {/* Режим выплаты пишется в цепочку при открытии торга: после
              публикации разрешение уже ничего не меняет. Выдаёт и отзывает его
              админ своей подписью в Phantom. */}
          {(!thing.published || thing.noLockup) && !giveable(thing) && (
            <div className="sl-card ad-card">
              <h3>Payout</h3>
              {thing.published ? (
                <p className="muted">No money lockup: the seller is paid at close, without proof.</p>
              ) : (
                <label className="ad-lockup">
                  <input
                    type="checkbox"
                    checked={thing.noLockup}
                    disabled={busy || (!thing.noLockup && !thing.sellerWallet)}
                    onChange={async (event) => {
                      const grant = event.target.checked;
                      setBusy(true);
                      setError("");
                      const done = grant ? await grantPermit(thing) : await dropPermit(thing);
                      setBusy(false);
                      if (!done.ok) setError(done.why);
                      onChanged();
                    }}
                  />
                  No money lockup: the seller is paid at close, without proof. Signed in Phantom.
                </label>
              )}
              {!thing.published && !thing.sellerWallet && !thing.noLockup && (
                <p className="muted">The seller has no wallet on this thing yet.</p>
              )}
            </div>
          )}

          {/* Стикеры - не торг: цена одна, лимит и деление денег держит лист в
              цепочке. Заводит его админ своей подписью в Phantom. */}
          {(thing.stickerSheet || thing.sellerWallet) && !giveable(thing) && (
            <div className="sl-card ad-card">
              <h3>Stickers</h3>
              {thing.stickerSheet ? (
                <p className="muted">Stickers are on sale. Sheet {thing.stickerSheet}.</p>
              ) : (
                <>
                  <p className="muted">
                    Fixed price, no outbid. The seller&apos;s wallet gets the price minus the platform fee at once. Price and count
                    cannot change once the sheet is on chain.
                  </p>
                  <label className="sl-field">
                    Price, USDC
                    <span className="sl-input soft">
                      <input
                        inputMode="decimal"
                        value={stickers.price}
                        onChange={(event) => setStickers({ ...stickers, price: event.target.value })}
                      />
                    </span>
                  </label>
                  <label className="sl-field">
                    How many
                    <span className="sl-input soft">
                      <input
                        inputMode="numeric"
                        value={stickers.count}
                        onChange={(event) => setStickers({ ...stickers, count: event.target.value })}
                      />
                    </span>
                  </label>
                  <button
                    type="button"
                    className="sl-btn dark"
                    disabled={busy}
                    onClick={async () => {
                      const price = parseUsd(stickers.price);
                      const count = Number(stickers.count);
                      if (!price || !Number.isInteger(count) || count < 1 || count > 1000) {
                        return setError("Stickers need a price and a whole number from 1 to 1000.");
                      }
                      setBusy(true);
                      setError("");
                      const done = await openStickers(thing, price, count);
                      setBusy(false);
                      if (!done.ok) setError(done.why);
                      onChanged();
                    }}
                  >
                    Open stickers. Signed in Phantom.
                  </button>
                </>
              )}
            </div>
          )}

          {/* Срок пруфа: отодвинуть, если событие сдвинулось. Сам перенос -
              тот же, что в списке споров. */}
          {waiting.map((one) => (
            <MoveCard key={one.sale.toBase58()} sale={one} onDone={reloadWaiting} />
          ))}
        </section>

        {error && <p className="bad adm-error">{error}</p>}
      </div>
    </div>
  );
}

/**
 * Пропорции места на модели - по прямоугольнику продавца на снимке. Снимок
 * 4:5, поэтому доли сторон переводим в настоящие пропорции.
 */
function sizeOf(spot: AdminThing["spots"][number] | null): [string, string] {
  if (spot?.geo) return [String(spot.geo.size[0]), String(spot.geo.size[1])];
  if (!spot?.rect) return [String(SIZE), String(SIZE)];
  const aspect = (spot.rect.w * 4) / (spot.rect.h * 5);
  return aspect >= 1
    ? [String(SIZE), String(round(SIZE / aspect))]
    : [String(round(SIZE * aspect)), String(SIZE)];
}

function emptyShape(model: string) {
  return { model, spots: [], depth: 0.05, cloth: false, noun: "thing" };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Снимок крупно: с разметкой мест или без - по ней и по голому кадру
 * собирают 3D-модель. «Original» открывает сам файл, его и сохраняют.
 */
function PhotoViewer({
  thing,
  at,
  onAt,
  onClose,
}: {
  thing: AdminThing;
  at: number;
  onAt: (at: number) => void;
  onClose: () => void;
}) {
  const [marks, setMarks] = useState(true);
  const count = thing.photos.length;
  return (
    <div className="reviews-dim" onClick={onClose}>
      <div className="ad-viewer" role="dialog" aria-label="Photo" onClick={(event) => event.stopPropagation()}>
        <div className="ad-viewer-bar">
          <div className="role-toggle slim">
            {([true, false] as const).map((one) => (
              <button
                key={String(one)}
                type="button"
                className={marks === one ? "role-tab on" : "role-tab"}
                onClick={() => setMarks(one)}
              >
                {one ? "With spots" : "Clean"}
              </button>
            ))}
          </div>
          {/* Оригинал и есть «Clean»: отдельная кнопка повторяла бы переключатель. */}
          <button type="button" className="sl-pill" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="sl-photo ad-viewer-photo">
          <img src={thing.photos[at]} alt="" />
          {marks &&
            thing.spots.map((one, index) =>
              one.rect && one.photo === at ? (
                <SpotMark key={one.id} rect={one.rect} outline={one.outline} number={index + 1} />
              ) : null,
            )}
        </div>
        {count > 1 && (
          <div className="ad-viewer-nav">
            <button type="button" className="sl-pill" onClick={() => onAt((at - 1 + count) % count)}>
              &larr; Prev
            </button>
            <span className="muted">
              {at + 1} of {count}
            </span>
            <button type="button" className="sl-pill" onClick={() => onAt((at + 1) % count)}>
              Next &rarr;
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** «Oct 2, 12:00» - время торга в часах админа. */
function moment(at: string): string {
  return new Date(at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

/** «Oct 2» - день в списке. */
function day(at: string): string {
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** «18K» - охват в списке вещей. */
function seen(reach: number): string {
  return reach >= 1000 ? `${Math.round(reach / 1000)}K` : String(reach);
}
