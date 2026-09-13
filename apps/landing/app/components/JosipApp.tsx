"use client";

import { useState } from "react";
import { FlappyJosip } from "./FlappyJosip";
import { Leaderboard } from "./Leaderboard";

// Пасхалка. Йосип Воларевич описал этот маркетплейс публично ещё до того, как мы
// начали его строить. Здесь короткая выдержка и ссылка на его пост: перепечатка
// чужого текста целиком выглядела бы слабее отсылки, да и трафик должен идти ему.

const POST_URL = "https://x.com/JosipVolarevic2/status/2096935262743900240";
const PROFILE_URL = "https://x.com/JosipVolarevic2";

export function JosipApp() {
  const [playing, setPlaying] = useState(false);
  // Последний доигранный счёт: его и предлагаем отправить в таблицу.
  const [lastScore, setLastScore] = useState<number | null>(null);

  if (playing) {
    return (
      <div className="josip">
        <button type="button" className="link-back" onClick={() => setPlaying(false)}>
          Back
        </button>
        <FlappyJosip onScore={setLastScore} />
        <p className="muted small">
          Every board in the way is ad space nobody bought yet.
        </p>
        <Leaderboard score={lastScore ?? 0} played={lastScore !== null} />
      </div>
    );
  }

  return (
    <div className="josip">
      <header className="josip-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/josip.png" alt="Josip Volarević" className="josip-face" />
        <div>
          <strong>Josip called it</strong>
          <a className="josip-handle" href={PROFILE_URL} target="_blank" rel="noreferrer">
            @JosipVolarevic2
          </a>
        </div>
      </header>

      <blockquote className="josip-quote">
        Make a marketplace where anyone can sell a digital or physical location as
        Ad space, and people can bid/buy it.
      </blockquote>

      <p className="muted small">
        He wrote that before we started building. His argument was that the
        behaviour already exists - Solana sold ad space on its own logo for flood
        relief, creators sell their banners, people sell their foreheads - and
        that crypto is what makes the payouts global and cheap.
      </p>

      <a className="josip-link" href={POST_URL} target="_blank" rel="noreferrer">
        Read the original post
      </a>

      {/* Кнопка с его лицом: обычная чёрная кнопка не сообщала, что за ней игра. */}
      <button type="button" className="play" onClick={() => setPlaying(true)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/josip.png" alt="" className="play-face" />
        <span className="play-text">
          <strong>Play Flappy Josip</strong>
          <span>Fly him between the empty ad boards</span>
        </span>
        <span className="play-go" aria-hidden>
          ▶
        </span>
      </button>
    </div>
  );
}
