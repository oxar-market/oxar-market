import { test } from "node:test";
import assert from "node:assert/strict";
import { BIRD_R, birdX, fresh, GAP, H, LIFT, priceFor, step, W } from "./flappy.ts";

/**
 * Шаг мира - чистая функция, и проверяется он прогоном, а не попытками попасть
 * пальцем в нужный момент. Ради этого он и отделён от рисования.
 */

/** Зазор всегда посередине: щиты не мешают смотреть на падение само по себе. */
const middle = () => H / 2;

/**
 * Прокрутить мир столько-то секунд шагами по кадру.
 *
 * `hold` - играть: нажимать, когда Йосип опустился ниже середины. Ровным
 * ритмом его не удержать ни при каком интервале - подъём сильнее, чем успевает
 * набрать гравитация, и он уходит в потолок, а потолок убивает так же, как
 * пол. Игра в том и состоит, чтобы нажимать по высоте, а не по метроному.
 */
function run(seconds: number, hold = false) {
  let world = fresh();
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    if (hold && world.y > H / 2) world = { ...world, vy: LIFT };
    world = step(world, dt, middle, W);
  }
  return world;
}

test("без единого нажатия Йосип падает и разбивается о пол", () => {
  const world = run(3);
  assert.equal(world.dead, true);
});

test("нажатие держит его в воздухе", () => {
  // Три секунды без нажатий - уже труп (проверено выше), с нажатиями - нет.
  const world = run(3, true);
  assert.equal(world.dead, false);
});

test("потолок убивает так же, как пол", () => {
  // Иначе можно было бы упереться в верх поля и ждать, пока щиты кончатся.
  let world = fresh();
  for (let i = 0; i < 180; i++) {
    world = { ...world, vy: LIFT };
    world = step(world, 1 / 60, middle, W);
  }
  assert.equal(world.dead, true);
});

test("щит засчитывается, только когда остался позади", () => {
  let world = fresh();
  const dt = 1 / 60;
  // Держим Йосипа ровно в зазоре, чтобы считался именно пролёт, а не смерть.
  for (let i = 0; i < 60 * 20; i++) {
    world = { ...world, y: H / 2, vy: 0 };
    const before = world.boards.find((b) => !b.passed);
    world = step(world, dt, middle, W);
    if (!before) continue;
    const after = world.boards.find((b) => b.x === before.x - 118 * dt);
    if (after?.passed && !before.passed) {
      // Очко даётся ровно в тот кадр, когда щит ушёл за спину.
      assert.ok(after.x + 66 < birdX(W) - BIRD_R, "очко дали раньше времени");
      return;
    }
  }
  assert.fail("за двадцать секунд не засчитан ни один щит");
});

test("щиты идут один за другим и не кончаются", () => {
  let world = fresh();
  for (let i = 0; i < 60 * 30; i++) {
    world = { ...world, y: H / 2, vy: 0 };
    world = step(world, 1 / 60, middle, W);
    assert.ok(world.boards.length > 0, "поле осталось без щитов");
  }
  assert.ok(world.score > 0, "за полминуты не набрано ни очка");
});

test("в зазор Йосип проходит, в щит - нет", () => {
  const dt = 1 / 60;
  // Ставим щит ровно под нос и смотрим, что решает высота.
  const at = (y: number) =>
    step(
      { y, vy: 0, boards: [{ x: birdX(W) - 10, gapY: H / 2, passed: false }], score: 0, dead: false },
      dt,
      middle,
      W,
    ).dead;

  assert.equal(at(H / 2), false, "середина зазора - это пролёт");
  assert.equal(at(H / 2 - GAP / 2 - BIRD_R), true, "верхний край щита - это удар");
  assert.equal(at(H / 2 + GAP / 2 + BIRD_R), true, "нижний край щита - это удар");
});

test("цена щита растёт с его размером", () => {
  assert.ok(priceFor(H * 0.1) < priceFor(H * 0.3));
  assert.ok(priceFor(H * 0.3) < priceFor(H * 0.6));
});
