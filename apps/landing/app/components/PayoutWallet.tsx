"use client";

import dynamic from "next/dynamic";

/** Кошелёк выплат. Граница загрузки, как и у кабинета покупателя. */
const WalletDesk = dynamic(() => import("./wallet/WalletDesk"), {
  ssr: false,
  loading: () => <p className="muted small">Loading…</p>,
});

export function PayoutWallet({
  sellerId,
  saved,
}: {
  sellerId: string;
  saved: string | null;
}) {
  return <WalletDesk kind="payout" sellerId={sellerId} saved={saved} />;
}
