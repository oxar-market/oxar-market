"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { amIAdmin } from "@/lib/admin";
import { useDbSession } from "@/lib/use-session";
import { Header } from "../_site/header.tsx";
import { readMe, saveMe } from "../_site/me.ts";
import { mono } from "../_site/mono.ts";
import { usePrivyAccount } from "../_site/use-account.ts";
import { Admin } from "./admin.tsx";
import "./admin.css";

/**
 * Страница /admin: шапка сайта и админка. Кто админ - решает база
 * (is_admin), после входа через Privy и обмена токена на сессию. Остальным -
 * короткое «Admins only»: и без этой проверки база не отдала бы им ничего.
 */
export function AdminPage() {
  const { ready, authenticated } = usePrivy();
  const account = usePrivyAccount();
  const linked = useDbSession();
  const [admin, setAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    setAdmin(null);
    if (linked !== "ready") return;
    let live = true;
    void amIAdmin().then((yes) => {
      if (!live) return;
      setAdmin(yes);
      // Пункт Admin в меню шапки - и на страницах без Privy.
      const hint = readMe();
      if (hint) saveMe({ ...hint, admin: yes });
    });
    return () => {
      live = false;
    };
  }, [linked]);

  const me = account.me ? { ...account.me, admin: admin ?? account.me.admin } : null;

  return (
    <div className={`adm ${mono.className}`}>
      <Header account={{ ...account, me }} />
      <main className="adm-main">
        {!ready ? (
          <p className="adm-wait">Loading</p>
        ) : !authenticated ? (
          <Gate text="Sign in with an admin account to see this page.">
            <button type="button" className="adm-btn" onClick={account.onConnect}>
              Sign in
            </button>
          </Gate>
        ) : linked === "failed" ? (
          <Gate text="Could not reach the database. Try again in a minute." />
        ) : admin === null ? (
          <p className="adm-wait">Checking access</p>
        ) : !admin ? (
          <Gate text="This account is not an admin.">
            <a className="adm-link" href="/app">
              Back to profile
            </a>
          </Gate>
        ) : (
          <Admin />
        )}
      </main>
    </div>
  );
}

function Gate({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <div className="adm-gate">
      <h1>Admins only</h1>
      <p className="adm-mute">{text}</p>
      {children}
    </div>
  );
}
