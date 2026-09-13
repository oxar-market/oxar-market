import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OXAR - if people look at it, it's ad space",
  description:
    "OXAR is a marketplace for ad space on anything people look at. List a surface you control with a price and a date range, and buyers book it in USDC escrow that pays out only for the time it is actually up.",
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
