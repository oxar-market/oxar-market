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
  const { linkEmail } = useLinkAccount();

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

  return (
    <div className="role-card">
      <span className="wallet-title">Notifications</span>

      {email ? (
        <div className="addr-box">
          <span>{email}</span>
          <button type="button" className="ghost small" onClick={updateEmail}>
            Change
          </button>
        </div>
      ) : (
        <>
          <p className="role-note">
            Add an email so you hear about outbids, wins and the 72-hour proof check even when this
            tab is closed.
          </p>
          <button type="button" className="ghost small" onClick={linkEmail}>
            Add email
          </button>
        </>
      )}

      {email && settings && (
        <>
          <OnOff label="Email me" on={settings.emailOn} onFlip={() => flip("email_on", "emailOn")} />
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
          on={push === "on"}
          disabled={push === "denied"}
          onFlip={() => void (push === "on" ? disablePush() : enablePush()).then(setPush)}
        />
      )}
      {push === "denied" && (
        <p className="role-note">Notifications are blocked for this site in the browser settings.</p>
      )}
    </div>
  );
}

function OnOff({ label, on, disabled, onFlip }: { label: string; on: boolean; disabled?: boolean; onFlip: () => void }) {
  return (
    <div className="theme-row">
      <span className="muted">{label}</span>
      <div className="role-toggle slim">
        {([true, false] as const).map((one) => (
          <button
            key={String(one)}
            type="button"
            className={on === one ? "role-tab on" : "role-tab"}
            disabled={disabled}
            onClick={() => on !== one && onFlip()}
          >
            {one ? "On" : "Off"}
          </button>
        ))}
      </div>
    </div>
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
