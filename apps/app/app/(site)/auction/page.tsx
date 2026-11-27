import type { Metadata } from "next";
import { AuctionView } from "../../_site/auction.tsx";

export const metadata: Metadata = {
  title: "Auction - OXAR",
  description: "How the auction went: the thing with its logos, every spot and who bid.",
};

export default function Page() {
  return <AuctionView />;
}
