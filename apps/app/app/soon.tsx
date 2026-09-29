"use client";

import { useRef } from "react";
import { SOON, ThingStage, type Stage } from "@oxar/stage";

/** Торг ещё не открылся: знак вопроса голограммой, крутится и светится. */
export function SoonHologram() {
  const stage = useRef<Stage | null>(null);
  return (
    <ThingStage
      shape={SOON}
      picked={null}
      onPick={() => {}}
      stage={stage}
      onReady={() => stage.current?.look("ghost")}
    />
  );
}
