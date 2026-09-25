import { test } from "node:test";
import assert from "node:assert/strict";
import { applyQuad, quadTransform, type Corners } from "./quad.ts";

/**
 * Проверка не сравнивает коэффициенты с заранее выписанными - это повторяло бы
 * вывод формулы. Проверяется свойство: матрица обязана довести углы единичного
 * квадрата ровно туда, куда просили.
 */

const near = (got: number, want: number, slack = 1e-6) =>
  assert.ok(Math.abs(got - want) < slack, `${got} вместо ${want}`);

function cornersLandWhereAsked(corners: Corners) {
  const matrix = quadTransform(corners);
  assert.ok(matrix, "матрица не сошлась");

  const square: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  square.forEach(([x, y], at) => {
    const [gotX, gotY] = applyQuad(matrix, x, y);
    near(gotX, corners[at][0]);
    near(gotY, corners[at][1]);
  });
  return matrix;
}

test("прямоугольник остаётся прямоугольником", () => {
  const matrix = cornersLandWhereAsked([
    [0, 0],
    [200, 0],
    [200, 120],
    [0, 120],
  ]);
  // Середина квадрата обязана попасть в середину прямоугольника.
  const [x, y] = applyQuad(matrix, 0.5, 0.5);
  near(x, 100);
  near(y, 60);
});

test("сдвинутый прямоугольник тоже", () => {
  cornersLandWhereAsked([
    [40, 25],
    [140, 25],
    [140, 85],
    [40, 85],
  ]);
});

test("трапеция: место, снятое под углом", () => {
  // Дальний край короче ближнего - так выглядит рукав вполоборота.
  const matrix = cornersLandWhereAsked([
    [10, 20],
    [180, 40],
    [160, 130],
    [30, 110],
  ]);

  // Середина в перспективе смещается к дальнему краю, а не остаётся ровно
  // посередине отрезка. Это и есть разница с обычным растяжением.
  const [x, y] = applyQuad(matrix, 0.5, 0.5);
  assert.ok(x > 10 && x < 180, `${x} вылетел за четырёхугольник`);
  assert.ok(y > 20 && y < 130, `${y} вылетел за четырёхугольник`);
});

test("сильная перспектива не разваливается", () => {
  cornersLandWhereAsked([
    [0, 0],
    [300, 60],
    [300, 90],
    [0, 200],
  ]);
});

test("вырожденный четырёхугольник даёт null, а не бесконечности", () => {
  // Все четыре точки на одной прямой - место видно с ребра.
  assert.equal(
    quadTransform([
      [0, 0],
      [100, 0],
      [200, 0],
      [300, 0],
    ]),
    null,
  );

  // Схлопнутое в точку.
  assert.equal(
    quadTransform([
      [50, 50],
      [50, 50],
      [50, 50],
      [50, 50],
    ]),
    null,
  );
});

test("матрица годится для CSS: шестнадцать чисел и все конечные", () => {
  const matrix = quadTransform([
    [5, 7],
    [95, 12],
    [90, 80],
    [8, 74],
  ]);
  assert.ok(matrix);
  assert.equal(matrix.length, 16);
  assert.ok(matrix.every(Number.isFinite));
  // Третья строка и третий столбец - единичные: глубины у нас нет.
  assert.deepEqual([matrix[2], matrix[6], matrix[10], matrix[14]], [0, 0, 1, 0]);
});
