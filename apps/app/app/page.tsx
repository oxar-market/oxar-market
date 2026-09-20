"use client";

import { useEffect, useState } from "react";
import { useLogin, usePrivy } from "@privy-io/react-auth";
import { db, exchange } from "@/lib/session";
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
      {tab === "auction" && <Auction onSignIn={login} signedIn={authenticated} />}
      {tab === "you" && (authenticated ? <You /> : <Guest onSignIn={login} />)}

      <Tabs tab={tab} onPick={setTab} />
    </main>
  );
}

/**
 * Заглушка торга. Вещь, места и ставка приезжают следующим шагом - здесь пока
 * только имя лота, чтобы вкладка не была пустой.
 */
function Auction({
  signedIn,
  onSignIn,
}: {
  signedIn: boolean;
  onSignIn: () => void;
}) {
  return (
    <section className="screen">
      <p className="over">Superteam Ukraine</p>
      <h1>Local Event Tee</h1>
      <p className="lead">
        Ad spots on a shirt that will be worn at the event. The highest bid when
        the clock runs out gets printed.
      </p>
      <p className="muted">The shirt and its spots land here next.</p>
      {!signedIn && (
        <button type="button" className="primary" onClick={onSignIn}>
          Sign in to bid
        </button>
      )}
    </section>
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
    </section>
  );
}
