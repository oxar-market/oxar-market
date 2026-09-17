"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import { CLUSTER_URL } from "@/lib/stream.ts";
import { OrdersPanel } from "./OrdersPanel";
import { PayoutPanel } from "./PayoutPanel";

/**
 * Всё, что работает с кошельком, живёт под этой крышей.
 *
 * Список кошельков пустой намеренно: современные кошельки объявляют себя сами
 * по Wallet Standard, и адаптер подхватывает любой установленный - Phantom,
 * Solflare, Backpack, что угодно. Перечислять их руками значит обновлять
 * список каждый раз, когда появляется новый.
 *
 * Провайдеры смонтированы здесь, а не над всем столом, и весь файл грузится
 * по требованию: иначе триста килобайт адаптера уехали бы в общий бандл ради
 * экрана, который открывают единицы.
 *
 * autoConnect включён: разрешение уже дали, спрашивать на каждой перезагрузке
 * незачем.
 */

export type DeskProps =
  | { kind: "orders"; onWaitlist: () => void }
  | { kind: "payout"; sellerId: string; saved: string | null };

export default function WalletDesk(props: DeskProps) {
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={CLUSTER_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {props.kind === "orders" ? (
            <OrdersPanel onWaitlist={props.onWaitlist} />
          ) : (
            <PayoutPanel sellerId={props.sellerId} saved={props.saved} />
          )}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
