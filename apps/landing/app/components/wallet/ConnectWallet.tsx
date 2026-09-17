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
 * это как способ следить за человеком. Поэтому три известные ссылки и копия
 * адреса для всех остальных.
 */

const IN_APP = [
  { name: "Phantom", browse: "https://phantom.app/ul/browse/" },
  { name: "Solflare", browse: "https://solflare.com/ul/v1/browse/" },
  { name: "Backpack", browse: "https://backpack.app/ul/v1/browse/" },
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
      <span className="muted small">
        Mobile browsers cannot reach wallet apps. Open this page inside your wallet:
      </span>
      <span className="wallet-apps">
        {IN_APP.map((app) => (
          <a
            key={app.name}
            className="dock-item"
            href={`${app.browse}${encodeURIComponent(page)}?ref=${ref}`}
          >
            {app.name}
          </a>
        ))}
        <button
          type="button"
          className="dock-item"
          onClick={() => navigator.clipboard.writeText(page).then(() => setCopied(true))}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </span>
    </div>
  );
}
