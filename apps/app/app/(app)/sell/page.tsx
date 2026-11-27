import type { Metadata } from "next";
import { Sell } from "../../_site/sell.tsx";

/**
 * /sell - в группе приложения ради Privy: форма на странице и есть заявка,
 * а подать её можно только вошедшим.
 */
export const metadata: Metadata = {
  title: "List a spot - OXAR",
  description: "People look at your thing. Brands pay to be on it. Tell us what it is, and we set up the auction with you.",
};

export default function Page() {
  return <Sell />;
}
