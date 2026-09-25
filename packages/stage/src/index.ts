/**
 * Сцена вещи и её геометрия - общие для приложения и лендинга.
 *
 * Пакет появился, когда 3D понадобилось лендингу: копия сцены разошлась бы
 * с приложением молча, как расходится любое задублированное правило.
 * React и three живут здесь, данных и сети здесь нет.
 */
export { ThingStage, type Stage, type Views } from "./stage.tsx";
export {
  DECAL_DEPTH,
  FRAME_PAD,
  REPAINT,
  SPOTS,
  type Spot,
} from "./spots.ts";
export { fitInside } from "./fit.ts";
export { applyQuad, quadTransform, type Corners } from "./quad.ts";
export { acesFilmic, develop, toSrgb } from "./tone.ts";
