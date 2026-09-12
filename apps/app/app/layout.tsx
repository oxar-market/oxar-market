import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OXAR - marketplace",
  description: "Buy and sell ad placements on X profiles. Paid in USDC on Solana.",
  robots: { index: false, follow: false },
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
