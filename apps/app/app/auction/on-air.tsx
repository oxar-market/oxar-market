"use client";

import { useEffect, useRef, useState } from "react";
import { loadOnAir, type AirThing } from "@/lib/auction";
import { restingSlide } from "@/lib/slides";
import { Auction, Between } from "./auction.tsx";
import { ListingAuction } from "../listing/listing.tsx";

/**
 * Вкладка Auction: идущий торг, а нет его - ближайший назначенный. И наши
 * вещи, и вещи продавцов: раньше вкладка знала только нашу футболку и
 * показывала заглушку, когда у продавца торг шёл или открывался через минуту.
 * Заглушка осталась только на случай, когда нет ни идущего, ни назначенного.
 *
 * Торгов несколько - они листаются той же каруселью, что герой маркета:
 * слайды со снапом, точки, стрелки. Слайд - целый экран торга: наша вещь
 * своим экраном, вещь продавца - своим.
 */
export function AuctionTab({ house, onBack }: { house: boolean; onBack: () => void }) {
  const [air, setAir] = useState<AirThing[] | null>(null);
  useEffect(() => {
    void loadOnAir().then(setAir);
  }, []);

  const rail = useRef<HTMLDivElement | null>(null);
  const [slide, setSlide] = useState(0);
  const slides = air?.length ?? 0;
  // Пришли с нашей вещи (маркет, «Raise your bid») - встаём на её слайд, а
  // не на первый: человек открывал её, а не чужой торг.
  useEffect(() => {
    const el = rail.current;
    if (!el || !air || !house) return;
    const at = air.findIndex((one) => one.house);
    if (at > 0) el.scrollLeft = at * el.clientWidth;
  }, [air, house]);
  // Высота карусели - по текущему слайду, как на маркете: экраны торга
  // разной длины, и под коротким не должна лежать пустота длинного.
  useEffect(() => {
    const el = rail.current;
    const current = el?.children[slide] as HTMLElement | undefined;
    if (!el || !current) return;
    const fit = () => {
      el.style.height = `${current.offsetHeight}px`;
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(current);
    return () => watch.disconnect();
  }, [slide, slides]);
  // Листание по кругу, как на маркете.
  function go(to: number) {
    const el = rail.current;
    if (!el || slides === 0) return;
    const at = (to + slides) % slides;
    el.scrollTo({ left: at * el.clientWidth, behavior: "smooth" });
  }
  // Страховка, как на маркете: прокрутка затихла, пальца нет, а слайд не на
  // месте - Safari на iPhone после оборванной прокрутки сам не довозит.
  const touching = useRef(false);
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function settleSoon() {
    clearTimeout(idle.current);
    idle.current = setTimeout(() => {
      const el = rail.current;
      if (!el || touching.current) return;
      const rest = restingSlide(el.scrollLeft, el.clientWidth, slides);
      if (rest.off) el.scrollTo({ left: rest.left, behavior: "smooth" });
    }, 150);
  }
  useEffect(() => () => clearTimeout(idle.current), []);

  // Пока список не доехал, не знаем, чей экран показывать: только шапка.
  if (!air) {
    return (
      <section className="lot">
        <div className="lot-brandbar">
          <span className="mk-title">
            OXAR <span>Auction</span>
          </span>
        </div>
      </section>
    );
  }
  if (air.length === 0) return <Between />;

  const screen = (one: AirThing) =>
    one.house ? <Auction /> : <ListingAuction thingId={one.thingId} onBack={onBack} />;
  if (air.length === 1) return screen(air[0] as AirThing);

  return (
    <>
      {/* Точки и стрелки наверху, а не под каруселью и не по бокам сцены:
          под ней целый экран торга, до точек никто не долистает, а у экранов
          торга шапка разной высоты, и стрелки сбоку ложились на текст. */}
      <div className="air-nav">
        <button
          type="button"
          className="hero-arrow"
          aria-label="Previous auction"
          onClick={() => go(slide - 1)}
        >
          &larr;
        </button>
        <div className="hero-pager">
          {air.map((one, at) => (
            <button
              key={one.thingId}
              type="button"
              className={at === slide ? "on" : ""}
              aria-label={`Show auction ${at + 1}`}
              onClick={() => go(at)}
            />
          ))}
        </div>
        <button
          type="button"
          className="hero-arrow"
          aria-label="Next auction"
          onClick={() => go(slide + 1)}
        >
          &rarr;
        </button>
      </div>
      <div className="hero-wrap">
        <div
          className="hero-rail"
          ref={rail}
          onScroll={(event) => {
            const el = event.currentTarget;
            setSlide(restingSlide(el.scrollLeft, el.clientWidth, slides).index);
            settleSoon();
          }}
          onTouchStart={() => {
            touching.current = true;
          }}
          onTouchEnd={() => {
            touching.current = false;
            settleSoon();
          }}
          onTouchCancel={() => {
            touching.current = false;
            settleSoon();
          }}
        >
          {air.map((one) => (
            <div className="air-slide" key={one.thingId}>
              {screen(one)}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
