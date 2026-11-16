import type { Metadata } from "next";
import "../../_site/site.css";
import { All } from "../../_site/all.tsx";

export const metadata: Metadata = {
  title: "Auctions - OXAR",
  description: "Every OXAR auction: live, next and past.",
};

export default function Page() {
  return <All />;
}
