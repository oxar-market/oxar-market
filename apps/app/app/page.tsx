"use client";

import { useEffect, useState } from "react";
import { useLogin, usePrivy } from "@privy-io/react-auth";
import { db, exchange } from "@/lib/session";
import { BUILD } from "@/lib/build";
import { Auction } from "./auction/auction";
import { Market } from "./market";
import { Tabs, useTab } from "./tabs";
import { You } from "./you";

/**
 * Приложение.
 *
 * Торг виден до входа: гость должен увидеть, за что идёт борьба, раньше чем у
 * него спросят кто он. Вход возникает в момент ставки, а не на пороге - на
 * пустой странице никто не регистрируется.
 *
 * Обмен токена на сессию идёт один раз после входа: токен Privy живёт около
 * часа, а сессия Supabase обновляется сама.
 */
export default function Home() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { login } = useLogin();
  const [tab, setTab] = useTab();
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

  return (
    <main className="app">
      {linked === "failed" && (
        <p className="bad banner">
          Could not reach the database. Bidding is off until it is back.
        </p>
      )}

      {tab === "market" && <Market />}
      {tab === "auction" && <Auction />}
      {tab === "you" && (authenticated ? <You /> : <Guest onSignIn={login} />)}

      <Tabs tab={tab} onPick={setTab} />
    </main>
  );
}

function Guest({ onSignIn }: { onSignIn: () => void }) {
  return (
    <section className="screen">
      <h1>You</h1>
      <p className="lead">Sign in to bid and to see what you have won.</p>
      <button type="button" className="primary" onClick={onSignIn}>
        Sign in
      </button>
      <p className="build">build {BUILD}</p>
    </section>
  );
}
