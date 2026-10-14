import { formatUsd } from "@oxar/core";

/**
 * Поделиться ставкой в X: текст твита и ссылка на окно твита.
 *
 * Картинку окно твита по ссылке не принимает - её прикладывает системное
 * меню «Поделиться» на телефоне или вставка из буфера на компьютере
 * (см. share.tsx). Здесь только то, что можно проверить тестом.
 */
const SITE = "app.oxar.app";

/** Кто носит вещь, где и когда - что знает торг; пустое не пишется. */
export type ShareWorn = { by: string | null; where: string | null; when: string | null };

/** Предел твита. Строки «кто/где/когда» отпадают с конца, если не влезают. */
const LIMIT = 280;

/** Ссылка прямо на торг вещи: приложение открывает его по `?thing=`. */
export function auctionLink(thingId: string): string {
  return `https://${SITE}/?thing=${thingId}`;
}

/** Ведущее «The» в названии - со строчной: оно в середине фразы. */
const inline = (title: string) => title.replace(/^The /, "the ");

/** Заголовок, под ним кто/где/когда, внизу хвост; лишнее срезается с конца. */
function compose(head: string, worn: ShareWorn | undefined, tail: string): string {
  const lines = [
    worn?.by ? `Who: ${worn.by}` : null,
    worn?.where ? `Where: ${worn.where}` : null,
    worn?.when ? `When: ${worn.when}` : null,
  ].filter((line): line is string => line !== null);
  while (lines.length > 0 && [head, ...lines].join("\n").length + tail.length > LIMIT) lines.pop();
  return [head, ...lines].join("\n") + tail;
}

/**
 * «I just bid $175 to put my logo on the tie.», под ней кто, где и когда, и
 * ссылка. Место называем, только если их у вещи несколько: у галстука оно
 * одно, и «Whole tie» в твите - шум. Хэндл в «кто» X сам сделает
 * упоминанием - носящий увидит твит.
 */
export function shareText({
  cents,
  title,
  spot,
  worn,
  link = SITE,
}: {
  cents: number;
  title: string;
  spot?: string;
  worn?: ShareWorn;
  /** Прямая ссылка на торг; без неё - сайт. */
  link?: string;
}): string {
  const where = spot ? `${inline(title)}, spot ${spot}` : inline(title);
  return compose(
    `I just bid ${formatUsd(cents)} to put my logo on ${where}.`,
    worn,
    `\n\nOutbid me if you can: ${link}`,
  );
}

/**
 * Ставка лидера, которой делится площадка (админ), а не сам ставивший: не от
 * первого лица - «I just bid» от нашего имени было бы неправдой.
 */
export function leadText({
  cents,
  title,
  spot,
  worn,
  link = SITE,
}: {
  cents: number;
  title: string;
  spot?: string;
  worn?: ShareWorn;
  link?: string;
}): string {
  const where = spot ? `${inline(title)}, spot ${spot}` : inline(title);
  return compose(`Top bid on ${where}: ${formatUsd(cents)}.`, worn, `\n\nOutbid it: ${link}`);
}

/** Id вещи-галстука в базе (slug shirt-xx): на него ведёт app.oxar.app/tie. */
export const TIE_THING = "3bbef1e7-9398-4164-84cb-4f48f1a39ec6";
const TIE_PATH = `${SITE}/tie`;

/**
 * Торг галстука Simon: одна строка, как тренд - «вот как я выгляжу в эфире
 * на его галстуке», картинка и короткий адрес торга. Без сумм: строки
 * «кто/где/когда» и «Top bid» читались справкой, а не поводом повторить.
 */
export function tieText({ mine, brand }: { mine: boolean; brand: string }): string {
  const who = mine ? "I look" : `${brand.trim() || "the top bid"} looks`;
  // Ссылка - короткая, отдельной строкой: хвост «?thing=<uuid>» портил пост.
  return `This is how ${who} live on @EcosystemCall, worn by @simonmolitor.\n\nBid there: ${TIE_PATH}`;
}

/** Окно нового твита с готовым текстом. */
export function shareIntent(text: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
}
