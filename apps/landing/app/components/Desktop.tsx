"use client";

import { useState } from "react";
import { APPS, FILES, type DesktopFile } from "@/lib/desktop";
import { useIconLayout, type Layout } from "@/lib/use-icon-layout";
import { Waitlist } from "./Waitlist";
import { Window } from "./Window";
import { XProfile } from "./XProfile";

type Role = "creator" | "advertiser";
type Open =
  | { kind: "file"; file: DesktopFile }
  | { kind: "waitlist" }
  | { kind: "x" }
  | null;

const CALL_URL = "https://cal.com/oxar";

type Item =
  | { slug: string; kind: "file"; name: string; file: DesktopFile }
  | { slug: string; kind: "app"; name: string };

const ITEMS: Item[] = [
  ...FILES.map<Item>((file) => ({
    slug: file.slug,
    kind: "file",
    name: file.name,
    file,
  })),
  ...APPS.map<Item>((app) => ({ slug: app.slug, kind: "app", name: app.name })),
];

const DEFAULT_POSITIONS: Layout = Object.fromEntries([
  ...FILES.map((file) => [file.slug, { x: file.x, y: file.y }]),
  ...APPS.map((app) => [app.slug, { x: app.x, y: app.y }]),
]);

export function Desktop() {
  const [role, setRole] = useState<Role>("creator");
  // При первом заходе одно окно уже открыто: рабочий стол без подсказки
  // заставляет человека догадываться, а оффер должен читаться сразу.
  const [open, setOpen] = useState<Open>({ kind: "file", file: FILES[0]! });

  const { positions, order, surface, onPointerDown, onPointerMove, onPointerUp } =
    useIconLayout(
      ITEMS.map((item) => item.slug),
      DEFAULT_POSITIONS,
    );

  function activate(slug: string) {
    const item = ITEMS.find((candidate) => candidate.slug === slug);
    if (!item) return;
    setOpen(item.kind === "file" ? { kind: "file", file: item.file } : { kind: "x" });
  }

  const sorted = order
    .map((slug) => ITEMS.find((item) => item.slug === slug))
    .filter((item): item is Item => Boolean(item));

  return (
    <div className="desktop">
      <header className="topbar">
        <span className="brand">OXAR</span>
        <div className="roles" role="tablist" aria-label="Your side">
          <button
            role="tab"
            aria-selected={role === "creator"}
            className={role === "creator" ? "role on" : "role"}
            onClick={() => setRole("creator")}
          >
            Creator
          </button>
          <button
            role="tab"
            aria-selected={role === "advertiser"}
            className={role === "advertiser" ? "role on" : "role"}
            onClick={() => setRole("advertiser")}
          >
            Advertiser
          </button>
        </div>
        <span className="hint">
          {role === "creator" ? "Selling space" : "Buying space"}
        </span>
      </header>

      <div className="icons" ref={surface}>
        {sorted.map((item) => {
          const at = positions[item.slug] ?? { x: 5, y: 8 };
          return (
            <button
              key={item.slug}
              className="icon"
              style={{ left: `${at.x}%`, top: `${at.y}%` }}
              onPointerDown={(event) => onPointerDown(item.slug, event)}
              onPointerMove={onPointerMove}
              onPointerUp={(event) => onPointerUp(event, activate)}
              onPointerCancel={(event) => onPointerUp(event, () => {})}
            >
              <span
                className={item.kind === "file" ? "icon-art file" : "icon-art app"}
                aria-hidden
              >
                {item.kind === "app" ? "𝕏" : null}
              </span>
              <span className="icon-name">{item.name}</span>
            </button>
          );
        })}
      </div>

      <nav className="dock">
        <button className="dock-item" onClick={() => setOpen({ kind: "waitlist" })}>
          Join waitlist
        </button>
        {role === "creator" ? (
          <a className="dock-item" href={CALL_URL} target="_blank" rel="noreferrer">
            Book a call
          </a>
        ) : (
          <button className="dock-item" onClick={() => setOpen({ kind: "x" })}>
            Browse placements
          </button>
        )}
      </nav>

      {open?.kind === "file" && (
        <Window title={open.file.name} onClose={() => setOpen(null)}>
          <h1>{open.file.title}</h1>
          {open.file.body.map((paragraph) => (
            <p key={paragraph.slice(0, 24)}>{paragraph}</p>
          ))}
          {open.file.slug === "who-we-are" && (
            <button className="primary" onClick={() => setOpen({ kind: "waitlist" })}>
              Join the waitlist
            </button>
          )}
        </Window>
      )}

      {open?.kind === "waitlist" && (
        <Window title="waitlist" onClose={() => setOpen(null)}>
          <Waitlist />
        </Window>
      )}

      {open?.kind === "x" && (
        <Window title="X placements" onClose={() => setOpen(null)} wide>
          <XProfile role={role} />
        </Window>
      )}
    </div>
  );
}
