import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

/**
 * Свой шрифт вместо системного.
 *
 * Системный стек рисовал страницу по-разному у разных людей: на маке SF Pro,
 * на Windows Segoe UI, на Android Roboto. Для страницы из четырёх предметов,
 * где половина впечатления держится на буквах, это значило четыре разных
 * первых впечатления.
 *
 * Файл шрифта уезжает в нашу сборку, а не тянется с домена Google: сторонний
 * домен пришлось бы открывать в CSP, и он же видел бы каждого нашего
 * посетителя.
 */
const oxar = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-oxar",
  display: "swap",
});

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
    <html lang="en" className={oxar.variable}>
      <body>{children}</body>
    </html>
  );
}
