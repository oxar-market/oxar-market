import type { Metadata } from "next";
import "../_site/site.css";
import { Owners } from "../_site/owners.tsx";

export const metadata: Metadata = {
  title: "Sell a spot - OXAR",
  description: "Got something people look at? Mark the spots, set starting prices, get paid once the logos are up.",
};

export default function Page() {
  return <Owners />;
}
