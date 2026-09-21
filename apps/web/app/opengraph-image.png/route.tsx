import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * Картинка, которую показывают вместо голой ссылки в твиттере и телеграме.
 *
 * Рисуется при сборке и уезжает в статику обычным файлом: серверного кода у
 * лендинга нет. Поэтому ни данных из базы, ни времени здесь быть не может -
 * всё, что попало в картинку, вмёрзло в неё до следующей сборки.
 *
 * Белый лист, метка в правом верхнем углу, строка в левом нижнем, а между ними
 * гравюра, выцветшая до шёпота. Совсем белый прямоугольник в ленте читается не
 * как решение, а как картинка, которая не догрузилась; гравюра говорит, что
 * лист свой. Громче её делать нельзя: она фон, а не предмет.
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
 * Гравюра здесь отдельным png, хотя странице та же картинка служит в webp:
 * рисовальщик карточки webp не разбирает и падает на нём. Вырезан сразу тот
 * кусок, что виден, и вдвое мельче показанного - при такой прозрачности
 * резкость не нужна, а файл вдвое легче.
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
            футболке: если на это смотрят, это рекламное место. Гравюра старше
            нас на полтора века, а места на ней уже были.

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
          {/* Метка в правом верхнем углу: в ленте глаз идёт слева направо и
              упирается в неё, уже прочитав строку. */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <img src={png("mark.png")} width={100} height={143} />
          </div>

          <div style={{ display: "flex", fontSize: 54, letterSpacing: -1 }}>
            If people look at it, it&apos;s ad space.
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
