import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import "@oxar/stage/stage.css";
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

/**
 * `metadataBase` обязателен: адрес картинки в превью читает чужой сервер, и
 * относительный путь ему ничего не говорит. Без него Next подставляет
 * localhost, и превью пустое у всех, кроме нас.
 *
 * Картинка названа руками: она лежит обычным маршрутом с `.png` в имени, а не
 * готовым `opengraph-image.tsx`, и сама себя в теги не пропишет. Почему именно
 * так - в самом маршруте.
 *
 * Твиттеру отдельной картинки не даём: без своей строки он берёт ту же по
 * `og:image`, и второй такой же файл ради одного тега не нужен.
 */
export const metadata: Metadata = {
  metadataBase: new URL("https://oxar.app"),
  title: "OXAR",
  description: "Auctions for ad spots on things people carry.",
  openGraph: {
    title: "OXAR",
    description: "If people look at it, it's ad space.",
    url: "https://oxar.app",
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
    description: "If people look at it, it's ad space.",
  },
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
