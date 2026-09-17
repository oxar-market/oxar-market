/**
 * Что вообще можно продать на профиле X. Один список для лендинга, платформы
 * и воркера проверки — чтобы тип места назывался одинаково везде.
 */

export type PlacementKind =
  | "avatar"
  | "banner"
  | "name_suffix"
  | "bio_text"
  | "bio_link"
  | "location"
  | "pinned_post";

/** Чем проверяется, что место занято: картинкой, строкой или id поста. */
export type ProofKind = "image" | "text" | "post_id";

export type PlacementSpec = {
  kind: PlacementKind;
  label: string;
  proof: ProofKind;
  /** срок продажи по умолчанию, дней */
  defaultDays: number;
  /**
   * Насколько продавцу больно отдать это место, 1–5. Влияет только на
   * порядок в списках: начинать предложение стоит с наименее болезненного,
   * иначе инвентарь стоит пустым.
   */
  friction: 1 | 2 | 3 | 4 | 5;
};

export const PLACEMENTS: readonly PlacementSpec[] = [
  { kind: "bio_link", label: "Bio link", proof: "text", defaultDays: 30, friction: 1 },
  { kind: "location", label: "Location", proof: "text", defaultDays: 30, friction: 1 },
  { kind: "name_suffix", label: "Name suffix", proof: "text", defaultDays: 14, friction: 2 },
  { kind: "bio_text", label: "Bio text", proof: "text", defaultDays: 14, friction: 3 },
  { kind: "pinned_post", label: "Pinned post", proof: "post_id", defaultDays: 7, friction: 3 },
  { kind: "banner", label: "Banner", proof: "image", defaultDays: 7, friction: 4 },
  { kind: "avatar", label: "Avatar", proof: "image", defaultDays: 7, friction: 5 },
];

/**
 * Описание места. Здесь лежат только семь поверхностей профиля X: полный
 * каталог товаров переехал в базу, потому что перечень того, что продаётся, -
 * это данные, а не правило.
 *
 * Поэтому на незнакомом имени функция больше не падает. Зона футболки -
 * законное место, просто его описание живёт не тут, и подпись выводится из
 * самого имени: `tshirt_lower_back` читается как «Lower back».
 */
export function placementSpec(kind: string): PlacementSpec {
  const spec = PLACEMENTS.find((p) => p.kind === kind);
  if (spec) return spec;

  const words = kind.split("_").slice(1).join(" ") || kind;
  return {
    kind: kind as PlacementKind,
    label: words.charAt(0).toUpperCase() + words.slice(1),
    // Физическую поверхность скриптом не проверить: остаётся фотография.
    proof: "image",
    defaultDays: 7,
    friction: 3,
  };
}
