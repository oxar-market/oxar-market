import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OXAR",
  description: "Auctions for ad spots on things people carry.",
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
