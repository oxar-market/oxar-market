"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { db, exchange } from "./session.ts";

/**
 * Сессия базы от имени вошедшего в Privy. Нужна всему, что пишет от лица
 * человека: загрузке логотипа ставки, профилю, настройкам.
 *
 * Вышел из Privy - выходит и из базы. Раньше сессия Supabase переживала
 * выход: следующий вошедший до конца обмена читал базу от имени прежнего,
 * и у чужого кошелька оставалась вкладка Admin. Только эта вкладка
 * (scope local): глобальный выход выкинул бы человека и с телефона.
 *
 * Обмен токена на сессию идёт один раз после входа: токен Privy живёт около
 * часа, а сессия Supabase обновляется сама.
 */
export function useDbSession(): "idle" | "linking" | "ready" | "failed" {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const [linked, setLinked] = useState<"idle" | "linking" | "ready" | "failed">("idle");

  useEffect(() => {
    if (!ready || !db) return;
    if (!authenticated) {
      setLinked("idle");
      void db.auth.signOut({ scope: "local" });
      return;
    }

    let live = true;
    (async () => {
      setLinked("linking");
      const token = await getAccessToken();
      if (!token) return live && setLinked("failed");
      const result = await exchange(token);
      if (live) setLinked(result.ok ? "ready" : "failed");
    })();

    return () => {
      live = false;
    };
  }, [ready, authenticated, user?.id, getAccessToken]);

  return linked;
}
