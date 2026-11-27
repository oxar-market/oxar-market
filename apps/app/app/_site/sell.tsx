"use client";

import { useEffect, useState } from "react";
import { useLogin, usePrivy } from "@privy-io/react-auth";
import { formatUsd, shortWallet } from "@oxar/core";
import { applyAsSeller, myApplication, type Application } from "@/lib/applications";
import { amISeller } from "@/lib/seller";
import { useDbSession } from "@/lib/use-session";
import { FOLLOW, load, localCopy, type Auction } from "./data.ts";
import { Header } from "./header.tsx";
import { mono } from "./mono.ts";
import { FEE } from "./pitch.tsx";
import { usePrivyAccount } from "./use-account.ts";
import "./sell.css";

/**
 * /sell - страница и заявка разом: слева зачем, справа форма. Кабинета
 * продавца в первой версии нет: торг готовим мы вместе с ним, поэтому
 * человек только рассказывает, что у него есть, а дальше пишем мы.
 *
 * Заявка - строка seller_applications от вошедшего (RLS: только за себя).
 * Не вошёл - «Sign in and send»: окно Privy, после входа заявка уходит сама,
 * набранное не теряется. Заявка одна на аккаунт (ключ - user_id), поэтому
 * продавцу вторую не подать - ему ссылка написать нам в X.
 */

const STEPS: [string, string][] = [
  ["Tell us what it is", "Two minutes. What people see, how many, when."],
  ["We build the auction with you", "Spots, starting prices, dates, a 3D model. You check it and sign once."],
  [
    "Brands bid, you print and post",
    "You get the winning logos to print, post a photo of the thing in use, and each spot pays out.",
  ],
];

/** Поля «что» и «сколько и когда» уходят в about одной строкой каждое - вместе не длиннее 500. */
const LOOK_MAX = 300;
const WHEN_MAX = 199;

export function Sell() {
  const { ready, authenticated, user } = usePrivy();
  const account = usePrivyAccount();
  const linked = useDbSession();
  const wallet = user?.wallet?.address ?? null;

  // Сделанное - только закрытые торги, где деньги дошли: вернувшиеся не в счёт.
  const [done, setDone] = useState<Auction[]>([]);
  useEffect(() => {
    void load().then((data) => setDone((data?.auctions ?? []).filter((one) => one.status === "sold" && !one.refunded)));
  }, []);

  // undefined - ещё не знаем (не вошёл или база не ответила).
  const [mine, setMine] = useState<Application | null | undefined>(undefined);
  const [seller, setSeller] = useState(false);
  useEffect(() => {
    setMine(undefined);
    setSeller(false);
    if (linked !== "ready") return;
    let live = true;
    void Promise.all([myApplication(), amISeller()]).then(([application, yes]) => {
      if (!live) return;
      setSeller(yes);
      setMine(application);
    });
    return () => {
      live = false;
    };
  }, [linked]);

  const [look, setLook] = useState("");
  const [when, setWhen] = useState("");
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "failed">("idle");
  // Нажал «Sign in and send»: отправим, как только вход дойдёт до базы.
  const [pending, setPending] = useState(false);
  // Без колбэков: useLogin с onError падает на сборке, где ключа Privy нет (CI).
  const { login } = useLogin();

  useEffect(() => {
    if (!pending || linked !== "ready" || mine === undefined) return;
    setPending(false);
    // Уже подавал или уже продавец - вторую заявку база не примет: покажем, что есть.
    if (mine !== null || seller) return;
    setState("sending");
    void (async () => {
      const ok = await applyAsSeller({ contact, about: `${look.trim()}\n${when.trim()}`, wallet });
      if (!ok) return setState("failed");
      setMine(await myApplication());
      setState("idle");
    })();
  }, [pending, linked, mine, seller, contact, look, when, wallet]);

  const filled = look.trim() !== "" && when.trim() !== "" && contact.trim() !== "";
  // Закрыл окно входа, не войдя, - кнопка снова доступна; вошёл - ждём отправки.
  const busy = (pending && authenticated) || state === "sending";

  return (
    <div className={`lsp ${mono.className}`}>
      <Header account={account} />
      <main className="lsp-main">
        <div>
          <span className="lsp-up lsp-mute">List a spot</span>
          <h1>People look at your thing. Brands pay to be on it.</h1>
          <p className="lsp-lead lsp-mute">
            A shirt your team wears on stage, a van on a road trip, a run club banner. Tell us what it is. We set up the
            auction with you, brands bid on the spots, and you get paid once the photo with their logos is up.
          </p>

          <div className="lsp-steps">
            {STEPS.map(([title, text], at) => (
              <div key={title}>
                <span className="lsp-mute">{String(at + 1).padStart(2, "0")}</span>
                <span>
                  <b>{title}</b>
                  <span className="lsp-mute">{text}</span>
                </span>
              </div>
            ))}
          </div>

          <div className="lsp-facts">
            <div>
              <b>$0</b>
              <span className="lsp-mute lsp-up">Upfront</span>
            </div>
            <div>
              <b>{Math.round(FEE * 100)}%</b>
              <span className="lsp-mute lsp-up">Only on sold spots</span>
            </div>
            <div>
              <b>1 day</b>
              <span className="lsp-mute lsp-up">To hear back</span>
            </div>
          </div>

          {done.length > 0 && (
            <div className="lsp-done">
              <span className="lsp-up lsp-mute">Done so far</span>
              {done.map((one) => {
                const logo = Object.values(one.won)[0];
                return (
                  <a key={one.id} className="lsp-done-r" href={`/auction?thing=${one.id}`}>
                    <span className="lsp-pic">
                      {logo && <img src={localCopy(logo.url) ?? logo.url} alt="" loading="lazy" />}
                    </span>
                    <span>
                      {one.title}
                      <br />
                      <span className="lsp-mute">
                        {one.owner} · {one.spots} {one.spots === 1 ? "spot" : "spots"}
                      </span>
                    </span>
                    <span>{formatUsd(one.raisedCents)}</span>
                  </a>
                );
              })}
            </div>
          )}
        </div>

        <div className="lsp-form">
          {seller ? (
            <div>
              <h2>List another thing</h2>
              <p className="lsp-mute">
                You already sell with us. Tell us about the next thing and we set it up with you, like the last one.
              </p>
              <a className="lsp-btn lsp-up" href={FOLLOW} target="_blank" rel="noreferrer">
                Message us on X
              </a>
              <p className="lsp-note lsp-mute">
                Your auctions are in your{" "}
                <a className="lsp-link" href="/app?tab=sales">
                  profile, under Sales
                </a>
                .
              </p>
            </div>
          ) : mine ? (
            <Sent application={mine} />
          ) : authenticated && mine === undefined && !pending && linked !== "failed" ? (
            // Вошёл, но база ещё не сказала, подавал ли он: форму не мигаем.
            <p className="lsp-mute">Checking your account</p>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!filled || busy) return;
                setState("idle");
                setPending(true);
                if (!authenticated) login();
              }}
            >
              <h2>Tell us about it</h2>
              <p className="lsp-mute">We reply within a day.</p>
              <label className="lsp-fld">
                <span className="lsp-up lsp-mute">What do people look at?</span>
                <textarea
                  value={look}
                  maxLength={LOOK_MAX}
                  rows={2}
                  placeholder="Our run club banner at the Sunday start line"
                  onChange={(event) => setLook(event.target.value)}
                />
              </label>
              <label className="lsp-fld">
                <span className="lsp-up lsp-mute">How many, and when?</span>
                <input
                  value={when}
                  maxLength={WHEN_MAX}
                  placeholder="About 300 runners, every Sunday in December"
                  onChange={(event) => setWhen(event.target.value)}
                />
              </label>
              <label className="lsp-fld">
                <span className="lsp-up lsp-mute">Your X or Telegram</span>
                <input
                  value={contact}
                  maxLength={200}
                  placeholder="@handle"
                  onChange={(event) => setContact(event.target.value)}
                />
              </label>
              <button type="submit" className="lsp-btn lsp-up" disabled={!filled || busy}>
                {busy ? "Sending…" : ready && authenticated ? "Send" : "Sign in and send"}
              </button>
              {state === "failed" && <p className="lsp-note lsp-red">Could not send. Try again.</p>}
              {linked === "failed" && <p className="lsp-note lsp-red">Could not reach the database. Try again in a minute.</p>}
              <p className="lsp-note lsp-mute">
                {ready && authenticated
                  ? wallet
                    ? `Signed in as ${shortWallet(wallet)}. Payouts go to this wallet.`
                    : "Signed in. Payouts go to the wallet on this account."
                  : "With a wallet or an email. No wallet yet? Signing in makes one, and payouts go there."}
              </p>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

/** Заявка уже ушла: что в ней и что с ней. */
function Sent({ application }: { application: Application }) {
  const thing = application.about?.split("\n")[0]?.trim();
  return (
    <div>
      <span className="lsp-up lsp-mute">Request sent</span>
      <b className="lsp-sent">
        {application.status === "declined"
          ? "We could not take this one on this time."
          : application.status === "approved"
            ? "Approved. We are setting up your auction with you."
            : "Got it. We will message you within a day."}
      </b>
      {thing && (
        <div className="lsp-kv">
          <span className="lsp-mute">Thing</span>
          <span>{thing}</span>
        </div>
      )}
      <div className="lsp-kv">
        <span className="lsp-mute">Contact</span>
        <span>{application.contact}</span>
      </div>
      <div className="lsp-kv">
        <span className="lsp-mute">Sent</span>
        <span>{new Date(application.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
      </div>
      <div className="lsp-kv">
        <span className="lsp-mute">Status</span>
        <span className={application.status === "declined" ? "lsp-red" : undefined}>
          {application.status === "waiting" ? "Waiting" : application.status === "approved" ? "Approved" : "Not approved"}
        </span>
      </div>
      <p className="lsp-note lsp-mute">When the auction is ready, it shows up in your profile under Sales.</p>
    </div>
  );
}
