import type { Metadata } from "next";
import { Menbere } from "next/font/google";
import "./globals.css";

// Шрифт продукта. Вариативный, веса от 100 до 700 берутся из одного файла.
// Файл скачивается при сборке и раздаётся с нашего домена: запроса к Google из
// браузера нет.
//
// Курсива у Menbere нет вовсе - только прямое начертание. Поэтому цитату
// отличаем не наклоном, а рамкой и фоном: наклон браузер нарисовал бы сам,
// сдвинув буквы, и выглядело бы это подделкой.
const menbere = Menbere({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-menbere",
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
    <html lang="en" className={menbere.variable}>
      <body>{children}</body>
    </html>
  );
}
