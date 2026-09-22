/**
 * Правила Flappy Josip: поле, физика и столкновения. Отдельно от рисования,
 * потому что шаг мира - чистая функция, и проверить его можно прогоном, а не
 * попытками попасть пальцем в нужный момент.
 */

/**
 * Высота поля постоянна: от неё зависит вся физика, и прыжок должен быть
 * одинаковым на любом экране. Ширина приходит снаружи, по пропорциям экрана -
 * на широком видно дальше вперёд, но сложность от этого не меняется.
 */
export const H = 480;
/** Ширина по умолчанию, если пропорции ещё неизвестны. */
export const W = 340;

const GRAVITY = 1150;
export const LIFT = -350;
const SPEED = 118;
export const GAP = 186;
export const BOARD_W = 66;
const SPACING = 235;
export const BIRD_R = 17;

/**
 * Йосип летит по середине поля, а не у левого края. Позиция считается от ширины
 * экрана: на широком он стоит дальше от края, но всегда в центре кадра.
 *
 * Плата за это - время реакции: щиту теперь лететь до него половину поля, а не
 * почти всё. Поэтому скорость снижена, чтобы игра не стала вдвое злее.
 */
export function birdX(width = W): number {
  return width / 2;
}

/**
 * Цена щита зависит от его размера, как и в жизни: маленькая площадь стоит
 * дешевле большой. Границы в долях поля, чтобы не зависеть от его высоты.
 */
export function priceFor(height: number): number {
  if (height < H * 0.22) return 25;
  if (height < H * 0.42) return 50;
  return 100;
}

export type Board = { x: number; gapY: number; passed: boolean };

export type World = {
  y: number;
  vy: number;
  boards: Board[];
  score: number;
  dead: boolean;
};

export function fresh(width = W): World {
  return {
    y: H / 2,
    vy: 0,
    boards: [
      { x: width + 40, gapY: H / 2, passed: false },
      { x: width + 40 + SPACING, gapY: H / 2 - 60, passed: false },
    ],
    score: 0,
    dead: false,
  };
}

/** Шаг мира. Чистый, поэтому его поведение видно без канваса. */
export function step(
  world: World,
  dt: number,
  pick: () => number,
  width = W,
): World {
  if (world.dead) return world;

  const vy = world.vy + GRAVITY * dt;
  const y = world.y + vy * dt;

  let score = world.score;
  const boards = world.boards.map((board) => {
    const x = board.x - SPEED * dt;
    // Очко засчитываем, когда щит остался позади: так счёт не растёт, пока
    // игрок ещё в зазоре.
    const passed = board.passed || x + BOARD_W < birdX(width) - BIRD_R;
    if (passed && !board.passed) score += 1;
    return { ...board, x, passed };
  });

  while (boards.length && boards[0]!.x + BOARD_W < -20) boards.shift();
  // Интервал считается от последнего щита, а не от края поля: на вертикальном
  // экране поле по игровым единицам уже, чем интервал, и щиты выходили рвано.
  const last = boards[boards.length - 1];
  if (!last) {
    boards.push({ x: width + 40, gapY: pick(), passed: false });
  } else if (last.x <= width + 40 - SPACING) {
    boards.push({ x: last.x + SPACING, gapY: pick(), passed: false });
  }

  // Пол и потолок - тоже столкновение: иначе можно улететь наверх и ждать.
  let dead = y + BIRD_R > H || y - BIRD_R < 0;
  for (const board of boards) {
    const nose = birdX(width);
    const withinX = nose + BIRD_R > board.x && nose - BIRD_R < board.x + BOARD_W;
    if (!withinX) continue;
    const inGap = y - BIRD_R > board.gapY - GAP / 2 && y + BIRD_R < board.gapY + GAP / 2;
    if (!inGap) dead = true;
  }

  return { y, vy, boards, score, dead };
}

