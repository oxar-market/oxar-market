"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

/**
 * Кнопка подключения и запасной выход для телефона.
 *
 * На десктопе и внутри браузера самого кошелька всё решает Wallet Standard:
 * кошелёк объявляет себя, адаптер его находит, кнопка показывает список. В
 * обычном мобильном браузере объявлять себя некому - расширений там нет.
 * Android закрывает MWA (см. WalletDesk), а на iOS остаётся единственный путь:
 * открыть эту же страницу во встроенном браузере кошелька.
 *
 * Узнать, какие кошельки стоят на телефоне, из веба нельзя - браузеры закрыли
 * это как способ следить за человеком. Поэтому три известные плитки и копия
 * адреса для всех остальных.
 *
 * Иконки настоящие, из пакетов адаптеров этих же кошельков: там они лежат
 * base64-строкой и весят по килобайту. Свой рисунок на их месте выглядит
 * подделкой - кошелёк узнают по значку, а не по подписи.
 */

const IN_APP = [
  { name: "Phantom", icon: "/icons/wallets/phantom.svg", browse: "https://phantom.app/ul/browse/" },
  { name: "Solflare", icon: "/icons/wallets/solflare.svg", browse: "https://solflare.com/ul/v1/browse/" },
  { name: "Backpack", icon: "/icons/wallets/backpack.png", browse: "https://backpack.app/ul/v1/browse/" },
];

export function ConnectWallet() {
  const { wallets } = useWallet();
  const [page, setPage] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Ни одного кошелька и палец вместо мыши - значит мобильный браузер.
    const mobile = window.matchMedia("(pointer: coarse)").matches;
    setPage(wallets.length === 0 && mobile ? window.location.href : "");
  }, [wallets.length]);

  if (!page) return <WalletMultiButton />;

  const ref = encodeURIComponent(new URL(page).origin);

  return (
    <div className="wallet-mobile">
      <p className="muted small">
        A mobile browser cannot reach wallet apps. Open this page in your wallet
        and the connect button starts working.
      </p>

      <div className="wallet-apps">
        {IN_APP.map((app) => (
          <a
            key={app.name}
            className="wallet-app"
            href={`${app.browse}${encodeURIComponent(page)}?ref=${ref}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={app.icon} alt="" width={36} height={36} />
            {app.name}
          </a>
        ))}
      </div>

      <button
        type="button"
        className="wallet-copy"
        onClick={() => navigator.clipboard.writeText(page).then(() => setCopied(true))}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          {copied ? (
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          ) : (
            <>
              <rect x="9" y="9" width="11" height="11" rx="2.5" />
              <path d="M15 5.5A2.5 2.5 0 0012.5 3h-7A2.5 2.5 0 003 5.5v7A2.5 2.5 0 005.5 15" />
            </>
          )}
        </svg>
        {copied ? "Link copied" : "Copy the link for another wallet"}
      </button>
    </div>
  );
}
