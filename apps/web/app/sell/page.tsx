import type { Metadata } from "next";
import { Sell } from "./sell.tsx";

export const metadata: Metadata = {
  title: "Sell a spot - OXAR",
  description: "Got something people look at? Mark the spots, set starting prices, get paid once the logos are up.",
};

export default function Page() {
  return <Sell />;
}
