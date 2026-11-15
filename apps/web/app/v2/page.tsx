import type { Metadata } from "next";
import "./v2.css";
import { Landing } from "./landing.tsx";

export const metadata: Metadata = {
  title: "OXAR - prototype",
  robots: { index: false },
};

export default function Page() {
  return <Landing />;
}
