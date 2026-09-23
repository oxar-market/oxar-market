"use client";

import { useEffect, useRef, useState } from "react";
import {
  avatarTone,
  escrowedCents,
  formatUsd,
  hasOpened,
  isOpen,
  minBidCents,
} from "@oxar/core";
import {
  loadBids,
  loadThing,
  loadTopBids,
  type Bid,
  type Lot,
  type Thing,
} from "@/lib/auction";
import { BidForm } from "./bid.tsx";
import { PhotoView } from "./photo.tsx";
// TEMP_FRONT: временный замер на чужом снимке. Подробности и список того, что
// надо удалить, - в шапке temp-photo.ts.
import { TEMP_ANGLES, TEMP_FRONT_QUADS, TEMP_SHOTS } from "./temp-photo.ts";
import { SPOTS } from "./spots.ts";
import { ThingStage, type Stage, type Views } from "./stage.tsx";

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
  // Снимки вещи по ракурсам. Их делает сама сцена, когда соберётся.
  const [views, setViews] = useState<Views>({ shots: [], quads: [] });
  // Чем смотреть вещь: сценой, которую можно вертеть, или кадром, который
  // подробнее. Выбор человека, а не наш: одному важно покрутить, другому -
  // разглядеть.
  // Первый кадр - голограмма, и это не вкусовщина: пока лоты не доехали, мы
  // не знаем, начался ли торг, а показать вещь и отнять её через секунду хуже,
  // чем показать голограмму и раскрыть вещь.
  const [look, setLook] = useState<"live" | "ghost" | "shot">("ghost");
  // Какая ставка отматана в истории. null - показываем нынешнюю, ту, что стоит
  // на вещи прямо сейчас.
  const [rewound, setRewound] = useState<string | null>(null);
  // Часы экрана. Отдельным состоянием, потому что до открытия торга страница
  // обязана ожить сама, без обновления руками.
  const [now, setNow] = useState(() => Date.now());

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

  /**
   * Когда торг начинается - и начался ли.
   *
   * Срок общий на всю вещь, а не на место: места одной футболки уходят с
   * торгов вместе. Поэтому берём самый ранний из сроков её лотов, а стоит
   * хоть одному лоту быть без срока - считаем, что торг уже идёт.
   */
  const waiting = lots.filter((one) => one.opens_at !== null);
  const startsAt =
    lots.length > 0 && waiting.length === lots.length
      ? Math.min(...waiting.map((one) => Date.parse(one.opens_at as string)))
      : null;
  const started = hasOpened(startsAt, now);

  // Секундная стрелка идёт всегда: и до открытия, и во время торга. Раньше она
  // останавливалась после старта, потому что менять на экране было нечего -
  // теперь наверху висят часы до конца торга, и они обязаны идти на глазах.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  // До открытия вещь показывается голограммой, и выбора тут нет: смотреть
  // нечего, торг ещё не начался. В назначенную минуту голограмма сама
  // сменяется сценой - дождавшийся не должен ещё и искать, куда нажать.
  useEffect(() => {
    // Пока лоты не доехали, про торг ничего не известно - остаёмся на
    // голограмме.
    if (lots.length === 0) return;
    setLook((was) => (started ? (was === "ghost" ? "live" : was) : "ghost"));
  }, [started, lots.length]);

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
    // Вещь встаёт той гранью, на которой место, а не точно под его угол. Угол
    // у места двойной службы - он же сдвиг вбок внутри грани, - и доворот под
    // него качал бы футболку на каждый выбор соседней клетки сетки.
    const face = ((Math.round(spot.azimuth / 90) % 4) + 4) % 4;
    stage.current?.face(face * 90);
    setAngle(face);
    // Подъезжаем только к тому месту, которое выбрали руками. Первое место
    // экран выбирает за человека, пока лоты доезжают, и въехать вплотную в
    // чужой выбор - значит начать разговор с того, что его уже куда-то завели.
    if (byHand) stage.current?.frame(code);
  }

  /**
   * Что стоит на вещи сейчас: креатив верхней ставки каждого места.
   *
   * Это видят все, и в этом смысл торга - зашедший должен увидеть чужой
   * логотип на футболке и понять, что его можно перебить. Своя примерка
   * главнее: если человек что-то приложил, он смотрит на своё.
   */
  // Прогреваем загрузку креативов, как только пришли верхние ставки, не дожидаясь
  // сцены: пока она собирается (модель, декали - это секунды), картинки успевают
  // загрузиться в кэш, и к готовности сцены логотипы встают сразу, а не всплывают
  // потом. Сборку сцены это не ждёт и не задерживает.
  useEffect(() => {
    for (const each of lots) {
      const holder = tops[each.id];
      if (holder) void loadImage(holder.media_url);
    }
  }, [lots, tops]);

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

  // Ткань или голограмма. Сцену не пересобираем - меняется только материал,
  // поэтому переключение мгновенное и вещь не перезагружается.
  useEffect(() => {
    stage.current?.look(look === "ghost" ? "ghost" : "cloth");
  }, [look, sceneReady]);

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

  /** Что стоит в каждом месте: своя примерка главнее чужого креатива. */
  const shownArt: Record<string, string | undefined> = {};
  for (const spot of SPOTS) {
    const each = lotOf(spot.code);
    shownArt[spot.code] =
      art[spot.code]?.url ?? (each ? tops[each.id]?.media_url : undefined);
  }

  const top = bids[0] ?? null;
  const need = lot ? minBidCents(lot.reserve_cents, top?.amount_cents ?? null) : 0;
  const running = lot ? started && isOpen(Date.parse(lot.closes_at), now) : false;

  // Сколько денег торг держит прямо сейчас - по всей вещи, а не по выбранному
  // месту. Считается по тем же верхним ставкам, что и кружки в списке справа:
  // база тут витрина цепочки, и расходиться этим числам нельзя.
  const escrowed = escrowedCents(
    lots.map((one) => tops[one.id]?.amount_cents ?? null),
  );

  // Конец торга - свойство вещи, а не места: у всех её мест он один и тот же,
  // поэтому берём его у любого. Самый поздний из них на случай, если строка
  // какого-то места отстала от цепочки: часы не должны обещать конец раньше,
  // чем он есть.
  const closesAt = lots.length
    ? Math.max(...lots.map((one) => Date.parse(one.closes_at)))
    : null;
  // Последние пять минут - то самое окно, в котором ставка двигает конец всей
  // вещи. Его и подсвечиваем: там решается торг.
  const endingSoon =
    closesAt !== null && closesAt - now > 0 && closesAt - now <= 5 * 60_000;

  return (
    <section className="lot">
      <header className="lot-top">
        <p className="over">{thing?.tagline ?? "Superteam Ukraine"}</p>
        <h1>{thing?.title ?? "Local Event Tee"}</h1>

        {/* Сколько денег стоит на кону по всей вещи. Это ровно то, что лежит
            в хранилищах программы: перебитые ставки уже вернулись хозяевам,
            складывать их с этой суммой значило бы назвать деньги, которых нет.

            «Bid so far», а не «collected»: деньги ещё никто не собрал, они
            заперты в торге и вернутся всем, кого перебьют. Слово про сбор
            обещало бы, что они уже чьи-то.

            Пока не поставили ни разу, строки нет вовсе: «$0» над живым торгом
            читается как «сюда никто не пришёл». */}
        {escrowed > 0 && (
          <p className="lot-pot">
            <strong>{formatUsd(escrowed)}</strong> bid so far
          </p>
        )}

        {/* Часы всей вещи, а не выбранного места: торг идёт за футболку
            целиком, и конец у её мест один. Поэтому они здесь, под именем
            вещи, а не в строке места - там они говорили бы про одно место и
            путали бы.

            По секундам, потому что последние минуты и есть весь смысл:
            ставка под конец двигает конец всем местам, и видеть, сколько
            осталось, нужно точно. */}
        {started && closesAt !== null && (
          <p className={endingSoon ? "lot-clock soon" : "lot-clock"}>
            {countdown(closesAt, now)}
          </p>
        )}
      </header>

      <div className="lot-scene">
        {/* Сцена остаётся собранной и в фото-режиме, просто спрятана: она
            держит модель и все пятнадцать декалей, и пересобирать её на
            каждое переключение значило бы грузить вещь заново. */}
        <div className={look === "shot" ? "look away" : "look"}>
        <ThingStage
          picked={picked}
          onPick={(code) => choose(code, true)}
          stage={stage}
          onReady={(ready) => {
            setSceneReady(true);
            setViews(ready);
          }}
        />
        </div>

        {look === "shot" && views.shots[angle] && (
          // TEMP_FRONT: перёд показываем чужой фотографией, остальные ракурсы
          // своим рендером. Так видно разницу между ними - ради чего замер и
          // затеян. Удаляется вместе с temp-photo.ts.
          <PhotoView
            shot={TEMP_SHOTS[angle] ?? views.shots[angle]}
            quads={angle === 0 ? TEMP_FRONT_QUADS : {}}
            drawFrames={TEMP_SHOTS[angle] !== undefined}
            picked={picked}
            onPick={(code) => choose(code, true)}
            art={shownArt}
          />
        )}

        {/* Слева от вещи - ставки выбранного места, верхняя первой: она и есть
            текущая цена. На телефоне дуг нет, там их заменяет список ниже. */}
        <div
          className={look === "ghost" ? "arc left away" : "arc left"}
          aria-hidden={look === "ghost" || bids.length === 0}
        >
          {bids.slice(0, 4).map((bid, index) => (
            <Row key={bid.id} bid={bid} lead={index === 0} />
          ))}
        </div>

        {/* Справа - все места вещи. На голограмме списка нет: выбирать пока
            нечего, и список, который ни на что не показывает, только врёт. Выбранное подсвечено, в кружке - первая
            буква имени того, чьё лого сейчас держит место. */}
        <div
          className={look === "ghost" ? "arc right away" : "arc right"}
          role="group"
          aria-label="Ad spots"
        >
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
                  {holder ? holder.brand[0]?.toUpperCase() : each ? "$" : ""}
                </span>
                <span className="spot-text">{spot.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Ракурсы - самой вещью, а не словами: снимок отвечает на «с какой
          стороны смотрим» быстрее, чем слово «Back». Пока сцена не собралась
          (или её нет вовсе), остаются подписи - кнопка обязана работать и без
          картинки. */}
      {/* Чем смотреть вещь. Кадр подробнее сцены - он снят с запасом и без
          оглядки на скорость, - но вертеть его нельзя, ракурсов четыре.

          До открытия торга выбора нет вовсе: вещь показывается голограммой, и
          кнопка «посмотреть по-настоящему» обещала бы то, чего ещё нет.
          После открытия голограмма возвращается третьей кнопкой: она осталась
          тем, чем вещь выглядит до торга, и показывать её надо уметь в любой
          момент, а не только пока торг не начался. Мест на ней нет и там -
          обводить то, что уже продаётся, значило бы показывать торг дважды. */}
      {started && (
      <>
      <div className="looks" role="group" aria-label="How to view">
        {/* Голограммы среди видов нет: это не ракурс, а состояние «торг ещё
            не начался», и в него не переключаются - в нём ждут. До старта
            экран сам стоит в ней, после старта её выбирать незачем. */}
        {([
          ["live", "Shirt"],
          ["shot", "Photo"],
        ] as const).map(([which, name]) => (
          <button
            key={which}
            type="button"
            className={look === which ? "look-tab on" : "look-tab"}
            aria-pressed={look === which}
            disabled={which === "shot" && views.shots.length === 0}
            onClick={() => {
              setLook(which);
              // TEMP_FRONT: в фото-режиме боков нет. Пришли с бокового
              // ракурса - разворачиваем на перёд, иначе экран пуст.
              if (which === "shot" && !TEMP_ANGLES.includes(angle)) {
                setAngle(0);
                stage.current?.face(0);
              }
            }}
          >
            {name}
          </button>
        ))}
      </div>

      {/* TEMP_FRONT: в фото-режиме ракурсов два, по числу снимков. */}
      <div className="angles" role="group" aria-label="View">
        {(look === "shot" ? TEMP_ANGLES : ANGLES.map((_, at) => at)).map((index) => {
          const name = ANGLES[index];
          const thumb =
            look === "shot" ? TEMP_SHOTS[index] : views.shots[index];
          return (
          <button
            key={name}
            type="button"
            className={index === angle ? "angle on" : "angle"}
            aria-pressed={index === angle}
            aria-label={name}
            title={name}
            onClick={() => {
              setAngle(index);
              stage.current?.face(index * 90);
              // Ракурс - про вещь целиком, поэтому он же и есть выход из
              // приближения: иначе, подъехав к месту, отъехать было бы нечем,
              // кроме колеса, которого на телефоне нет.
              stage.current?.frame(null);
            }}
          >
            {thumb ? <img src={thumb} alt="" /> : name}
          </button>
          );
        })}
      </div>
      </>
      )}

      {/* Состояние выбранного места одной строкой: что это и почём. Срока
          здесь больше нет - он общий на всю вещь и висит часами наверху, а
          повторять его у каждого места значило бы обещать, будто у них сроки
          разные. */}
      {!started ? (
        <p className="lot-state">
          <strong>Bidding opens in {until(startsAt as number, now)}</strong>
          {` · ${lots.length} ${lots.length === 1 ? "spot" : "spots"} on this shirt`}
          {lots.length > 0 &&
            ` · from ${formatUsd(Math.min(...lots.map((one) => one.reserve_cents)))}`}
        </p>
      ) : (
      <p className="lot-state">
        <strong>{SPOTS.find((spot) => spot.code === picked)?.label}</strong>
        {lot ? (
          running ? (
            <>
              {" · "}
              {top ? `top ${formatUsd(top.amount_cents)}` : `reserve ${formatUsd(lot.reserve_cents)}`}
              {" · next "}
              {formatUsd(need)}
            </>
          ) : (
            " · bidding has closed"
          )
        ) : (
          " · not up for auction yet"
        )}
      </p>
      )}

      {/* Картинка - первый шаг ставки, а не украшение рядом с ней: без неё
          ставка не уйдёт, печатать было бы нечего. Поэтому она стоит выше
          суммы и до примерки выглядит незакрытым шагом - пунктиром и словом
          «required», а не тихой кнопкой, которую можно пройти мимо.

          На голограмме шага нет: примерять некуда, пока мест не показывают.
          Пока это только превью - видит его один человек, тот, кто примеряет. */}
      <div className={look === "ghost" ? "tryon away" : "tryon"}>
        <label className={art[picked] ? "art-step done" : "art-step"}>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={(event) => {
              void tryOn(event.target.files?.[0]);
              // Сбрасываем поле: иначе тот же файл второй раз не выберется.
              event.target.value = "";
            }}
          />
          {art[picked] ? (
            <img className="art-thumb" src={art[picked].url} alt="" />
          ) : (
            <span className="art-thumb empty" aria-hidden>
              +
            </span>
          )}
          <span className="art-text">
            <strong>
              {art[picked] ? "Your artwork is on the shirt" : "Add your artwork"}
            </strong>
            {/* Про чёрно-белое сказано здесь, а не плашкой ниже: это условие
                к файлу, и читать его надо там, где файл выбирают. Цветной
                логотип выясняется на ткани, когда печатать уже поздно. */}
            <em>
              {art[picked]
                ? "Tap to swap it - black and white prints best"
                : "Required, black and white - fabric takes flat ink"}
            </em>
          </span>
        </label>
        {/* Корзина, а не слово: рядом с полем стоит действие над тем, что в
            поле лежит, и словом оно занимало места больше, чем значит. */}
        {art[picked] && (
          <button
            type="button"
            className="art-clear"
            onClick={takeOff}
            aria-label="Remove artwork"
          >
            <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden>
              <path
                d="M4.5 6.75h15M9.75 6.75V4.5h4.5v2.25M6.75 6.75l.9 12.75h8.7l.9-12.75M10.25 10v6M13.75 10v6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
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

      {/* Ставка - про выбранное место, и только пока его торг идёт. У места без
          торга её нет вовсе: кнопка, которой некуда нажать, хуже её отсутствия.
          На голограмме её тоже нет: торг там ещё не начался. */}
      {lot && running && look !== "ghost" && (
        <BidForm lot={lot} need={need} art={art[picked]} onPlaced={refresh} />
      )}

      {/* История места: каждое деление - ставка, и в нём стоит сам логотип,
          который в тот момент был на вещи. Без картинки лента отвечала бы
          только «сколько и когда», а главный вопрос к истории торга - что на
          футболке стояло. Свежая справа, как в переписке. Лента появляется со
          второй ставкой: у одной истории нет. */}
      {bids.length > 1 && (
        <div className="track-wrap">
          {/* Без подписи лента читалась набором цифр: непонятно, что это
              история и что деления нажимаются. Заголовок называет её, подпись
              зовёт перемотать. */}
          <p className="list-head">
            Bid history <span>tap a bid to see it on the shirt</span>
          </p>
        <ol className="track" aria-label="Bid history">
          {[...bids].reverse().map((bid, index) => (
            <li key={bid.id}>
              <button
                type="button"
                className={bid.id === rewound ? "tick on" : "tick"}
                aria-pressed={bid.id === rewound}
                onClick={() => setRewound(bid.id === rewound ? null : bid.id)}
              >
                <img className="tick-art" src={bid.media_url} alt="" />
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
              {/* Верхняя ставка и есть то, что стоит на вещи сейчас. */}
              <img className="tick-art" src={bids[0].media_url} alt="" />
              <span className="tick-sum">Now</span>
              <span className="tick-when">on the shirt</span>
            </button>
          </li>
        </ol>
        </div>
      )}
      {rewound && (
        <p className="muted">
          Rewound. This is what the shirt looked like at that bid, not now.
        </p>
      )}

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
        <>
          <p className="muted">
            One of the Superteam Ukraine leads wears this shirt. Every marked
            area on it is a spot you can rent: the highest bid when the clock
            runs out is what gets printed, and the shirt is worn as printed.
          </p>
          {/* Расписание торга, в часах читателя: у каждого своё «в полдень».
              Числа берутся из самого торга, не из текста - следующий торг
              принесёт свои даты, и абзац не соврёт. Подавление предупреждения
              гидрации - штатный приём для локального времени: прирендер собран
              в UTC сборщика, а перерисовка у зрителя честнее прирендера. */}
          {startsAt !== null && closesAt !== null && (
            <p className="muted" suppressHydrationWarning>
              {started ? "The auction opened on " : "The auction opens on "}
              {calendar(startsAt)} and runs for {spanOf(closesAt - startsAt)},
              closing on {calendar(closesAt)}. Both times are shown in your own
              time zone. Everything happens right here on this page: the shirt
              stays on display from the first minute to the last, and what you
              see on it at the close is what goes to print.
            </p>
          )}
        </>
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
          {/* Подпись, чей это список: без неё суммы с именами читались как
              обрывок непонятно чего. Верхняя строка - лидер. */}
          <p className="list-head">
            Bids <span>{bids.length === 1 ? "1 bid" : `${bids.length} bids`}</span>
          </p>
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
        {/* Под суммой - имя, а не кошелёк: вопрос к чужой ставке «чьё это
            лого», и «7xKq…f3» на него не отвечает. */}
        <em>{bid.brand}</em>
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
 *
 * Результат кэшируется по адресу, и это не оптимизация впрок, а починка бага:
 * применение креативов пересчитывается на каждый выбор места, каждую свою
 * примерку и каждую пришедшую ставку, и без кэша один и тот же логотип грузился
 * заново по сети каждый раз. На медленной сети - особенно на чужом устройстве
 * без кэша браузера - это и есть «футболка появляется без логотипов, они
 * подгружаются позже»: они успевали загрузиться только к третьему-четвёртому
 * пересчёту. Кэшируем сам промис, чтобы параллельные запросы одного адреса не
 * плодили загрузок.
 */
const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

function loadImage(url: string): Promise<HTMLImageElement | null> {
  const known = imageCache.get(url);
  if (known) return known;

  const loading = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    // Картинка могла уехать вместе с хранилищем или прийти битой. Место
    // останется пустой рамкой, и это лучше, чем пустой экран. Битую не
    // запоминаем: следующая попытка должна суметь загрузить заново.
    image.onerror = () => {
      imageCache.delete(url);
      resolve(null);
    };
    image.src = url;
  });

  imageCache.set(url, loading);
  return loading;
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

/**
 * Сколько осталось до начала. В последний час - с секундами: человек, пришедший
 * к открытию, смотрит на эту строку, и она обязана двигаться у него на глазах.
 */
function until(at: number, now: number): string {
  const seconds = Math.floor((at - now) / 1000);
  if (seconds <= 0) return "moments";
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
  }
  const hours = Math.floor(seconds / 3600);
  if (hours < 48) return `${hours}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * Часы до конца торга, по секундам.
 *
 * Секунды видны всегда, а не только в последнюю минуту: ставка под конец
 * двигает конец всей вещи, и человеку, который решает - ставить сейчас или
 * подождать, - нужно точное время, а не «5m left».
 *
 * Дни отдельным числом впереди: «49:12:07» прочитать нельзя, а «2d 01:12:07»
 * читается сразу.
 */
function countdown(closesAt: number, now: number): string {
  const ms = closesAt - now;
  if (ms <= 0) return "Bidding closed";

  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;

  const pad = (value: number) => String(value).padStart(2, "0");
  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return days > 0 ? `${days}d ${clock} left` : `${clock} left`;
}

/** Дата и время в часах читателя: «в полдень» у каждого своё. */
function calendar(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Длительность словами: ровные сутки - днями, остальное - с часами. */
function spanOf(ms: number): string {
  const hours = Math.round(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  if (days === 0) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  const daysPart = `${days} ${days === 1 ? "day" : "days"}`;
  return rest === 0 ? daysPart : `${daysPart} ${rest} ${rest === 1 ? "hour" : "hours"}`;
}
