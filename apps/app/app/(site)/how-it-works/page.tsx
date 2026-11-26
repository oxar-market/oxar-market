import type { Metadata } from "next";
import { How } from "../../_site/how.tsx";

export const metadata: Metadata = {
  title: "How it works - OXAR",
  description: "Six steps from a spot on a thing to a community getting paid. Your money waits in escrow until the photo is up.",
};

export default function Page() {
  return <How />;
}
