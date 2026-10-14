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

/**
 * «I just bid $175 to put my logo on the tie.», под ней кто, где и когда, и
 * ссылка. Место называем, только если их у вещи несколько: у галстука оно
 * одно, и «Whole tie» в твите - шум. Ведущее «The» - со строчной: середина
 * фразы. Хэндл в «кто» X сам сделает упоминанием - носящий увидит твит.
 */
export function shareText({
  cents,
  title,
  spot,
  worn,
}: {
  cents: number;
  title: string;
  spot?: string;
  worn?: ShareWorn;
}): string {
  const thing = title.replace(/^The /, "the ");
  const where = spot ? `${thing}, spot ${spot}` : thing;
  const head = `I just bid ${formatUsd(cents)} to put my logo on ${where}.`;
  const tail = `\n\nOutbid me if you can: ${SITE}`;
  const lines = [
    worn?.by ? `Who: ${worn.by}` : null,
    worn?.where ? `Where: ${worn.where}` : null,
    worn?.when ? `When: ${worn.when}` : null,
  ].filter((line): line is string => line !== null);
  while (lines.length > 0 && [head, ...lines].join("\n").length + tail.length > LIMIT) lines.pop();
  return [head, ...lines].join("\n") + tail;
}

/** Окно нового твита с готовым текстом. */
export function shareIntent(text: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
}
