"use client";

import { useRef } from "react";
import { SOON, ThingStage, type Stage } from "@oxar/stage";

/**
 * Торг ещё не открылся: голограмма крутится и светится. Есть модель вещи -
 * это она, нет - знак вопроса.
 */
export function SoonHologram({ model = null }: { model?: string | null }) {
  const stage = useRef<Stage | null>(null);
  return (
    <ThingStage
      // Сцена читает вещь один раз: модель, приехавшая позже, собирает её заново.
      key={model ?? "soon"}
      shape={model ? { ...SOON, model, noun: "thing" } : SOON}
      picked={null}
      onPick={() => {}}
      stage={stage}
      onReady={() => stage.current?.look("ghost")}
    />
  );
}
