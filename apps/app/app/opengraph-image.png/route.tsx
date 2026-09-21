import { readFileSync } from "node:fs";
import { join } from "node:path";
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
 * Файлы лежат рядом, а не тянутся из Google Fonts. Сначала тянулись, и на этом
 * деплой прода встал: ответа не было, таймаута у запроса тоже, и сборка
 * провисела девять минут вместо полутора, пока её не сняли.
 *
 * Своя копия на каждое приложение, а не общая: сборки у них раздельные, и
 * лазить из одной в чужой каталог дороже, чем держать по файлу. В
 * `packages/core` шрифту тем более не место.
 */
function bricolage(file: string): Buffer {
  return readFileSync(join(process.cwd(), "app/opengraph-image.png", file));
}

export function GET() {
  const regular = bricolage("Bricolage-Regular.ttf");
  const bold = bricolage("Bricolage-Bold.ttf");

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
