/**
 * Правила Flappy Josip: поле, физика и столкновения. Отдельно от рисования,
 * потому что шаг мира - чистая функция, и проверить его можно прогоном, а не
 * попытками попасть пальцем в нужный момент.
 */

export const W = 340;
export const H = 480;

const GRAVITY = 1150;
export const LIFT = -350;
const SPEED = 138;
export const GAP = 186;
export const BOARD_W = 66;
const SPACING = 235;
export const BIRD_R = 17;
export const BIRD_X = 92;

export const PRICES = [100, 200, 300, 150, 250, 500];

export type Board = { x: number; gapY: number; price: number; passed: boolean };

export type World = {
  y: number;
  vy: number;
  boards: Board[];
  score: number;
  dead: boolean;
};

export function fresh(): World {
  return {
    y: H / 2,
    vy: 0,
    boards: [
      { x: W + 40, gapY: H / 2, price: PRICES[0]!, passed: false },
      { x: W + 40 + SPACING, gapY: H / 2 - 60, price: PRICES[1]!, passed: false },
    ],
    score: 0,
    dead: false,
  };
}

/** Шаг мира. Чистый, поэтому его поведение видно без канваса. */
export function step(world: World, dt: number, pick: () => { gapY: number; price: number }): World {
  if (world.dead) return world;

  const vy = world.vy + GRAVITY * dt;
  const y = world.y + vy * dt;

  let score = world.score;
  const boards = world.boards.map((board) => {
    const x = board.x - SPEED * dt;
    // Очко засчитываем, когда щит остался позади: так счёт не растёт, пока
    // игрок ещё в зазоре.
    const passed = board.passed || x + BOARD_W < BIRD_X - BIRD_R;
    if (passed && !board.passed) score += 1;
    return { ...board, x, passed };
  });

  while (boards.length && boards[0]!.x + BOARD_W < -20) boards.shift();
  const last = boards[boards.length - 1];
  if (!last || last.x < W - SPACING) {
    const next = pick();
    boards.push({ x: W + 40, gapY: next.gapY, price: next.price, passed: false });
  }

  // Пол и потолок - тоже столкновение: иначе можно улететь наверх и ждать.
  let dead = y + BIRD_R > H || y - BIRD_R < 0;
  for (const board of boards) {
    const withinX = BIRD_X + BIRD_R > board.x && BIRD_X - BIRD_R < board.x + BOARD_W;
    if (!withinX) continue;
    const inGap = y - BIRD_R > board.gapY - GAP / 2 && y + BIRD_R < board.gapY + GAP / 2;
    if (!inGap) dead = true;
  }

  return { y, vy, boards, score, dead };
}

