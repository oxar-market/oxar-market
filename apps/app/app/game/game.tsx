"use client";

import { useState } from "react";
import { FlappyJosip } from "./flappy";
import { Leaderboard } from "./leaderboard";

/**
 * Игра на вкладке маркета.
 *
 * Маркета ещё нет, и вкладка честно об этом говорит. Пустая страница с формой
 * почты - всё, что там было, и человеку на ней нечего делать. Игра даёт повод
 * остаться, а заодно рассказывает ровно то, о чём продукт: щиты, между которых
 * летишь, стоят пустыми, и на каждом написана цена.
 *
 * Она была у нас на лендинге до того, как кодовую базу снесли, и вместе с ней
 * в базе осталась таблица результатов - с чужими рекордами, которые сносить не
 * за что. Поэтому здесь не новая игра, а та же.
 */

export function Game() {
  const [playing, setPlaying] = useState(false);
  // Последний доигранный счёт: его и предлагаем отправить в таблицу.
  const [lastScore, setLastScore] = useState<number | null>(null);

  // Игра выходит из окна на весь экран: в рамке она читалась как вставка.
  if (playing) {
    return <FlappyJosip onScore={setLastScore} onExit={() => setPlaying(false)} />;
  }

  return (
    <div className="josip">
      {/* Кнопка с его лицом: обычная чёрная кнопка не сообщала, что за ней
          игра. Стоит над таблицей - сначала играют, а список смотрят потом. */}
      <button type="button" className="play" onClick={() => setPlaying(true)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/josip.png" alt="" className="play-face" />
        <span className="play-text">
          <strong>{lastScore === null ? "Play Flappy Josip" : "Play again"}</strong>
          <span>Fly him between the empty ad boards</span>
        </span>
        <span className="play-go" aria-hidden>
          ▶
        </span>
      </button>

      {/* Сыграл - отправь результат: таблица живёт здесь, а не поверх игры. */}
      <Leaderboard score={lastScore ?? 0} played={lastScore !== null} />
    </div>
  );
}
