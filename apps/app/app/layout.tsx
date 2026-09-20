import type { Metadata } from "next";
import { Anybody } from "next/font/google";
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
const anybody = Anybody({
  subsets: ["latin"],
  variable: "--font-anybody",
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
    <html lang="en" className={anybody.variable}>
      <body>
        <Login>{children}</Login>
      </body>
    </html>
  );
}
