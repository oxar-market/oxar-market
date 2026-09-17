"use client";

import dynamic from "next/dynamic";

/**
 * Кабинет покупателя. Здесь только граница загрузки.
 *
 * Адаптер кошельков со своей модалкой весит сотни килобайт и нужен ровно двум
 * окнам. Если импортировать его обычным способом, он уедет в чанк страницы и
 * подорожает первый заход для всех, включая тех, кто никогда не платит.
 * Поэтому всё, что знает про кошелёк, лежит за этой границей.
 */
const WalletDesk = dynamic(() => import("./wallet/WalletDesk"), {
  ssr: false,
  loading: () => <p className="muted small">Loading…</p>,
});

export function MyOrders({ onWaitlist }: { onWaitlist: () => void }) {
  return <WalletDesk kind="orders" onWaitlist={onWaitlist} />;
}
