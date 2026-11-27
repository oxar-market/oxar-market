import type { Metadata } from "next";
import { AuctionView } from "../../_site/auction.tsx";

/**
 * Страница торга - в группе приложения, а не витрины: идущий торг ставит
 * через Privy, а провайдер Privy стоит в корне группы (app). Главная и прочая
 * витрина остаются без него.
 */
export const metadata: Metadata = {
  title: "Auction - OXAR",
  description: "The thing with its logos, every spot and who bid. Live auctions take bids here.",
};

export default function Page() {
  return <AuctionView />;
}
