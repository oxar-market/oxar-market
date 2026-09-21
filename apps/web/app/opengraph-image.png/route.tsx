import { ImageResponse } from "next/og";

/**
 * Картинка, которую показывают вместо голой ссылки в твиттере и телеграме.
 *
 * Рисуется при сборке и уезжает в статику обычным файлом: серверного кода у
 * лендинга нет. Поэтому ни данных из базы, ни времени здесь быть не может -
 * всё, что попало в картинку, вмёрзло в неё до следующей сборки.
 *
 * Рамка на карточке - та же, что на футболке и на гравюре по бокам страницы:
 * обведённый прямоугольник и есть рекламное место. Она объясняет, чем мы
 * торгуем, раньше, чем человек дочитает строку.
 *
 * Лежит обычным маршрутом с `.png` в имени, а не готовым `opengraph-image.tsx`,
 * из-за хостинга. Тот кладёт в статику файл вовсе без расширения, а Cloudflare
 * Pages берёт тип содержимого как раз из расширения и отдаёт такой файл не
 * картинкой. Рядом с нашим же `X-Content-Type-Options: nosniff` это значит
 * пустое превью у всех: чужой сервер не гадает, он верит типу.
 */

/** Картинка одна на все времена, поэтому считается при сборке, а не по
    запросу. Без этого слова статический экспорт отказывается собирать
    маршрут вовсе. */
export const dynamic = "force-static";

const size = { width: 1200, height: 630 };

/**
 * Наш шрифт в картинку.
 *
 * Тот же Bricolage Grotesque, что на странице. Превью видят чаще самого сайта
 * - его репостят, - и чужие буквы в нём читались бы как чужой бренд.
 *
 * `User-Agent` подставлен намеренно и именно такой. Google Fonts отдаёт
 * современным браузерам woff2, а рисовальщик картинки его не понимает; под
 * древним агентом приезжает ttf, который понимает.
 *
 * Сборка от этого зависит от сети, но зависела и раньше: шрифт страницы
 * приезжает оттуда же при каждой сборке.
 */
async function bricolage(weight: number): Promise<ArrayBuffer> {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@${weight}`,
    { headers: { "User-Agent": "Mozilla/5.0" } },
  ).then((answer) => answer.text());

  const url = css.match(/src: url\((https:[^)]+)\)/)?.[1];
  if (!url) throw new Error("Google Fonts ответил без ссылки на файл шрифта");

  return fetch(url).then((answer) => answer.arrayBuffer());
}

export async function GET() {
  const [regular, bold] = await Promise.all([bricolage(400), bricolage(700)]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fbfbf9",
          color: "#16181d",
          fontFamily: "Bricolage",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: 1000,
            height: 470,
            padding: "0 72px",
            border: "3px solid #16181d",
          }}
        >
          <div style={{ fontSize: 26, letterSpacing: 6, color: "#6b6b73" }}>
            AD SPOT
          </div>
          <div style={{ fontSize: 176, fontWeight: 700, letterSpacing: -6 }}>
            OXAR
          </div>
          <div style={{ fontSize: 42, marginTop: 20 }}>
            If people look at it, it&apos;s ad space.
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Bricolage", data: regular, weight: 400, style: "normal" },
        { name: "Bricolage", data: bold, weight: 700, style: "normal" },
      ],
    },
  );
}
