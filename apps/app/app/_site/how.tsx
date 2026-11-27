"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import "./home.css";
import "./how.css";
import { Header } from "./header.tsx";
import { mono } from "./mono.ts";

/**
 * Как это работает - историей на прокрутке: слева шаги, справа схема,
 * которая на каждом шаге встаёт в следующее положение. Числа - те же, что в
 * программе эскроу: комиссия 10%, 72 часа на спор. На телефоне схема
 * закреплена сверху, а текст шага стоит внизу и меняется на месте: секции
 * становятся невидимыми отрезками прокрутки, поверх схемы ничего не едет.
 */

type Step = { head: string; body: string; aside?: string };

const STEPS: Step[] = [
  { head: "Your money waits until the photo is up.", body: "Six steps from a spot on a thing to a community getting paid. Scroll." },
  { head: "Pick a spot", body: "A community marks the spots on something its crowd sees: a shirt, a van, a flag. Each spot has its own starting price." },
  { head: "Place a bid", body: "Bid what the spot is worth to you. The highest bid when the auction closes takes it." },
  {
    head: "Escrow holds the money",
    body: "Your bid is paid when you place it and waits in escrow. Nobody can touch it yet.",
    aside: "Outbid? It comes straight back, in the same transaction.",
  },
  { head: "The logo goes on", body: "The community prints your logo and has a deadline to show it.", aside: "No photo by the deadline? Full refund, automatic." },
  { head: "The photo is up", body: "The community posts the proof. You have 72 hours to check it and dispute if something is wrong." },
  { head: "The community gets paid", body: "The winning bid goes to the community, minus our 10% fee. Nothing to pay us upfront." },
];
const LAST = STEPS.length - 1;

/** Где стоят узлы пути денег на схеме. */
const COIN = { project: [80, 470], escrow: [300, 470], community: [520, 470] } as const;

function Text({ at }: { at: number }) {
  const step = STEPS[at]!;
  return (
    <>
      {at > 0 && <span className="how-n">{`${String(at).padStart(2, "0")} / ${String(LAST).padStart(2, "0")}`}</span>}
      {at === 0 ? <h1>{step.head}</h1> : <h2>{step.head}</h2>}
      <p className={at === 0 ? "how-mute" : undefined}>{step.body}</p>
      {step.aside && <p className="how-aside">{step.aside}</p>}
      {at === LAST && (
        <>
          <p className="how-cta">
            <a className="how-go" href="/auctions">
              [ See the auctions ]
            </a>
            <a className="how-go" href="/sell">
              [ List a spot ]
            </a>
          </p>
          <p className="how-aside">Got a crowd? List a spot and we run the auction.</p>
        </>
      )}
    </>
  );
}

const move = (x: number, y: number, s = 1): CSSProperties => ({ transform: `translate(${x}px, ${y}px) scale(${s})` });
const grow = ([cx, cy]: readonly number[], on: boolean): CSSProperties => ({
  transformOrigin: `${cx}px ${cy}px`,
  transform: on ? "scale(1.08)" : "scale(1)",
});

function Diagram({ n }: { n: number }) {
  // Монета: у проекта -> в эскроу -> у сообщества.
  const at = n <= 2 ? COIN.project : n <= 5 ? COIN.escrow : COIN.community;
  const hide = (on: boolean) => (on ? "how-t" : "how-t how-hide");
  return (
    <svg viewBox="0 0 600 600" aria-hidden>
      <g className="how-t">
        <rect x="180" y="40" width="240" height="240" rx="18" fill="none" stroke="#c9c5bd" strokeWidth="1.2" />
        {Array.from({ length: 9 }, (_, cell) => {
          const pick = cell === 4;
          const cls = ["how-cell", "how-t", pick && n >= 1 ? "pick" : "", pick && n >= 4 ? "won" : ""].join(" ");
          return <rect key={cell} className={cls} x={214 + (cell % 3) * 60} y={74 + Math.floor(cell / 3) * 60} width="52" height="52" rx="4" />;
        })}
        <text className={hide(n >= 4)} x="300" y="160" textAnchor="middle" fill="#fff" style={{ fontSize: 11 }}>
          LOGO
        </text>
        <text className="how-sub" x="300" y="306" textAnchor="middle">
          A physical place, 9 spots
        </text>
      </g>
      <g className={hide(n >= 5)}>
        <path d="M168 60 V28 H200 M400 28 H432 V60 M432 260 V292 H400 M200 292 H168 V260" fill="none" stroke="#111" strokeWidth="2" />
        <text className="how-sub" x="300" y="16" textAnchor="middle">
          Photo is up
        </text>
      </g>
      <g className={hide(n === 4 || n === 5)}>
        <line x1="190" y1="330" x2="410" y2="330" stroke="#d9d6cf" strokeWidth="2" />
        <line className="how-t" x1="190" y1="330" x2={n >= 5 ? 410 : n === 4 ? 300 : 190} y2="330" stroke="#111" strokeWidth="2" />
        <text className="how-sub" x="190" y="352">
          Logo printed
        </text>
        <text className="how-sub" x="410" y="352" textAnchor="end">
          {n >= 5 ? "Photo in, 72h to dispute" : "Photo due"}
        </text>
      </g>
      <path className="how-rail" d="M80 470 H520" />
      <g className="how-t" style={grow(COIN.project, n >= 1 && n <= 2)}>
        <circle className="how-node" cx="80" cy="470" r="34" />
        <text className="how-lbl" x="80" y="530" textAnchor="middle">
          Project
        </text>
      </g>
      <g className="how-t" style={grow(COIN.escrow, n >= 3 && n <= 5)}>
        <rect className="how-node" x="262" y="436" width="76" height="68" rx="8" />
        <path d="M282 436 v-14 a18 18 0 0 1 36 0 v14" fill="none" stroke="#111" strokeWidth="1.4" />
        <text className="how-lbl" x="300" y="530" textAnchor="middle">
          Escrow
        </text>
      </g>
      <g className="how-t" style={grow(COIN.community, n === LAST)}>
        <circle className="how-node" cx="520" cy="470" r="34" />
        <text className="how-lbl" x="520" y="530" textAnchor="middle">
          Community
        </text>
      </g>
      <g className={hide(n === 2)}>
        <rect className="how-barb" x="40" y="372" width="70" height="10" rx="2" />
        <text className="how-sub" x="116" y="381">
          Brand A $420
        </text>
        <rect className="how-barf" x="40" y="392" width="76" height="10" rx="2" />
        <text className="how-sub" x="122" y="401" fill="#111">
          You $450
        </text>
      </g>
      <g className={hide(n === 3)}>
        <path className="how-back" d="M300 420 C 300 360, 90 360, 82 430" />
        <text className="how-sub" x="190" y="352" textAnchor="middle">
          outbid: straight back
        </text>
      </g>
      <g className={hide(n === 4)}>
        <path className="how-back" d="M300 420 C 300 380, 110 400, 86 434" />
        <text className="how-sub" x="150" y="392" textAnchor="middle">
          no photo: full refund
        </text>
      </g>
      <g className={hide(n === LAST)}>
        <text className="how-sub" x="470" y="400" textAnchor="middle">
          OXAR fee 10%
        </text>
      </g>
      <g className={`how-coin ${hide(n === LAST)}`} style={move(n === LAST ? 470 : 300, n === LAST ? 420 : 470, n === LAST ? 1 : 0.001)}>
        <circle r="15" />
        <text style={{ fontSize: 11 }}>$45</text>
      </g>
      <g className="how-coin how-t" style={move(at[0], at[1], n === 0 ? 0.001 : 1)}>
        <circle r="27" />
        <text>{n === LAST ? "$405" : "$450"}</text>
      </g>
    </svg>
  );
}

export function How() {
  const [step, setStep] = useState(0);
  // Текст на телефоне меняется с коротким переходом: сначала гаснет старый.
  const [shown, setShown] = useState(0);
  const [swap, setSwap] = useState(false);
  const sections = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    // Шаг - тот, чья секция пересекает середину экрана.
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setStep(Number((entry.target as HTMLElement).dataset.s));
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    for (const one of sections.current) if (one) io.observe(one);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (step === shown) return;
    setSwap(true);
    const wait = window.setTimeout(() => {
      setShown(step);
      setSwap(false);
    }, 180);
    return () => window.clearTimeout(wait);
  }, [step, shown]);

  return (
    <div className={`how home-ready ${mono.className}`}>
      <Header />
      <div className="how-wrap">
        <div className="how-steps">
          {STEPS.map((_, at) => (
            <section
              key={at}
              data-s={at}
              className={at === step ? "on" : undefined}
              ref={(el) => {
                sections.current[at] = el;
              }}
            >
              <Text at={at} />
            </section>
          ))}
        </div>
        <div className="how-stick">
          <Diagram n={step} />
          <span className="how-count">{`${String(step).padStart(2, "0")} / ${String(LAST).padStart(2, "0")}`}</span>
        </div>
      </div>
      <div className="how-cap">
        <div className={swap ? "how-in swap" : "how-in"}>
          <Text at={shown} />
        </div>
        <div className="how-dots">
          {STEPS.map((_, at) => (
            <i key={at} className={at === step ? "on" : undefined} />
          ))}
        </div>
      </div>
    </div>
  );
}
