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
  // Адрес нужен для превью ссылки: картинку краулеры берут только по полному
  // адресу, а относительный путь в теге они не разворачивают.
  metadataBase: new URL("https://oxar.app"),
  title: "OXAR - if people look at it, it's ad space",
  description:
    "OXAR is a marketplace for ad space on anything people look at. List a surface you control with a price and a date range, and buyers book it in USDC escrow that pays out only for the time it is actually up.",
  // Карточка, которой ссылка разворачивается в X, Telegram, Discord, Slack. Это
  // один стандард на всех - Open Graph; заголовок и описание Next подставляет
  // сюда сам из полей выше, поэтому тут только то, чего в них нет.
  openGraph: {
    type: "website",
    siteName: "OXAR",
    // og:url тут нет намеренно: страницы файлов наследуют этот блок целиком, и
    // адрес главной оказался бы в карточке каждой из них. Платформы и без него
    // показывают тот адрес, по которому пришли.
    images: [
      {
        url: "/icons/og.png",
        width: 1200,
        height: 630,
        alt: "The OXAR desktop with a window open: if people look at it, it's ad space.",
      },
    ],
  },
  // У X поверх Open Graph свой тег, и нужен он ровно за одним: без него картинка
  // показывается мелким квадратом сбоку, а не во всю ширину карточки.
  twitter: {
    card: "summary_large_image",
  },
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
