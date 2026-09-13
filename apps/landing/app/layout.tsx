import type { Metadata } from "next";
import { Anybody } from "next/font/google";
import "./globals.css";

// Шрифт продукта. Вариативный, поэтому все веса берутся из одного файла, и
// отдельные начертания подключать не нужно. Файл скачивается при сборке и
// раздаётся с нашего домена: запроса к Google из браузера нет.
const anybody = Anybody({
  subsets: ["latin"],
  // Курсив подключён настоящим начертанием: без него браузер наклоняет прямое
  // сам, и у шрифта с квадратными формами это видно сразу.
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-anybody",
});

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
    <html lang="en" className={anybody.variable}>
      <body>{children}</body>
    </html>
  );
}
