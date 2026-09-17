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
 */

type App = {
  name: string;
  /** Фирменный цвет: по нему кошелёк узнают быстрее, чем по названию. */
  color: string;
  browse: string;
  mark: React.ReactNode;
};

const IN_APP: App[] = [
  {
    name: "Phantom",
    color: "#ab9ff2",
    browse: "https://phantom.app/ul/browse/",
    // Привидение: купол и волна снизу.
    mark: (
      <path d="M4 13.2a8 8 0 0116 0V19l-2.7-1.6L14.6 19l-2.6-1.6L9.4 19l-2.7-1.6L4 19z" />
    ),
  },
  {
    name: "Solflare",
    color: "#fc7227",
    browse: "https://solflare.com/ul/v1/browse/",
    // Вспышка: луч с ядром.
    mark: (
      <>
        <circle cx="12" cy="12" r="3.4" />
        <path d="M12 2.6v3.2M12 18.2v3.2M2.6 12h3.2M18.2 12h3.2M5.6 5.6l2.2 2.2M16.2 16.2l2.2 2.2M18.4 5.6l-2.2 2.2M7.8 16.2l-2.2 2.2" />
      </>
    ),
  },
  {
    name: "Backpack",
    color: "#e33e3f",
    browse: "https://backpack.app/ul/v1/browse/",
    // Рюкзак: корпус, ручка сверху, карман поперёк. Без кармана и ручки
    // силуэт читался как арка, а не как сумка.
    mark: (
      <>
        <path d="M6 9.5h12a1.5 1.5 0 011.5 1.5v7.5a1.5 1.5 0 01-1.5 1.5H6a1.5 1.5 0 01-1.5-1.5V11A1.5 1.5 0 016 9.5z" />
        <path d="M9 9.5V8a3 3 0 016 0v1.5" />
        <path d="M8 15.2h8" />
      </>
    ),
  },
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
            style={{ ["--brand" as string]: app.color }}
            href={`${app.browse}${encodeURIComponent(page)}?ref=${ref}`}
          >
            <span className="wallet-app-mark" aria-hidden>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {app.mark}
              </svg>
            </span>
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
