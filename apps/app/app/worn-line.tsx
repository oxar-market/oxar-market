import type { Worn } from "@/lib/auction";

/**
 * Кто носит вещь, где и когда - строками со значками, как подпись к афише,
 * а не таблицей. Ничего не объявлено - блока нет: три прочерка читались бы
 * как ошибка; объявлено не всё - пустое просто не пишем.
 */
export function WornLine({ worn }: { worn: Worn }) {
  const rows: { icon: string[]; label: string; value: string | null }[] = [
    { icon: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 21c0-4 4-6 8-6s8 2 8 6"], label: "Worn by", value: worn.by },
    { icon: ["M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z", "M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"], label: "At", value: worn.where },
    { icon: ["M4 6h16v14H4z", "M4 10h16", "M8 3v4M16 3v4"], label: "On", value: worn.when },
  ];
  const shown = rows.filter((one) => one.value);
  if (shown.length === 0) return null;
  return (
    <ul className="hero-worn">
      {shown.map((one) => (
        <li key={one.label}>
          <svg viewBox="0 0 24 24" aria-hidden>
            {one.icon.map((d) => (
              <path key={d} d={d} />
            ))}
          </svg>
          <span>
            {one.label} <b>{one.value}</b>
          </span>
        </li>
      ))}
    </ul>
  );
}
