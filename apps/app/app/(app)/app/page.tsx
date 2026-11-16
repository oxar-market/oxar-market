"use client";

import { useEffect, useState } from "react";
import { useIdentityToken, useLogin, usePrivy } from "@privy-io/react-auth";
import { db, exchange, syncContact } from "@/lib/session";
import { loadOnAir } from "@/lib/auction";
import { isShirt } from "@/lib/shape";
import { avatarLetter } from "@oxar/core";
import { Foot, Top, type Account } from "../../_site/landing.tsx";
import { readMe, saveMe, type Me } from "../../_site/me.ts";
import { You } from "../../you";
import { PhoneCapture } from "../../seller/flow.tsx";
import { ListingAuction } from "../../listing/listing.tsx";
import { Auction } from "../../auction/auction.tsx";

/**
 * Приложение - страницы того же сайта, что лендинг: его шапка и подвал, без
 * своего меню. Маркета нет: все торги - на /auctions и вкладкой в кабинете.
 *
 * ?thing=<id> - торг вещи, иначе - кабинет. Старые ссылки из писем и постов
 * ведут сюда же: ?tab=market - на /auctions, ?tab=auction - на идущий или
 * ближайший торг.
 *
 * Торг виден до входа: гость должен увидеть, за что идёт борьба, раньше чем у
 * него спросят кто он. Вход возникает в момент ставки, а не на пороге.
 *
 * Обмен токена на сессию идёт один раз после входа: токен Privy живёт около
 * часа, а сессия Supabase обновляется сама.
 */
export default function Home() {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const { login } = useLogin();
  // Что на странице: торг вещи, наша футболка своим экраном или кабинет.
  const [view, setView] = useState<{ thing: string } | "shirt" | "you" | null>(null);
  function openAuction(thingId?: string) {
    // Через адрес, а не состояние: ссылкой можно поделиться, «назад» ведёт в кабинет.
    window.location.assign(thingId ? `/app?thing=${thingId}` : "/app?tab=auction");
  }
  const [linked, setLinked] = useState<"idle" | "linking" | "ready" | "failed">(
    "idle",
  );

  // Телефон пришёл по QR с десктопа: сразу камера, без входа - в ссылке
  // секрет сессии съёмки, он и есть допуск.
  const [capture, setCapture] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const opened = params.get("tab");
    const thing = params.get("thing");
    const secret = params.get("c");
    if (secret && /^[a-z0-9]{10}$/.test(secret)) {
      setCapture(secret);
      setView("you");
    } else if (thing && /^[0-9a-f-]{36}$/.test(thing)) {
      setView({ thing });
    } else if (opened === "market") {
      window.location.replace("/auctions");
    } else if (opened === "auction") {
      // Идущий торг, а нет его - ближайший назначенный; нет и того - все торги.
      void loadOnAir().then((air) => {
        const first = air[0];
        if (!first) return window.location.replace("/auctions");
        if (first.house && isShirt(first.model)) setView("shirt");
        else setView({ thing: first.thingId });
      });
    } else {
      setView("you");
    }
  }, []);

  // Вышел из Privy - выходит и из базы. Раньше сессия Supabase переживала
  // выход: следующий вошедший до конца обмена читал базу от имени прежнего,
  // и у чужого кошелька оставалась вкладка Admin. Только эта вкладка
  // (scope local): глобальный выход выкинул бы человека и с телефона.
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

  // Почта для писем: identity-токен меняется при входе и при привязке почты,
  // тогда и сообщаем серверу. Строку настроек заводит обмен, поэтому - после него.
  const { identityToken } = useIdentityToken();
  useEffect(() => {
    if (linked !== "ready" || !identityToken) return;
    void getAccessToken().then((token) => {
      if (token) void syncContact(token, identityToken);
    });
  }, [linked, identityToken, getAccessToken]);

  // Вошёл - в шапке его аватар, ведёт в профиль; нет - вход. Пока Privy
  // поднимается, кнопка тоже «Log in»: так она не прыгает у тех, кто не входил.
  // Буква - первый символ кошелька, без него - почты.
  const seed = user?.wallet?.address ?? user?.email?.address ?? null;
  const me: Me | null = ready && authenticated && seed ? { seed, letter: avatarLetter(seed) } : null;
  // Пока Privy поднимается, верим подсказке с прошлого входа: иначе по
  // нажатию на аватар на миг мелькал «Log in».
  const [hint, setHint] = useState<Me | null>(null);
  useEffect(() => setHint(readMe()), []);
  const shown = me ?? (!ready ? hint : null);
  const account: Account = shown ? { label: "Profile", href: "/app", me: shown } : { label: "Log in", onClick: login };
  // Подсказка для шапки лендинга: там Privy нет, и без неё был бы «Log in».
  useEffect(() => {
    if (!ready) return;
    saveMe(me);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, me?.seed, me?.letter]);
  const thing = view && typeof view === "object" ? view.thing : null;

  return (
    <main className="app app-v2">
      <div className={thing ? "v2 v2-wide" : "v2"}>
        <Top account={account} />
        {linked === "failed" && (
          <p className="bad banner">
            Could not reach the database. Bidding is off until it is back.
          </p>
        )}

        {/* Пока не ясно, что показывать, место под содержимое держим: иначе
            подвал вставал сразу под шапкой и мигал второй шапкой. */}
        {view === null && <div className="ym-wait" />}
        {thing && <ListingAuction thingId={thing} onBack={() => window.location.assign("/auctions")} />}
        {view === "shirt" && <Auction />}
        {view === "you" &&
          (capture ? (
            <section className="screen">
              <PhoneCapture
                secret={capture}
                onClose={() => {
                  setCapture(null);
                  window.history.replaceState(null, "", window.location.pathname);
                }}
              />
            </section>
          ) : // Пока Privy не готов, не показываем ни вход, ни кабинет: иначе
          // вошедшему на миг мелькнёт «Sign in», пока не подтвердится сессия.
          !ready ? (
            <div className="ym-wait" />
          ) : authenticated ? (
            <You onOpenAuction={openAuction} linked={linked === "ready"} />
          ) : (
            <Guest onSignIn={login} />
          ))}
        <Foot />
      </div>
    </main>
  );
}

/** Кабинет до входа: зачем входить и кнопка. */
function Guest({ onSignIn }: { onSignIn: () => void }) {
  return (
    <section className="ym-guest">
      <h1>Your logo, on real things.</h1>
      <p>Sign in to bid, see where your logo went and what comes back when someone outbids you.</p>
      <button type="button" className="v2-btn dark" onClick={onSignIn}>
        Sign in
      </button>
    </section>
  );
}
