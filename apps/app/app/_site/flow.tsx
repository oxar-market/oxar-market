"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
// Комиссия - та же, что в калькуляторе продавца, одна на оба места.
import { FEE } from "./pitch.tsx";

/**
 * Как идут деньги - схемой из шести шагов, а не тремя карточками текста.
 * Каждый шаг - кусочек экрана, каким его видит покупатель. Стрелки
 * считаются по месту карточек, поэтому схема та же на любой ширине: на
 * широком экране змейкой, на узком - столбиком.
 */

const BID = 450;

function usd(dollars: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(dollars);
}

/** Точка выхода стрелки из карточки from и входа в to - по их взаимному месту. */
function wire(from: DOMRect, to: DOMRect, box: DOMRect): string {
  const x = (value: number) => value - box.left;
  const y = (value: number) => value - box.top;
  const below = to.top >= from.bottom - 8;
  const right = to.left >= from.right - 8;
  const left = to.right <= from.left + 8;
  if (right || left) {
    const ax = right ? from.right : from.left;
    const bx = right ? to.left : to.right;
    const ay = from.top + from.height / 2;
    const by = to.top + Math.min(to.height / 2, 56);
    const bend = (bx - ax) / 2;
    return `M${x(ax)} ${y(ay)} C${x(ax + bend)} ${y(ay)} ${x(bx - bend)} ${y(by)} ${x(bx)} ${y(by)}`;
  }
  const ax = from.left + from.width / 2;
  const bx = to.left + to.width / 2;
  const ay = below ? from.bottom : from.top;
  const by = below ? to.top : to.bottom;
  const bend = (by - ay) / 2;
  return `M${x(ax)} ${y(ay)} C${x(ax)} ${y(ay + bend)} ${x(bx)} ${y(by - bend)} ${x(bx)} ${y(by)}`;
}

function Node({ at, title, tag, children }: { at: number; title: string; tag: string; children: ReactNode }) {
  return (
    <div className={`v2-node n${at}`} data-node>
      <span className="v2-node-at">{String(at).padStart(2, "0")}</span>
      <h3>{title}</h3>
      <div className="v2-node-ui">{children}</div>
      <span className="v2-node-tag">{tag}</span>
    </div>
  );
}

export function Flow() {
  const board = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<string[]>([]);

  useLayoutEffect(() => {
    const host = board.current;
    if (!host) return;
    const draw = () => {
      const box = host.getBoundingClientRect();
      const nodes = [...host.querySelectorAll<HTMLElement>("[data-node]")].map((one) => one.getBoundingClientRect());
      setPaths(nodes.slice(1).map((to, at) => wire(nodes[at], to, box)));
    };
    draw();
    const watch = new ResizeObserver(draw);
    watch.observe(host);
    return () => watch.disconnect();
  }, []);

  const fee = BID * FEE;
  return (
    <div className="v2-flow" ref={board}>
      <svg className="v2-wires" aria-hidden>
        <defs>
          <marker id="v2-head" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M1 1 7 4 1 7" />
          </marker>
        </defs>
        {paths.map((d, at) => (
          <path key={at} d={d} markerEnd="url(#v2-head)" />
        ))}
      </svg>

      <Node at={1} title="Pick a spot" tag="spots">
        <ul className="v2-ui-list">
          <li>
            <i>1</i>Chest<em>from $50</em>
          </li>
          <li className="on">
            <i>2</i>Back<em>top bid $420</em>
          </li>
          <li>
            <i>3</i>Sleeve<em>open</em>
          </li>
        </ul>
      </Node>

      <Node at={2} title="Place a bid" tag="bids">
        <div className="v2-ui-bid">
          <span>{usd(BID)}</span>
          <b>Bid</b>
        </div>
        <ul className="v2-ui-board">
          <li className="on">
            <i>Y</i>You<em>{usd(BID)}</em>
          </li>
          <li>
            <i>A</i>Brand A<em>outbid</em>
          </li>
        </ul>
      </Node>

      <Node at={3} title="Money waits in escrow" tag="escrow">
        <div className="v2-ui-held">
          <svg viewBox="0 0 24 24" aria-hidden>
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          <div>
            <b>{usd(BID)}</b>
            <span>held, not paid out</span>
          </div>
        </div>
        <p className="v2-ui-note">Outbid? It comes straight back.</p>
      </Node>

      <Node at={4} title="Your logo goes on" tag="deadline">
        <div className="v2-ui-logo">
          <i className="v2-c tl" />
          <i className="v2-c tr" />
          <i className="v2-c bl" />
          <i className="v2-c br" />
          YOUR LOGO
        </div>
        <div className="v2-ui-pills">
          <span>Photo due Dec 20</span>
        </div>
        <p className="v2-ui-note">No photo by then? Full refund, automatic.</p>
      </Node>

      <Node at={5} title="Photo is up" tag="proof">
        <div className="v2-ui-photo">
          <img src="/site/van-brand.jpg" alt="" />
          <span>71:58 left to dispute</span>
        </div>
      </Node>

      <Node at={6} title="Owner gets paid" tag="payout">
        <dl className="v2-ui-pay">
          <div>
            <dt>Winning bid</dt>
            <dd>{usd(BID)}</dd>
          </div>
          <div>
            <dt>OXAR fee ({Math.round(FEE * 100)}%)</dt>
            <dd>{usd(fee)}</dd>
          </div>
          <div>
            <dt>To the owner</dt>
            <dd>{usd(BID - fee)}</dd>
          </div>
        </dl>
        <div className="v2-ui-pills">
          <span>Approved</span>
          <span className="ok">Paid</span>
        </div>
      </Node>
    </div>
  );
}
