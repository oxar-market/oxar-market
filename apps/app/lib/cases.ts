/**
 * Прошедшие размещения не с торгов: пилоты, где место отдали без аукциона.
 *
 * Живут в коде, а не в базе намеренно: ставок, денег и кошельков у них нет, и
 * строки в торговых таблицах легли бы нулями в суммы маркета и в историю
 * людей. На маркете пилот показан тем же экраном итогов, что и торг: Delora
 * была нашим первым размещением, и выглядеть иначе ей незачем (сказали на
 * показе 1 октября 2026). Отличие - в данных: вместо сумм «Placed», вместо
 * расчёта эскроу «нечего разбирать».
 */

export type CaseSpot = {
  /** Код места на модели - из SUITCASE_SPOTS. */
  code: string;
  brand: string;
  /** Наклейка из public: уже повёрнута под свой угол, как клеили руками. */
  logo: string;
};

export type PilotCase = {
  title: string;
  partner: string;
  /** Где партнёра найти: имя на странице кейса ведёт сюда. */
  partnerUrl: string;
  /** Когда договорились и отдали наклейки, ISO-дата. */
  date: string;
  /** Кто носит, где, когда и в чём особенность - как у вещи с торгов. */
  worn: { by: string; where: string; when: string; about: string };
  spots: CaseSpot[];
};

export const DELORA: PilotCase = {
  title: "Delora suitcases",
  partner: "Delora",
  partnerUrl: "https://x.com/deloraprotocol",
  date: "2026-09-24",
  worn: {
    by: "The Delora team",
    where: "On the road",
    when: "From Sep 24",
    about:
      "Our first placement off a shirt. We printed the stickers, Delora put them on their suitcases. No auction and no payment - a first test that both sides want this.",
  },
  spots: [
    { code: "suitcase_panel", brand: "Nomadz", logo: "/cases/delora/nomadz.webp" },
    { code: "suitcase_upper_left", brand: "Delora", logo: "/cases/delora/delora.webp" },
    { code: "suitcase_upper_right", brand: "OXAR", logo: "/cases/delora/oxar.webp" },
    { code: "suitcase_lower_left", brand: "Solwear", logo: "/cases/delora/solwear.webp" },
    { code: "suitcase_lower_right", brand: "Echoes", logo: "/cases/delora/echoes.webp" },
  ],
};
