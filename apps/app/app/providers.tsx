"use client";

import { PrivyProvider } from "@privy-io/react-auth";

/**
 * Вход. Два пути намеренно.
 *
 * Кошелёк - для крипто-твиттера: у них уже стоит Phantom, и вход по почте для
 * них шаг назад. Почта - для брендов, которые придут позже и про кошельки
 * знать не хотят. Встроенный кошелёк заводится только тем, кто пришёл без
 * своего: подключившему Phantom второй кошелёк не нужен.
 */
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
        },
        embeddedWallets: {
          solana: { createOnLogin: "users-without-wallets" },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
