"use client";

import { useEffect, useState } from "react";
import { useLogin, usePrivy } from "@privy-io/react-auth";
import { db, exchange } from "@/lib/session";

/**
 * Вход в приложение. Пока это всё, что здесь есть: аукцион появится следующим
 * шагом, а дверь в него уже должна работать.
 *
 * Обмен токена на сессию идёт сразу после входа и один раз: токен Privy живёт
 * около часа, а сессия Supabase обновляется сама.
 */
export default function Home() {
  const { ready, authenticated, user, getAccessToken, logout } = usePrivy();
  const { login } = useLogin();
  const [linked, setLinked] = useState<"idle" | "linking" | "ready" | "failed">(
    "idle",
  );

  useEffect(() => {
    if (!ready || !authenticated || !db) return;

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
  }, [ready, authenticated, getAccessToken]);

  if (!ready) return <main />;

  if (!authenticated) {
    return (
      <main>
        <h1>OXAR</h1>
        <p>Auctions for ad spots on things people carry.</p>
        <button onClick={login}>Sign in</button>
      </main>
    );
  }

  return (
    <main>
      <h1>OXAR</h1>
      <p className="muted">{user?.wallet?.address ?? user?.email?.address}</p>
      {linked === "failed" && (
        <p className="bad">Could not reach the database. Try again in a minute.</p>
      )}
      <button onClick={logout}>Sign out</button>
    </main>
  );
}
