import type { Metadata } from "next";
import "../v2.css";
import { All } from "./all.tsx";

export const metadata: Metadata = {
  title: "OXAR - all auctions (prototype)",
  robots: { index: false },
};

export default function Page() {
  return <All />;
}
