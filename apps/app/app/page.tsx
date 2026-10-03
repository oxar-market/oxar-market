"use client";

import { useEffect, useState } from "react";
import { useIdentityToken, useLogin, usePrivy } from "@privy-io/react-auth";
import { db, exchange, syncContact } from "@/lib/session";
import { BUILD } from "@/lib/build";
import { Auction } from "./auction/auction";
import { Market } from "./market";
import { Tabs, useTab } from "./tabs";
import { ThemeRow, You } from "./you";
import { PhoneCapture } from "./seller/flow.tsx";
import { ListingAuction } from "./listing/listing.tsx";

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
  // Вещь продавца, открытая с маркета или из кабинета. Пусто - на вкладке
  // торга наша футболка, как было.
  const [openThing, setOpenThing] = useState<string | null>(null);
  function openAuction(thingId?: string) {
    setOpenThing(thingId ?? null);
    setTab("auction");
  }
  const [linked, setLinked] = useState<"idle" | "linking" | "ready" | "failed">(
    "idle",
  );

  // Телефон пришёл по QR с десктопа продавца: сразу камера на вкладке You.
  // Телефон пришёл по QR с десктопа: сразу камера, без входа - в ссылке
  // секрет сессии съёмки, он и есть допуск.
  const [capture, setCapture] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Кнопка из письма ведёт на вкладку: ?tab=you, ?tab=auction, ?tab=market.
    const opened = params.get("tab");
    if (opened === "market" || opened === "auction" || opened === "you") setTab(opened);
    const secret = params.get("c");
    if (secret && /^[a-z0-9]{10}$/.test(secret)) {
      setCapture(secret);
      setTab("you");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Почта для писем: identity-токен меняется при входе и при привязке почты,
  // тогда и сообщаем серверу. Строку настроек заводит обмен, поэтому - после него.
  const { identityToken } = useIdentityToken();
  useEffect(() => {
    if (linked !== "ready" || !identityToken) return;
    void getAccessToken().then((token) => {
      if (token) void syncContact(token, identityToken);
    });
  }, [linked, identityToken, getAccessToken]);

  // Торг виден до входа, поэтому весь экран на готовность Privy не держим:
  // раньше `if (!ready) return <main />` отдавал белый лист, пока Privy
  // поднимается, и на медленной инициализации это выглядело как «сайт не
  // загрузился, надо перезайти». Оболочку и торг показываем сразу, а на Privy
  // ждёт только то, что без него бессмысленно, - вкладка You.
  return (
    <main className="app">
      {linked === "failed" && (
        <p className="bad banner">
          Could not reach the database. Bidding is off until it is back.
        </p>
      )}

      {tab === "market" && (
        <Market onOpenAuction={openAuction} />
      )}
      {tab === "auction" &&
        (openThing ? (
          <ListingAuction
            thingId={openThing}
            onBack={() => {
              setOpenThing(null);
              setTab("market");
            }}
          />
        ) : (
          <Auction />
        ))}
      {tab === "you" && capture ? (
        <section className="screen">
          <PhoneCapture
            secret={capture}
            onClose={() => {
              setCapture(null);
              window.history.replaceState(null, "", "/");
            }}
          />
        </section>
      ) : tab === "you" &&
        // Пока Privy не готов, не показываем ни Guest, ни You: иначе вошедшему
        // на миг мелькнёт «Sign in», пока не подтвердится сессия.
        (!ready ? (
          <section className="screen" />
        ) : authenticated ? (
          <You onOpenAuction={openAuction} />
        ) : (
          <Guest onSignIn={login} />
        ))}

      <Tabs
        tab={tab}
        onPick={(next) => {
          if (next === "auction") setOpenThing(null);
          setTab(next);
        }}
      />
    </main>
  );
}

function Guest({ onSignIn }: { onSignIn: () => void }) {
  return (
    <section className="screen">
      <h1 className="mk-title">
        OXAR <span>You</span>
      </h1>
      <p className="lead">Sign in to bid and to see what you have won.</p>
      <button type="button" className="primary" onClick={onSignIn}>
        Sign in
      </button>
      <ThemeRow />
      <p className="build">build {BUILD}</p>
    </section>
  );
}
