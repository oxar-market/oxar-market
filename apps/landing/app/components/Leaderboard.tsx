"use client";

import { useCallback, useEffect, useState } from "react";
import { isValidHandle, normalizeHandle } from "@oxar/core";
import { postScore, topScores, type Score } from "@/lib/game";
import { Notice } from "./Notice";

// Таблица и отправка счёта. Первые десять получают доступ раньше остальных,
// поэтому счёт здесь - ещё и заявка: без хэндла непонятно, кому его открывать.

const TOP = 10;

export function Leaderboard({ score, played }: { score: number; played: boolean }) {
  const [rows, setRows] = useState<Score[] | null>(null);
  const [handle, setHandle] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setRows(await topScores(TOP));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Новая попытка - снова можно отправить: в списке остаётся лучшая.
  useEffect(() => {
    if (!played) setSent(false);
  }, [played]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    const clean = normalizeHandle(handle);
    if (!isValidHandle(clean)) {
      setError("Your X handle, letters and numbers, no @.");
      return;
    }

    const result = await postScore(clean, score);
    if (result === "error") {
      setError("Could not save that score. Try again.");
      return;
    }
    setSent(true);
    load();
  }

  return (
    <div className="board">
      <div className="board-head">
        <strong>Top {TOP} get in first</strong>
        <span className="muted small">
          The ten highest scores get access before the waitlist.
        </span>
      </div>

      {played && !sent && (
        <form className="board-form" onSubmit={submit} noValidate>
          <span className="prefixed">
            <span className="prefix" aria-hidden>
              @
            </span>
            <input
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              placeholder="yourhandle"
              autoComplete="off"
              spellCheck={false}
            />
          </span>
          <button type="submit" className="primary">
            Post {score}
          </button>
        </form>
      )}

      {error && <Notice tone="error">{error}</Notice>}
      {sent && (
        <Notice tone="success" title="Score posted">
          Beat it again and post the better one - only your best counts.
        </Notice>
      )}

      {rows === null && <p className="muted small">Loading…</p>}
      {rows?.length === 0 && (
        <p className="muted small">Nobody has flown yet. Be the first.</p>
      )}

      {rows && rows.length > 0 && (
        <ol className="board-list">
          {rows.map((row, index) => (
            <li key={row.x_handle}>
              <span className="board-rank">{index + 1}</span>
              <a
                className="board-handle"
                href={`https://x.com/${row.x_handle}`}
                target="_blank"
                rel="noreferrer"
              >
                @{row.x_handle}
              </a>
              <span className="board-score">{row.score}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
