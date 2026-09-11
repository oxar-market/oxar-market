import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OXAR — rent out your profile as ad space",
  description:
    "Sell a specific spot on your X profile — avatar, banner, bio link, pinned post — for a specific number of days. Paid in USDC on Solana.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
