"use client";

import { useEffect, useState } from "react";
import { useLogin, usePrivy } from "@privy-io/react-auth";
import { avatarLetter } from "@oxar/core";
import type { Account } from "./header.tsx";
import { readMe, saveMe, type Me } from "./me.ts";

/**
 * Шапка на странице, где есть Privy: вошёл - кошелёк, нет - Connect wallet,
 * который открывает окно Privy прямо здесь. Пока Privy поднимается, верим
 * подсказке с прошлого входа, чтобы кнопка не мигала. Вход и выход здесь
 * обновляют подсказку и для витрины без Privy.
 */
export function usePrivyAccount(): Account {
  const { ready, authenticated, user, logout } = usePrivy();
  const { login } = useLogin();
  const [hint, setHint] = useState<Me | null>(null);
  useEffect(() => setHint(readMe()), []);

  const seed = user?.wallet?.address ?? user?.email?.address ?? null;
  const wallet = user?.wallet?.address ?? null;
  // Своя картинка профиля - из подсказки, если она того же человека: читать
  // профиль из базы ради кружка в шапке незачем.
  const img = hint && hint.seed === seed ? (hint.img ?? null) : null;
  // Пункт Admin - так же из подсказки того же человека: is_admin спрашивают
  // кабинет и админка, шапке хватает их ответа.
  const admin = hint && hint.seed === seed ? hint.admin : undefined;
  const me: Me | null = ready && authenticated && seed ? { seed, letter: avatarLetter(seed), img, wallet, admin } : null;

  useEffect(() => {
    if (ready) saveMe(me);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, me?.seed, me?.wallet, me?.admin]);

  return { me: me ?? (!ready ? hint : null), onConnect: login, onDisconnect: () => void logout() };
}
