"use client";

import { useEffect, useState } from "react";
import { useLinkAccount, usePrivy } from "@privy-io/react-auth";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/push";
import { loadNotifySettings, saveNotifySetting, type NotifySettings } from "@/lib/notify";

/**
 * Уведомления на вкладке You: почта, письма и пуш на этом устройстве.
 *
 * Почту привязывает Privy: он сам шлёт код и проверяет адрес, а мы получаем
 * его уже подтверждённым. Своей проверки не строим и чужого адреса не храним.
 */
export function Notifications() {
  const { user, updateEmail } = usePrivy();
  const email = user?.email?.address ?? null;
  // Окно Privy на занятой почте пишет «Authentication failed» - это их экран,
  // его не поменять. Поэтому после него объясняем сами, что случилось.
  const [linkProblem, setLinkProblem] = useState("");
  const { linkEmail } = useLinkAccount({
    onSuccess: () => setLinkProblem(""),
    onError: (error) => {
      if (error === "exited_link_flow") return;
      setLinkProblem(
        error === "linked_to_another_user"
          ? "That email already signs in to its own OXAR account, so it can't be added to this one. Sign in with that email instead, or add a different one here."
          : "The email was not added. Try again.",
      );
    },
  });

  const [settings, setSettings] = useState<NotifySettings | null>(null);
  const [push, setPush] = useState<PushState>("unsupported");
  useEffect(() => {
    void loadNotifySettings().then(setSettings);
    void pushState().then(setPush);
  }, [email]);

  async function flip(column: "email_on" | "email_outbid", key: "emailOn" | "emailOutbid") {
    if (!settings) return;
    const next = !settings[key];
    setSettings({ ...settings, [key]: next });
    if (!(await saveNotifySetting(column, next))) setSettings(settings);
  }

  // Строки и переключатели - в материале кабинета (you.css): одна строка
  // почты, под ней тумблеры, без своей рамки и заголовка.
  return (
    <div>
      <div className="yo-kv">
        <span className="yo-mute">Email</span>
        {email ? <span className="yo-cut">{email}</span> : <span className="yo-mute">Not added</span>}
        <button type="button" className="yo-link yo-up" onClick={email ? updateEmail : linkEmail}>
          {email ? "Change" : "Add"}
        </button>
      </div>
      {!email && (
        <p className="yo-mute yo-note">
          So you hear about outbids, wins and the 72-hour proof check when this tab is closed. Use one you don&apos;t
          already sign in to OXAR with.
        </p>
      )}
      {linkProblem && <p className="yo-bad">{linkProblem}</p>}

      {email && settings && (
        <>
          <OnOff
            label="Email me"
            hint="Wins, proof checks and outbids"
            on={settings.emailOn}
            onFlip={() => flip("email_on", "emailOn")}
          />
          {settings.emailOn && (
            <OnOff
              label="Email when outbid"
              on={settings.emailOutbid}
              onFlip={() => flip("email_outbid", "emailOutbid")}
            />
          )}
        </>
      )}

      {push !== "unsupported" && (
        <OnOff
          label="Push on this device"
          hint={push === "denied" ? "Blocked for this site in the browser settings" : undefined}
          on={push === "on"}
          disabled={push === "denied"}
          onFlip={() => void (push === "on" ? disablePush() : enablePush()).then(setPush)}
        />
      )}
    </div>
  );
}

function OnOff({
  label,
  hint,
  on,
  disabled,
  onFlip,
}: {
  label: string;
  hint?: string;
  on: boolean;
  disabled?: boolean;
  onFlip: () => void;
}) {
  return (
    <button type="button" role="switch" aria-checked={on} className="yo-toggle" disabled={disabled} onClick={onFlip}>
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <span className="yo-sw" />
    </button>
  );
}

/**
 * Подсказка «нет почты» там, где без неё теряют деньги или место: пуш живёт
 * только на одном устройстве и молчит, если уведомления запретили.
 */
export function NoEmailHint({ text }: { text: string }) {
  const { user, authenticated } = usePrivy();
  const { linkEmail } = useLinkAccount();
  if (!authenticated || user?.email?.address) return null;
  return (
    <p className="role-note">
      {text}{" "}
      <button type="button" className="link" onClick={linkEmail}>
        Add email
      </button>
    </p>
  );
}
