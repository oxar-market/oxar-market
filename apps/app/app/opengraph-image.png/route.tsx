import { ImageResponse } from "next/og";

/**
 * Картинка, которую показывают вместо голой ссылки на торг.
 *
 * Рисуется при сборке, поэтому живых чисел в ней быть не может: приложение
 * уезжает статикой, и сумма верхней ставки успела бы устареть раньше, чем
 * ссылку откроют. Карточка говорит правило торга - оно не меняется.
 *
 * Рамка - та же, что на лендинге и на самой футболке: обведённый
 * прямоугольник и есть рекламное место.
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
 * Повторяет такую же функцию на лендинге. В `packages/core` её не унести:
 * туда не идут запросы в сеть, и это правило важнее экономии десяти строк.
 *
 * `User-Agent` подставлен намеренно и именно такой. Google Fonts отдаёт
 * современным браузерам woff2, а рисовальщик картинки его не понимает; под
 * древним агентом приезжает ttf, который понимает.
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
            SPOTS UP FOR AUCTION
          </div>
          <div style={{ fontSize: 176, fontWeight: 700, letterSpacing: -6 }}>
            OXAR
          </div>
          <div style={{ fontSize: 42, lineHeight: 1.3, marginTop: 20 }}>
            The highest bid when the clock runs out is what gets printed.
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
