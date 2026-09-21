import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { Login } from "./providers";
import "./globals.css";

/**
 * Тот же шрифт, что на лендинге: человек приходит оттуда, и смена букв на
 * переходе читалась бы как другой сайт.
 *
 * Файл уезжает в нашу сборку, а не тянется с домена Google. В приложении это
 * не вкусовщина: CSP здесь строгий, `font-src 'self'`, и чужой домен пришлось
 * бы в него вписывать.
 */
const oxar = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-oxar",
  display: "swap",
});

/**
 * `metadataBase` обязателен: адрес картинки в превью читает чужой сервер, и
 * относительный путь ему ничего не говорит. Без него Next подставляет
 * localhost, и превью пустое у всех, кроме нас.
 *
 * Картинка названа руками: она лежит обычным маршрутом с `.png` в имени, а не
 * готовым `opengraph-image.tsx`, и сама себя в теги не пропишет. Почему именно
 * так - в самом маршруте.
 */
export const metadata: Metadata = {
  metadataBase: new URL("https://app.oxar.app"),
  title: "OXAR",
  description: "Auctions for ad spots on things people carry.",
  openGraph: {
    title: "OXAR",
    description: "The highest bid when the clock runs out is what gets printed.",
    url: "https://app.oxar.app",
    siteName: "OXAR",
    type: "website",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "OXAR - if people look at it, it's ad space",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "OXAR",
    description: "The highest bid when the clock runs out is what gets printed.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={oxar.variable}>
      <body>
        <Login>{children}</Login>
      </body>
    </html>
  );
}
