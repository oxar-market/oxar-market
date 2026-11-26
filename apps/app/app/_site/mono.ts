import { JetBrains_Mono } from "next/font/google";

/**
 * Моноширинный шрифт витрины: главная и How it works целиком на нём, как
 * каталог работ, а не рекламный лендинг. Файл уезжает в нашу сборку, как и
 * Inter: сторонний домен пришлось бы открывать в CSP.
 */
export const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});
