import type { Worn } from "@/lib/auction";

/**
 * Кто носит вещь, где и когда - тремя ячейками в главном блоке маркета.
 * Ничего не объявлено - блока нет: три прочерка читались бы как ошибка.
 */
export function WornLine({ worn }: { worn: Worn }) {
  if (!worn.by && !worn.where && !worn.when) return null;
  const rows: [string, string | null][] = [
    ["Who has it", worn.by],
    ["Where", worn.where],
    ["When", worn.when],
  ];
  return (
    <dl className="hero-worn">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd className={value ? undefined : "tba"}>{value ?? "To be announced"}</dd>
        </div>
      ))}
    </dl>
  );
}
