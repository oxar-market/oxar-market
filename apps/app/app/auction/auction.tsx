"use client";

import { useEffect, useRef, useState } from "react";
import { avatarTone, formatUsd, isOpen, minBidCents } from "@oxar/core";
import {
  loadBids,
  loadThing,
  loadTopBids,
  shortWallet,
  type Bid,
  type Lot,
  type Thing,
} from "@/lib/auction";
import { BidForm } from "./bid.tsx";
import { SPOTS } from "./spots.ts";
import { ThingStage, type Stage } from "./stage.tsx";

/**
 * Экран торга: одна вещь, её места, ставки.
 *
 * Выбранное место всегда одно - оно горит на вещи, его ставки слева, его
 * состояние в строке под сценой. Место выбирают тремя дорогами: кликом по
 * самой вещи, строкой в списке справа и вкладкой Spots. Все три ведут в одно и
 * то же состояние, и вещь доворачивается к выбранному сама.
 *
 * Ставка живёт отдельным куском ниже строки состояния: она про одно место -
 * то же, что выбрано, - и появляется только у места, торг которого идёт.
 */

/** Ракурсы предметной съёмки. Отсчёт - от главной грани вещи. */
const ANGLES = ["Front", "Right", "Back", "Left"];

export function Auction() {
  const [thing, setThing] = useState<Thing | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [picked, setPicked] = useState(SPOTS[0].code);
  const [bids, setBids] = useState<Bid[]>([]);
  const [tops, setTops] = useState<Record<string, Bid | undefined>>({});
  const [angle, setAngle] = useState(0);
  const [tab, setTab] = useState<"about" | "spots" | "rules">("about");
  const [sceneReady, setSceneReady] = useState(false);
  // Какая ставка отматана в истории. null - показываем нынешнюю, ту, что стоит
  // на вещи прямо сейчас.
  const [rewound, setRewound] = useState<string | null>(null);

  // Что человек примерил в каждое место. Живёт только здесь: на сервер эти
  // картинки не уезжают, чужим они станут видны вместе со ставкой. Файл лежит
  // рядом с адресом превью - его и отправит ставка, когда до неё дойдёт.
  const [art, setArt] = useState<Record<string, { url: string; file: File }>>({});
  const [artError, setArtError] = useState("");

  const stage = useRef<Stage | null>(null);
  // Пока человек ничего не трогал, выбор по умолчанию можно передвинуть на
  // первое место с торгом. После первого клика - нельзя: это уже его выбор.
  const touched = useRef(false);

  useEffect(() => {
    let live = true;
    loadThing().then((loaded) => {
      // Вещи может не быть вовсе - тогда экран показывает саму футболку и её
      // места, без торгов. Разметка живёт в коде, и она никуда не девается.
      if (!live || !loaded) return;
      setThing(loaded.thing);
      setLots(loaded.lots);
    });
    return () => {
      live = false;
    };
  }, []);

  const lotOf = (code: string) => lots.find((lot) => lot.spot_code === code) ?? null;
  const lot = lotOf(picked);

  // Лоты доехали, человек ещё ничего не выбирал - встаём на первое место с
  // торгом: пустое место в роли выбранного делает экран немым.
  useEffect(() => {
    if (touched.current || lots.length === 0) return;
    const spot = SPOTS.find((candidate) => lotOf(candidate.code));
    if (spot) choose(spot.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lots]);

  useEffect(() => {
    if (!lot) {
      setBids([]);
      return;
    }
    let live = true;
    loadBids(lot.id).then((rows) => live && setBids(rows));
    return () => {
      live = false;
    };
  }, [lot?.id]);

  useEffect(() => {
    if (lots.length === 0) return;
    let live = true;
    loadTopBids(lots.map((one) => one.id)).then((rows) => live && setTops(rows));
    return () => {
      live = false;
    };
  }, [lots]);

  /** Выбрать место: подсветить на вещи, довернуть её и запомнить ракурс. */
  function choose(code: string, byHand = false) {
    if (byHand) touched.current = true;
    const spot = SPOTS.find((one) => one.code === code);
    if (!spot) return;
    setPicked(code);
    stage.current?.face(spot.azimuth);
    setAngle(((Math.round(spot.azimuth / 90) % 4) + 4) % 4);
  }

  /**
   * Что стоит на вещи сейчас: креатив верхней ставки каждого места.
   *
   * Это видят все, и в этом смысл торга - зашедший должен увидеть чужой
   * логотип на футболке и понять, что его можно перебить. Своя примерка
   * главнее: если человек что-то приложил, он смотрит на своё.
   */
  useEffect(() => {
    if (!sceneReady) return;
    let live = true;

    for (const spot of SPOTS) {
      if (art[spot.code]) continue;
      const each = lotOf(spot.code);
      const holder = each ? tops[each.id] : undefined;
      // Отмотанная ставка показывается только в выбранном месте: история
      // читается про одно место, а не про всю вещь разом.
      const rewoundBid =
        spot.code === picked && rewound
          ? bids.find((bid) => bid.id === rewound)
          : undefined;
      const show = rewoundBid ?? holder;

      if (!show) {
        stage.current?.show(spot.code, null);
        continue;
      }
      loadImage(show.media_url).then((image) => {
        if (live && image) stage.current?.show(spot.code, image);
      });
    }

    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneReady, lots, tops, bids, rewound, picked, art]);

  // Смена места закрывает историю: она про то место, с которого ушли.
  useEffect(() => setRewound(null), [picked]);

  /** Примерить картинку в выбранное место. */
  async function tryOn(file: File | undefined) {
    setArtError("");
    if (!file) return;
    // Восемь мегабайт - это уже фотография, а не логотип. Рисовать её в
    // текстуру можно, но телефон на этом подвиснет.
    if (file.size > 8 * 1024 * 1024) {
      setArtError("That file is over 8 MB. A logo should be far smaller.");
      return;
    }

    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      URL.revokeObjectURL(url);
      setArtError("Could not read that image. PNG, JPEG, WebP or SVG.");
      return;
    }

    stage.current?.show(picked, image);
    setArt((was) => {
      const old = was[picked];
      if (old) URL.revokeObjectURL(old.url);
      return { ...was, [picked]: { url, file } };
    });
  }

  /** Снять примеренное: место снова показывает пустую рамку. */
  function takeOff() {
    stage.current?.show(picked, null);
    setArt((was) => {
      const old = was[picked];
      if (old) URL.revokeObjectURL(old.url);
      const next = { ...was };
      delete next[picked];
      return next;
    });
  }

  /** Перечитать ставки после своей: и ленту места, и кружки всех мест. */
  function refresh() {
    if (lot) loadBids(lot.id).then(setBids);
    loadTopBids(lots.map((one) => one.id)).then(setTops);
  }

  const top = bids[0] ?? null;
  const need = lot ? minBidCents(lot.reserve_cents, top?.amount_cents ?? null) : 0;
  const running = lot ? isOpen(Date.parse(lot.closes_at), Date.now()) : false;

  return (
    <section className="lot">
      <header className="lot-top">
        <p className="over">{thing?.tagline ?? "Superteam Ukraine"}</p>
        <h1>{thing?.title ?? "Local Event Tee"}</h1>
      </header>

      <div className="lot-scene">
        <ThingStage
          picked={picked}
          onPick={(code) => choose(code, true)}
          stage={stage}
          onReady={() => setSceneReady(true)}
        />

        {/* Слева от вещи - ставки выбранного места, верхняя первой: она и есть
            текущая цена. На телефоне дуг нет, там их заменяет список ниже. */}
        <div className="arc left" aria-hidden={bids.length === 0}>
          {bids.slice(0, 4).map((bid, index) => (
            <Row key={bid.id} bid={bid} lead={index === 0} />
          ))}
        </div>

        {/* Справа - все места вещи. Выбранное подсвечено, в кружке - первая
            буква кошелька того, кто сейчас держит место. */}
        <div className="arc right" role="group" aria-label="Ad spots">
          {SPOTS.map((spot) => {
            const each = lotOf(spot.code);
            const holder = each ? tops[each.id] : undefined;
            return (
              <button
                key={spot.code}
                type="button"
                className={spot.code === picked ? "spot on" : "spot"}
                aria-pressed={spot.code === picked}
                onClick={() => choose(spot.code, true)}
              >
                <span
                  className={holder ? "spot-dot taken" : each ? "spot-dot live" : "spot-dot"}
                  style={holder ? { background: avatarTone(holder.bidder_wallet) } : undefined}
                  aria-hidden
                >
                  {holder ? holder.bidder_wallet[0]?.toUpperCase() : each ? "$" : ""}
                </span>
                <span className="spot-text">{spot.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Состояние выбранного места одной строкой: что это, почём и сколько
          осталось. Это же место - предмет ставки, когда она появится. */}
      <p className="lot-state">
        <strong>{SPOTS.find((spot) => spot.code === picked)?.label}</strong>
        {lot ? (
          running ? (
            <>
              {" · "}
              {top ? `top ${formatUsd(top.amount_cents)}` : `reserve ${formatUsd(lot.reserve_cents)}`}
              {" · next "}
              {formatUsd(need)}
              {" · "}
              {left(lot.closes_at)}
            </>
          ) : (
            " · bidding has closed"
          )
        ) : (
          " · not up for auction yet"
        )}
      </p>

      {/* Ставка - про выбранное место, и только пока его торг идёт. У места без
          торга её нет вовсе: кнопка, которой некуда нажать, хуже её отсутствия. */}
      {lot && running && (
        <BidForm lot={lot} need={need} art={art[picked]} onPlaced={refresh} />
      )}

      {/* История места: каждая ставка - деление на ленте, и по ней видно, чей
          логотип стоял на вещи в этот момент. Свежая справа, как в переписке.
          Лента появляется со второй ставкой: у одной истории нет. */}
      {bids.length > 1 && (
        <ol className="track" aria-label="Bid history">
          {[...bids].reverse().map((bid, index) => (
            <li key={bid.id}>
              <button
                type="button"
                className={bid.id === rewound ? "tick on" : "tick"}
                aria-pressed={bid.id === rewound}
                onClick={() => setRewound(bid.id === rewound ? null : bid.id)}
              >
                <span className="tick-sum">{formatUsd(bid.amount_cents)}</span>
                <span className="tick-when">
                  {index === 0 ? "opened" : when(bid.created_at)}
                </span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              className={rewound ? "tick" : "tick on"}
              aria-pressed={!rewound}
              onClick={() => setRewound(null)}
            >
              <span className="tick-sum">Now</span>
              <span className="tick-when">on the shirt</span>
            </button>
          </li>
        </ol>
      )}
      {rewound && (
        <p className="muted">
          Rewound. This is what the shirt looked like at that bid, not now.
        </p>
      )}

      {/* Примерка: картинка ложится в выбранное место прямо на вещи. Пока это
          только превью - видит его один человек, тот, кто примеряет. */}
      <div className="tryon">
        <label className="ghost small">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={(event) => {
              void tryOn(event.target.files?.[0]);
              // Сбрасываем поле: иначе тот же файл второй раз не выберется.
              event.target.value = "";
            }}
          />
          {art[picked] ? "Change the artwork" : "Try your artwork here"}
        </label>
        {art[picked] && (
          <button type="button" className="quiet" onClick={takeOff}>
            Remove
          </button>
        )}
      </div>
      {artError ? (
        <p className="bad">{artError}</p>
      ) : (
        art[picked] && (
          <p className="muted">
            Only you can see this. It goes public when you bid with it.
          </p>
        )
      )}

      <div className="angles" role="group" aria-label="View">
        {ANGLES.map((name, index) => (
          <button
            key={name}
            type="button"
            className={index === angle ? "angle on" : "angle"}
            aria-pressed={index === angle}
            onClick={() => {
              setAngle(index);
              stage.current?.face(index * 90);
            }}
          >
            {name}
          </button>
        ))}
      </div>

      <nav className="lot-tabs">
        {(["about", "spots", "rules"] as const).map((name) => (
          <button
            key={name}
            type="button"
            className={tab === name ? "lot-tab on" : "lot-tab"}
            onClick={() => setTab(name)}
          >
            {name === "about" ? "About" : name === "spots" ? "Spots" : "Rules"}
          </button>
        ))}
      </nav>

      {tab === "about" && (
        <p className="muted">
          A shirt worn at a Superteam Ukraine event. Every marked area on it is a
          spot you can rent: the highest bid when the clock runs out is what gets
          printed, and the shirt is worn as printed.
        </p>
      )}

      {tab === "spots" && (
        <div className="rows">
          {SPOTS.map((spot) => {
            const each = lotOf(spot.code);
            const holder = each ? tops[each.id] : undefined;
            return (
              <button
                key={spot.code}
                type="button"
                className="row"
                onClick={() => choose(spot.code, true)}
              >
                <span>{spot.label}</span>
                <span className={each ? "row-price" : "row-price off"}>
                  {each
                    ? holder
                      ? `top bid ${formatUsd(holder.amount_cents)}`
                      : `bidding from ${formatUsd(each.reserve_cents)}`
                    : "not for sale yet"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {tab === "rules" && (
        <ul className="rules">
          <li>The highest bid when the clock runs out wins the spot.</li>
          <li>
            A bid cannot be taken back. Each new bid has to beat the current one
            by the step shown on the spot.
          </li>
          <li>
            A bid in the last minutes pushes the close forward, so a late bid
            cannot win by timing alone.
          </li>
          <li>
            Your artwork goes in with your bid. If you win, that is exactly what
            gets printed.
          </li>
        </ul>
      )}

      {/* На телефоне дуг нет, и ставки выбранного места живут здесь. */}
      {bids.length > 0 && (
        <div className="lot-bids">
          {bids.slice(0, 4).map((bid, index) => (
            <Row key={bid.id} bid={bid} lead={index === 0} />
          ))}
        </div>
      )}
    </section>
  );
}

function Row({ bid, lead }: { bid: Bid; lead: boolean }) {
  return (
    <div className={lead ? "bid lead" : "bid"}>
      <span
        className="bid-ava"
        style={lead ? undefined : { background: avatarTone(bid.bidder_wallet) }}
        aria-hidden
      >
        {bid.bidder_wallet[0]?.toUpperCase()}
      </span>
      <span className="bid-text">
        {formatUsd(bid.amount_cents)}
        <em>{shortWallet(bid.bidder_wallet)}</em>
      </span>
    </div>
  );
}

/**
 * Загрузить чужую картинку так, чтобы её можно было положить в текстуру.
 *
 * `crossOrigin` обязателен: без него картинка с другого домена «пачкает»
 * холст, и WebGL отказывается брать из него текстуру - молча, целым чёрным
 * пятном вместо логотипа.
 */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    // Картинка могла уехать вместе с хранилищем или прийти битой. Место
    // останется пустой рамкой, и это лучше, чем пустой экран.
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/** Когда была ставка: день и час, без года - торг короче года. */
function when(at: string): string {
  return new Date(at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Сколько осталось до закрытия, крупными делениями: дни, часы, минуты. */
function left(closesAt: string): string {
  const ms = Date.parse(closesAt) - Date.now();
  if (ms <= 0) return "closed";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h left`;
  return `${Math.floor(hours / 24)}d left`;
}
