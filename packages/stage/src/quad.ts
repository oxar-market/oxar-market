/**
 * Положить прямоугольник в четырёхугольник.
 *
 * Зачем. В фото-режиме места на вещи - это не прямоугольники: вещь снята под
 * углом, и место на рукаве видно трапецией. Чтобы креатив лёг на неё так же,
 * как он ляжет на ткань, картинку надо не растянуть, а исказить перспективно -
 * то есть довести до тех же четырёх углов, в которых место видно на кадре.
 *
 * Браузер это умеет: `transform: matrix3d(...)` задаёт проективное
 * преобразование. Остаётся найти его коэффициенты по четырём углам.
 *
 * Считаем по единичному квадрату: элемент, к которому применяется матрица,
 * заранее растянут на всю картинку, и углы его - (0,0), (1,0), (1,1), (0,1).
 */

/** Углы по часовой стрелке от левого верхнего, в пикселях кадра. */
export type Corners = [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
];

/**
 * Решить систему методом Гаусса с выбором ведущего элемента.
 *
 * Выбор нужен не для красоты: без него почти вырожденный четырёхугольник -
 * место, видимое с ребра, - делит на околонулевое и даёт бесконечности.
 */
function solve(matrix: number[][], right: number[]): number[] | null {
  const size = right.length;
  const rows = matrix.map((row, at) => [...row, right[at]]);

  for (let step = 0; step < size; step++) {
    let best = step;
    for (let row = step + 1; row < size; row++) {
      if (Math.abs(rows[row][step]) > Math.abs(rows[best][step])) best = row;
    }
    if (Math.abs(rows[best][step]) < 1e-12) return null;
    [rows[step], rows[best]] = [rows[best], rows[step]];

    for (let row = 0; row < size; row++) {
      if (row === step) continue;
      const factor = rows[row][step] / rows[step][step];
      if (factor === 0) continue;
      for (let col = step; col <= size; col++) {
        rows[row][col] -= factor * rows[step][col];
      }
    }
  }

  return rows.map((row, at) => row[size] / row[at]);
}

/**
 * Матрица для `transform: matrix3d(...)`.
 *
 * Возвращает шестнадцать чисел по столбцам - в том порядке, в каком их ждёт
 * CSS. `null`, если четырёхугольник выродился: три точки на одной прямой или
 * место, повёрнутое к нам ребром. Звать такое ошибкой нельзя - место на
 * дальней стороне вещи именно так и выглядит, - поэтому его просто не рисуем.
 */
export function quadTransform(corners: Corners): number[] | null {
  const [a, b, c, d] = corners;
  // Единичный квадрат в том же порядке обхода, что и углы.
  const from: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const to = [a, b, c, d];

  const rows: number[][] = [];
  const right: number[] = [];
  for (let at = 0; at < 4; at++) {
    const [x, y] = from[at];
    const [u, v] = to[at];
    rows.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    right.push(u);
    rows.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    right.push(v);
  }

  const found = solve(rows, right);
  if (!found) return null;
  const [m11, m12, m13, m21, m22, m23, m31, m32] = found;
  if (![m11, m12, m13, m21, m22, m23, m31, m32].every(Number.isFinite)) return null;

  // CSS читает матрицу по столбцам, и третья строка со столбцом отвечают за
  // глубину, которой у нас нет.
  return [
    m11, m21, 0, m31,
    m12, m22, 0, m32,
    0, 0, 1, 0,
    m13, m23, 0, 1,
  ];
}

/** Куда уедет точка единичного квадрата. Нужна тесту и отладке. */
export function applyQuad(matrix: number[], x: number, y: number): [number, number] {
  const w = matrix[3] * x + matrix[7] * y + matrix[15];
  return [
    (matrix[0] * x + matrix[4] * y + matrix[12]) / w,
    (matrix[1] * x + matrix[5] * y + matrix[13]) / w,
  ];
}
