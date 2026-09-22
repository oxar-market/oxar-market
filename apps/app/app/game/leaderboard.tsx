"use client";

import { useCallback, useEffect, useState } from "react";
import { postScore, readMine, topScores, type Mine, type Score } from "@/lib/game";
import { Notice } from "./notice";

// Таблица результатов и отправка счёта.
//
// Своё имя можно улучшать, чужое - нет: имя держит ключ, который придумал этот
// браузер, а в базе лежит только его хэш. Результат ниже своего рекорда мы даже
// не предлагаем отправить - в таблице он ничего не изменит.

const TOP = 10;

/** То же правило, что и у базы: ниже неё имя всё равно не примут. */
const TELEGRAM = /^@[A-Za-z][A-Za-z0-9_]{4,31}$/;

export function Leaderboard({ score, played }: { score: number; played: boolean }) {
  const [rows, setRows] = useState<Score[] | null>(null);
  const [handle, setHandle] = useState("");
  const [sent, setSent] = useState<number | null>(null);
  const [mine, setMine] = useState<Mine | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setRows(await topScores(TOP));
  }, []);

  useEffect(() => {
    load();
    setMine(readMine());
  }, [load]);

  // Новая попытка - снова показываем форму: отправить можно под другим именем.
  useEffect(() => {
    if (!played) setSent(null);
  }, [played]);

  // null - своего рекорда мы не знаем, значит форму показываем.
  const beaten = mine ? score > mine.best : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    const clean = (handle.startsWith("@") ? handle : `@${handle}`).trim();
    if (!TELEGRAM.test(clean)) {
      setError("Telegram name, like @yourname - at least five characters.");
      return;
    }

    const result = await postScore(clean, score);
    if (!result.ok) {
      setError(
        result.reason === "taken"
          ? "That name is already on the board. Pick another one."
          : "Could not save that score. Try again.",
      );
      return;
    }
    setSent(result.kept);
    setMine(readMine());
    load();
  }

  return (
    <div className="board">
      <div className="board-head">
        <strong>Top {TOP}</strong>
        <span className="muted small">
          Leave a Telegram name so the score has an owner.
        </span>
      </div>

      {/* Свой рекорд уже в таблице, и эта попытка его не побила: отправлять
          нечего, и кнопка тут была бы обманом. */}
      {played && sent === null && beaten === false && mine && (
        <Notice tone="success" title={`Your best is ${mine.best}`}>
          {mine.handle} holds it. Beat {mine.best} and the board updates by
          itself.
        </Notice>
      )}

      {played && sent === null && beaten !== false && (
        <form className="board-form" onSubmit={submit} noValidate>
          <span className="prefixed">
            <span className="prefix" aria-hidden>
              @
            </span>
            <input
              value={handle || (mine ? mine.handle.replace(/^@/, "") : "")}
              onChange={(event) => setHandle(event.target.value.replace(/^@/, ""))}
              placeholder="yourname"
              autoComplete="off"
              spellCheck={false}
              aria-label="Your Telegram name"
            />
          </span>
          <button type="submit" className="primary">
            Post {score}
          </button>
        </form>
      )}

      {error && <Notice tone="error">{error}</Notice>}
      {sent !== null && (
        <Notice tone="success" title={`${sent} boards on the board`}>
          {sent > score
            ? "Your earlier run was better, so that one stays."
            : "Beat it and it updates by itself - from this browser."}
        </Notice>
      )}

      {rows === null && <p className="muted small">Loading…</p>}
      {rows?.length === 0 && (
        <p className="muted small">Nobody has flown yet. Be the first.</p>
      )}

      {rows && rows.length > 0 && (
        <ol className="board-list">
          {rows.map((row, index) => (
            <li key={row.telegram}>
              <span className="board-rank">{index + 1}</span>
              <a
                className="board-handle"
                href={`https://t.me/${row.telegram.replace(/^@/, "")}`}
                target="_blank"
                rel="noreferrer"
              >
                {row.telegram}
              </a>
              <span className="board-score">{row.score}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
