/**
 * Прошедшие размещения не с торгов: пилоты, где место отдали без аукциона.
 *
 * Живут в коде, а не в базе намеренно: ставок, денег и кошельков у них нет, и
 * строки в торговых таблицах легли бы нулями в суммы маркета и в историю
 * людей. Пилот - витрина того, что вещь поехала, а не торг.
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
  /** Когда договорились и отдали наклейки, ISO-дата. */
  date: string;
  spots: CaseSpot[];
};

export const DELORA: PilotCase = {
  title: "Delora suitcases",
  partner: "Delora",
  date: "2026-09-27",
  spots: [
    { code: "suitcase_panel", brand: "Nomadz", logo: "/cases/delora/nomadz.webp" },
    { code: "suitcase_upper_left", brand: "Delora", logo: "/cases/delora/delora.webp" },
    { code: "suitcase_upper_right", brand: "OXAR", logo: "/cases/delora/oxar.webp" },
    { code: "suitcase_lower_left", brand: "Unnamed project", logo: "/cases/delora/red-bars.webp" },
    { code: "suitcase_lower_right", brand: "Echoes", logo: "/cases/delora/echoes.webp" },
  ],
};
