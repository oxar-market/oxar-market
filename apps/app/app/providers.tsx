"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";

/**
 * Вход. Два пути намеренно.
 *
 * Кошелёк - для крипто-твиттера: у них уже стоит Phantom, и вход по почте для
 * них шаг назад. Почта - для брендов, которые придут позже и про кошельки
 * знать не хотят. Встроенный кошелёк заводится только тем, кто пришёл без
 * своего: подключившему Phantom второй кошелёк не нужен.
 */

// Без этого Privy не подключает коннекторы Solana и уводит в мобильную ссылку
// вида phantom.com/ul/browse - то есть предлагает открыть сайт внутри
// телефонного кошелька вместо того, чтобы поговорить с расширением в браузере.
const solanaConnectors = toSolanaWalletConnectors();

export function Login({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  // Без ключа приложение всё равно должно открываться: иначе сломанная
  // переменная окружения выглядит как белый экран без объяснений.
  if (!appId) return <>{children}</>;

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["wallet", "email"],
        appearance: {
          walletChainType: "solana-only",
          theme: "light",
          // Свой список вместо стандартного: по умолчанию Privy показывает
          // эфириумный набор - metamask, coinbase, rainbow, wallet_connect, -
          // которому на Solana делать нечего.
          //
          // detected_solana_wallets первым: сначала то, что реально стоит у
          // человека, и только потом три ходовых на случай, если не стоит
          // ничего. Длинный список кошельков читается как работа, а не как вход.
          walletList: [
            "detected_solana_wallets",
            "phantom",
            "solflare",
            "backpack",
          ],
        },
        externalWallets: { solana: { connectors: solanaConnectors } },
        embeddedWallets: {
          solana: { createOnLogin: "users-without-wallets" },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
