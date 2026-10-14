"use client";

import { useEffect, useState } from "react";
import { amIAdmin } from "@/lib/admin";
import { db } from "@/lib/session";

/**
 * Админ ли тот, кто смотрит. Решает база (is_admin), а не клиент; кнопки по
 * этому флагу - удобство, права на деньги он не даёт. Сессия базы заводится
 * после входа через Privy, поэтому перепроверяем на каждой её смене.
 */
export function useAdmin(): boolean {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    if (!db) return;
    const check = () => void amIAdmin().then(setAdmin);
    check();
    const { data } = db.auth.onAuthStateChange(() => check());
    return () => data.subscription.unsubscribe();
  }, []);
  return admin;
}
