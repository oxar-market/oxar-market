/**
 * Чем человек вошёл: кошельком или почтой. Шапка You говорит именно это, а
 * не «есть ли почта»: вошедший кошельком привязывает почту позже, для писем,
 * и раньше шапка после этого врала «Signed in with email».
 *
 * Входов у нас два (providers.tsx), и внешний кошелёк попадает к человеку
 * только входом. Встроенный кошелёк Privy заводит вошедшим почтой - он
 * входом не считается.
 */
export type SignIn = { by: "wallet"; wallet: string } | { by: "email"; email: string };

type PrivyUser = {
  wallet?: { address: string; walletClientType?: string };
  email?: { address: string };
} | null;

export function signedInWith(user: PrivyUser): SignIn | null {
  const wallet = user?.wallet;
  if (wallet && wallet.walletClientType !== "privy") return { by: "wallet", wallet: wallet.address };
  if (user?.email) return { by: "email", email: user.email.address };
  if (wallet) return { by: "wallet", wallet: wallet.address };
  return null;
}
