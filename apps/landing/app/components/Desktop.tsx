"use client";

import { useState } from "react";
import { APPS, FILES, type DesktopFile } from "@/lib/desktop";
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

export function Desktop() {
  const [role, setRole] = useState<Role>("creator");
  // При первом заходе одно окно уже открыто: рабочий стол без подсказки
  // заставляет человека догадываться, а оффер должен читаться сразу.
  const [open, setOpen] = useState<Open>({ kind: "file", file: FILES[0]! });

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

      <div className="icons">
        {FILES.map((file) => (
          <button
            key={file.slug}
            className="icon"
            style={{ left: `${file.x}%`, top: `${file.y}%` }}
            onClick={() => setOpen({ kind: "file", file })}
          >
            <span className="icon-art file" aria-hidden />
            <span className="icon-name">{file.name}</span>
          </button>
        ))}

        {APPS.map((app) => (
          <button
            key={app.slug}
            className="icon"
            style={{ left: `${app.x}%`, top: `${app.y}%` }}
            onClick={() => setOpen({ kind: "x" })}
          >
            <span className="icon-art app" aria-hidden>
              𝕏
            </span>
            <span className="icon-name">{app.name}</span>
          </button>
        ))}
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
          <a className="dock-item" href="https://app.oxar.app" target="_blank" rel="noreferrer">
            Browse placements
          </a>
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
