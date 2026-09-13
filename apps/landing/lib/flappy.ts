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
const SPEED = 138;
export const GAP = 186;
export const BOARD_W = 66;
const SPACING = 235;
export const BIRD_R = 17;
export const BIRD_X = 92;

/**
 * Цена щита зависит от его размера, как и в жизни: маленькая площадь стоит
 * дешевле большой. Границы в долях поля, чтобы не зависеть от его высоты.
 */
export function priceFor(height: number): number {
  if (height < H * 0.22) return 25;
  if (height < H * 0.42) return 50;
  return 100;
}

/** Радиус монеты. Она заметно меньше проёма: пролететь мимо - обычное дело. */
export const COIN_R = 9;

export type Board = { x: number; gapY: number; taken: boolean };

/** Монета висит ровно в середине проёма. */
export function coinAt(board: Board): { x: number; y: number } {
  return { x: board.x + BOARD_W / 2, y: board.gapY };
}

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
      { x: width + 40, gapY: H / 2, taken: false },
      { x: width + 40 + SPACING, gapY: H / 2 - 60, taken: false },
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
  // Очко даёт монета, а не пролёт: пройти проём мимо монеты можно, только
  // это ничего не стоит. Место само по себе не приносит денег, платит тот,
  // кто его занял.
  const boards = world.boards.map((board) => {
    const moved = { ...board, x: board.x - SPEED * dt };
    if (moved.taken) return moved;

    const coin = coinAt(moved);
    const dx = coin.x - BIRD_X;
    const dy = coin.y - y;
    if (dx * dx + dy * dy > (BIRD_R + COIN_R) * (BIRD_R + COIN_R)) return moved;

    score += 1;
    return { ...moved, taken: true };
  });

  while (boards.length && boards[0]!.x + BOARD_W < -20) boards.shift();
  // Интервал считается от последнего щита, а не от края поля: на вертикальном
  // экране поле по игровым единицам уже, чем интервал, и щиты выходили рвано.
  const last = boards[boards.length - 1];
  if (!last) {
    boards.push({ x: width + 40, gapY: pick(), taken: false });
  } else if (last.x <= width + 40 - SPACING) {
    boards.push({ x: last.x + SPACING, gapY: pick(), taken: false });
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

