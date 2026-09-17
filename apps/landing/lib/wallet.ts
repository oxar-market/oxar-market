"use client";

// Кошелёк в браузере.
//
// Здесь только Phantom, и это осознанно: тестируем на девнете вдвоём, а
// подключать набор адаптеров ради одного кошелька - лишние сотни килобайт в
// бандле, который и так везёт three.js. Когда понадобятся Solflare и Backpack,
// меняется этот файл целиком, а вызывающий код - нет: наружу торчат три
// функции и один тип.

/** То немногое, что нам нужно от провайдера кошелька. */
export type Wallet = {
  publicKey: { toBase58(): string } | null;
  signTransaction: (tx: unknown) => Promise<unknown>;
  signAllTransactions: (txs: unknown[]) => Promise<unknown[]>;
};

type Phantom = Wallet & {
  isPhantom?: boolean;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toBase58(): string } }>;
  disconnect: () => Promise<void>;
  on: (event: string, handler: () => void) => void;
};

function provider(): Phantom | null {
  if (typeof window === "undefined") return null;
  const injected = (window as unknown as {
    phantom?: { solana?: Phantom };
    solana?: Phantom;
  });
  const found = injected.phantom?.solana ?? injected.solana;
  return found?.isPhantom ? found : null;
}

export function walletInstalled(): boolean {
  return provider() !== null;
}

/**
 * Подключиться. `onlyIfTrusted` - это попытка восстановить прошлое разрешение
 * без всплывающего окна: на перезагрузке страницы спрашивать снова незачем.
 */
export async function connectWallet(onlyIfTrusted = false): Promise<string | null> {
  const phantom = provider();
  if (!phantom) return null;
  try {
    const { publicKey } = await phantom.connect({ onlyIfTrusted });
    return publicKey.toBase58();
  } catch {
    // Отказ в окне кошелька - это не ошибка приложения, а ответ «нет».
    return null;
  }
}

export async function disconnectWallet(): Promise<void> {
  await provider()?.disconnect();
}

/** Сам объект кошелька: им подписывает SDK Streamflow. */
export function currentWallet(): Wallet | null {
  const phantom = provider();
  return phantom?.publicKey ? phantom : null;
}

/** Пользователь сменил аккаунт прямо в кошельке - интерфейс должен догнать. */
export function onWalletChange(handler: () => void): void {
  provider()?.on("accountChanged", handler);
}
