/**
 * Мозаика брендов: прямоугольник делится на плитки, площадь плитки - доля
 * значения (ставки бренда). Раскладка «squarified»: плитки идут рядами вдоль
 * короткой стороны и держатся как можно ближе к квадрату - логотип в
 * квадрате читается, в длинной полосе нет. Плитки возвращаются в порядке
 * значений, чтобы их можно было сопоставить с брендами.
 */
export type Tile = { x: number; y: number; w: number; h: number };

export function mosaic(values: number[], width: number, height: number): Tile[] {
  const total = values.reduce((sum, one) => sum + Math.max(one, 0), 0);
  if (values.length === 0 || total <= 0) return values.map(() => ({ x: 0, y: 0, w: 0, h: 0 }));

  // Площади в единицах прямоугольника, крупные первыми - так ряды ровнее.
  const scale = (width * height) / total;
  const items = values
    .map((value, index) => ({ index, area: Math.max(value, 0) * scale }))
    .sort((a, b) => b.area - a.area);
  const out: Tile[] = new Array(values.length);

  let x = 0;
  let y = 0;
  let w = width;
  let h = height;
  let row: typeof items = [];

  // Худшее соотношение сторон в ряду, если положить его вдоль стороны side.
  const worst = (list: typeof items, side: number) => {
    const sum = list.reduce((acc, one) => acc + one.area, 0);
    const max = Math.max(...list.map((one) => one.area));
    const min = Math.min(...list.map((one) => one.area));
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
  };

  const place = (list: typeof items) => {
    const sum = list.reduce((acc, one) => acc + one.area, 0);
    if (w >= h) {
      // Ряд - столбец у левого края высотой h.
      const thick = sum / h;
      let at = y;
      for (const one of list) {
        const len = one.area / thick;
        out[one.index] = { x, y: at, w: thick, h: len };
        at += len;
      }
      x += thick;
      w -= thick;
    } else {
      // Ряд - строка у верхнего края шириной w.
      const thick = sum / w;
      let at = x;
      for (const one of list) {
        const len = one.area / thick;
        out[one.index] = { x: at, y, w: len, h: thick };
        at += len;
      }
      y += thick;
      h -= thick;
    }
  };

  for (const item of items) {
    const side = Math.min(w, h);
    if (row.length === 0 || worst([...row, item], side) <= worst(row, side)) {
      row.push(item);
    } else {
      place(row);
      row = [item];
    }
  }
  if (row.length) place(row);
  return out;
}
