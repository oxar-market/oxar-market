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
 * Лист тот же, что у лендинга: белый, метка в правом верхнем углу, строка в
 * левом нижнем, гравюра между ними выцвечена до шёпота. Две ссылки ведут в
 * одно место, и превью у них должны быть одной породы.
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
 * Что нужно карточке, лежит рядом с ней: два начертания шрифта, метка и
 * гравюра. Из сети при сборке не берётся ничего - сетевому запросу в пути
 * выкатки не место.
 *
 * Своя копия на каждое приложение, а не общая: сборки у них раздельные, и
 * лазить из одной в чужой каталог дороже, чем держать по файлу.
 */
function local(file: string): Buffer {
  return readFileSync(join(process.cwd(), "app/opengraph-image.png", file));
}

/** Картинка въезжает в разметку строкой: сам рисовальщик за файлами не ходит. */
function png(file: string): string {
  return `data:image/png;base64,${local(file).toString("base64")}`;
}

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "#fbfbf9",
          color: "#16181d",
          fontFamily: "Bricolage",
        }}
      >
        {/* Обведённый пунктиром вагон на гравюре - то же самое, что место на
            футболке: если на это смотрят, это рекламное место.

            Чарльз Магнус, «Chatham Square Elevated Railroad Crossing»,
            Нью-Йорк, 1850-1900. Met Open Access, общественное достояние. */}
        <img
          src={png("engraving.png")}
          width={1200}
          height={630}
          style={{ position: "absolute", left: 0, top: 0, opacity: 0.12 }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            height: "100%",
            padding: 64,
          }}
        >
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <img src={png("mark.png")} width={100} height={143} />
          </div>

          {/* Строка короче той, что стоит во вкладке About, и это не потеря:
              в одну строку на карточке влезает правило, а не его пересказ.
              Длинная переносилась бы и перестала быть однострочником. */}
          <div style={{ display: "flex", fontSize: 54, letterSpacing: -1 }}>
            The highest bid gets printed.
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Bricolage",
          data: local("Bricolage-Regular.ttf"),
          weight: 400,
          style: "normal",
        },
        {
          name: "Bricolage",
          data: local("Bricolage-Bold.ttf"),
          weight: 700,
          style: "normal",
        },
      ],
    },
  );
}
