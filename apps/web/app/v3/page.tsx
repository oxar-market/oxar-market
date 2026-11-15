import type { Metadata } from "next";
import "../v2/v2.css";
import "./v3.css";
import { Drops } from "./drops.tsx";

export const metadata: Metadata = {
  title: "OXAR - prototype v3",
  robots: { index: false },
};

export default function Page() {
  return <Drops />;
}
