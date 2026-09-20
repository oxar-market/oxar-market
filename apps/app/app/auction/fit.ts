/**
 * Как логотип ложится в место.
 *
 * Место на вещи имеет свои пропорции - грудная печать шире, чем квадрат на
 * рукаве, - а картинка приходит какая есть. Растянуть её по месту нельзя:
 * напечатают ровно то, что видно, и растянутый логотип напечатается растянутым.
 * Поэтому картинка вписывается целиком, с полями, и её пропорции не трогаются.
 */

export type Box = { x: number; y: number; width: number; height: number };

/**
 * Вписать картинку в место, сохранив пропорции. Возвращает прямоугольник
 * внутри места, куда её рисовать: по одной оси она упирается в край, по другой
 * остаётся поле с обеих сторон поровну.
 */
export function fitInside(
  image: { width: number; height: number },
  box: { width: number; height: number },
): Box {
  if (image.width <= 0 || image.height <= 0) {
    throw new Error("у картинки должны быть положительные размеры");
  }
  if (box.width <= 0 || box.height <= 0) {
    throw new Error("у места должны быть положительные размеры");
  }

  const scale = Math.min(box.width / image.width, box.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;

  return {
    x: (box.width - width) / 2,
    y: (box.height - height) / 2,
    width,
    height,
  };
}
