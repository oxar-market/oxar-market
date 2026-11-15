import type { Metadata } from "next";
import "../v2.css";
import { Owners } from "./owners.tsx";

export const metadata: Metadata = {
  title: "Sell a spot - OXAR (prototype)",
  robots: { index: false },
};

export default function Page() {
  return <Owners />;
}
