"use client";

import { Header, type Account as HeaderAccount } from "./header.tsx";

/**
 * Шапка - общая для всех страниц, теперь это Header: How it works и кошелёк.
 * Top оставлен именем для страниц, которые уже его зовут.
 */
export type Account = HeaderAccount;

export function Top({ account }: { account?: Account }) {
  return <Header account={account} />;
}
