// Собирает питч-дек в Google Slides из scripts/deck-content.mjs.
// Запускать из корня: node scripts/slides-build.mjs
import { readFileSync } from "node:fs";
import { title, slides as content } from "./deck-content.mjs";

// Токены сайта, чтобы дек и oxar.app не выглядели как два разных проекта.
const FONT = "Menbere";
const FG = rgb("16161a");
const MUTED = rgb("6e6e76");
const ACCENT = rgb("1d4ed8");

// Слайд 16:9 в пунктах. Поле слева и справа одно на все слайды.
const W = 720;
const MARGIN = 64;
const COLUMN = W - MARGIN * 2;

function rgb(hex) {
  const n = parseInt(hex, 16);
  return {
    red: ((n >> 16) & 255) / 255,
    green: ((n >> 8) & 255) / 255,
    blue: (n & 255) / 255,
  };
}

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    }),
);

const auth = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN,
    grant_type: "refresh_token",
  }),
}).then((r) => r.json());

if (!auth.access_token) {
  console.error("Не удалось обменять refresh token:", auth);
  process.exit(1);
}

async function api(path, body) {
  const result = await fetch(`https://slides.googleapis.com/v1/presentations${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${auth.access_token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());

  if (result.error) {
    console.error("Slides API отказал:", result.error);
    process.exit(1);
  }
  return result;
}

// Текстовый блок: создать, налить текст, задать начертание. Отдельным запросом
// красим слово-акцент, если оно нашлось в строке.
function textBox(pageId, id, text, style) {
  const requests = [
    {
      createShape: {
        objectId: id,
        shapeType: "TEXT_BOX",
        elementProperties: {
          pageObjectId: pageId,
          size: {
            width: { magnitude: style.width, unit: "PT" },
            height: { magnitude: style.height, unit: "PT" },
          },
          transform: {
            scaleX: 1,
            scaleY: 1,
            translateX: MARGIN,
            translateY: style.top,
            unit: "PT",
          },
        },
      },
    },
    { insertText: { objectId: id, text } },
    {
      updateTextStyle: {
        objectId: id,
        style: {
          fontFamily: FONT,
          fontSize: { magnitude: style.size, unit: "PT" },
          foregroundColor: { opaqueColor: { rgbColor: style.color } },
          bold: style.bold ?? false,
        },
        textRange: { type: "ALL" },
        fields: "fontFamily,fontSize,foregroundColor,bold",
      },
    },
    {
      updateParagraphStyle: {
        objectId: id,
        style: {
          lineSpacing: style.lineSpacing,
          spaceBelow: { magnitude: style.spaceBelow ?? 0, unit: "PT" },
        },
        textRange: { type: "ALL" },
        fields: "lineSpacing,spaceBelow",
      },
    },
  ];

  const at = style.accent ? text.indexOf(style.accent) : -1;
  if (at >= 0) {
    requests.push({
      updateTextStyle: {
        objectId: id,
        style: { foregroundColor: { opaqueColor: { rgbColor: ACCENT } } },
        textRange: {
          type: "FIXED_RANGE",
          startIndex: at,
          endIndex: at + style.accent.length,
        },
        fields: "foregroundColor",
      },
    });
  }

  return requests;
}

// Кегль заголовка подбирается под длину: короткая мысль должна занимать слайд
// целиком, длинная - не вылезать за поля.
const headlineSize = (text) =>
  text.length <= 45 ? 46 : text.length <= 85 ? 36 : 30;

// Высота блока до того, как его увидит Google: блоки ставятся потоком сверху
// вниз, и без этого расчёта нижний наезжает на верхний. Ширина символа взята
// как половина кегля - для гротеска это близко к правде.
function blockHeight(text, { size, width, lineSpacing, spaceBelow = 0 }) {
  const perLine = Math.floor(width / (size * 0.52));
  const paragraphs = text.split("\n");
  const lines = paragraphs.reduce(
    (total, p) => total + Math.max(1, Math.ceil(p.length / perLine)),
    0,
  );
  return lines * size * (lineSpacing / 100) + spaceBelow * paragraphs.length;
}

const deck = await api("", { title });
const id = deck.presentationId;

// Пустая презентация приходит с одним слайдом по шаблону - он не нужен.
await api(`/${id}:batchUpdate`, {
  requests: [
    { deleteObject: { objectId: deck.slides[0].objectId } },
    ...content.map((_, i) => ({
      createSlide: {
        objectId: `slide${i}`,
        insertionIndex: i,
        slideLayoutReference: { predefinedLayout: "BLANK" },
      },
    })),
  ],
});

// Заметки докладчика лежат на отдельной странице слайда, её id известен только
// после создания.
const created = await api(`/${id}`);
const notesIds = created.slides.map(
  (slide) => slide.slideProperties.notesPage.notesProperties.speakerNotesObjectId,
);

const requests = [];

content.forEach((slide, i) => {
  const page = `slide${i}`;
  const isTitle = i === 0;
  let top = isTitle ? 132 : 84;

  const big = {
    width: COLUMN,
    size: headlineSize(slide.big),
    color: FG,
    lineSpacing: 115,
    accent: slide.accent,
  };
  requests.push(
    ...textBox(page, `${page}_big`, slide.big, {
      ...big,
      top,
      height: blockHeight(slide.big, big),
    }),
  );
  top += blockHeight(slide.big, big) + 30;

  if (slide.steps) {
    const text = slide.steps.join("\n");
    const steps = {
      width: COLUMN,
      size: 17,
      color: FG,
      lineSpacing: 140,
      spaceBelow: 10,
    };
    requests.push(
      ...textBox(page, `${page}_steps`, text, {
        ...steps,
        top,
        height: blockHeight(text, steps),
      }),
    );
    top += blockHeight(text, steps) + 18;
  }

  if (slide.small) {
    const small = {
      width: COLUMN - 80,
      size: 12,
      color: MUTED,
      lineSpacing: 130,
    };
    requests.push(
      ...textBox(page, `${page}_small`, slide.small, {
        ...small,
        top,
        height: blockHeight(slide.small, small),
      }),
    );
  }

  // Подпись внизу: на титуле она лишняя, там название и так крупно.
  if (!isTitle) {
    requests.push(
      ...textBox(page, `${page}_foot`, "OXAR", {
        top: 366,
        width: 120,
        height: 16,
        size: 9,
        color: MUTED,
        lineSpacing: 100,
      }),
    );
  }

  if (slide.notes) {
    requests.push({ insertText: { objectId: notesIds[i], text: slide.notes } });
  }
});

await api(`/${id}:batchUpdate`, { requests });

console.log(`https://docs.google.com/presentation/d/${id}/edit`);
