import type { Group, Mesh, Texture } from "three";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { DecalGeometry as Decal } from "three/examples/jsm/geometries/DecalGeometry.js";
import { REPAINT, type Shape } from "./spots.ts";
import { facing } from "./facing.ts";

type Three = typeof import("three");

/**
 * Вещь с логотипами победителей на своих местах - для витрины, без выбора
 * мест и примерки. Места ищутся так же, как на сцене торга (stage.tsx): та же
 * нормализация по большей стороне, тот же луч к месту по высоте, углу и
 * сдвигу, та же коробка декали. Упрощено то, что нужно только сцене торга:
 * рамки, деление места на детали по сетке лучей, подсветка.
 */
export type Dressed = {
  /** Вещь, центр габарита в нуле, описанная сфера радиусом 1. */
  root: Group;
  /** Откуда смотреть, чтобы были видны проданные места: единичный вектор. */
  view: [number, number, number];
  /** Сколько от центра до низа вещи, в тех же единицах: на эту высоту она встаёт над землёй. */
  foot: number;
  /**
   * Где лежит каждое место - и проданное, и пустое: точка на поверхности,
   * нормаль и «верх» логотипа, в координатах root. По ним страница торга
   * поворачивает вещь к месту и снимает его кадр.
   */
  spots: Record<string, SpotAnchor>;
};

export type SpotAnchor = {
  point: [number, number, number];
  normal: [number, number, number];
  up: [number, number, number];
  /** Больший размер места, в долях радиуса вещи. */
  size: number;
  top: boolean;
};

/** Картинка по первому адресу, что откроется: своя копия, потом оригинал. */
function image(urls: string[]): Promise<HTMLImageElement | null> {
  return new Promise((done) => {
    const next = (at: number) => {
      if (at >= urls.length) return done(null);
      const img = new Image();
      // Без CORS чужая картинка «пачкает» холст, и WebGL отказывается брать её в текстуру.
      // Своя примерка - blob-ссылка: Safari на iPhone с crossOrigin её не грузит.
      if (!urls[at]!.startsWith("blob:")) img.crossOrigin = "anonymous";
      img.onload = () => done(img);
      img.onerror = () => next(at + 1);
      img.src = urls[at]!;
    };
    next(0);
  });
}

function texture(THREE: Three, img: HTMLImageElement, size: [number, number], mode: "wrap" | "tile" | "fit"): Texture {
  const w = 512;
  const h = Math.round((512 * size[1]) / size[0]);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;
  // У SVG без размеров своей ширины нет - считаем квадратом.
  const iw = img.naturalWidth || 512;
  const ih = img.naturalHeight || 512;
  if (mode === "wrap") {
    // Оклейка: картинка закрывает место целиком, края срезаются - как печать на капоте.
    const k = Math.max(w / iw, h / ih);
    g.drawImage(img, (w - iw * k) / 2, (h - ih * k) / 2, iw * k, ih * k);
  } else {
    const pad = mode === "tile" ? 0.16 : 0.06;
    const k = Math.min((w * (1 - 2 * pad)) / iw, (h * (1 - 2 * pad)) / ih);
    g.drawImage(img, (w - iw * k) / 2, (h - ih * k) / 2, iw * k, ih * k);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}

export async function dress(
  THREE: Three,
  loader: GLTFLoader,
  DecalGeometry: typeof Decal,
  model: string,
  shape: Shape | undefined,
  logos: Record<string, string[]>,
): Promise<Dressed> {
  const gltf = await loader.loadAsync(model);
  const thing = gltf.scene;
  const box = new THREE.Box3().setFromObject(thing);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  // Тот же масштаб, что у сцены торга: размеры мест в разметке даны в нём.
  const scale = 0.62 / Math.max(size.x, size.y);
  thing.scale.setScalar(scale);
  thing.position.sub(center.multiplyScalar(scale));
  const inner = new THREE.Group();
  inner.add(thing);
  inner.updateMatrixWorld(true);
  const placed = new THREE.Box3().setFromObject(thing);
  const low = placed.min.y;
  const tall = placed.max.y - placed.min.y;
  const meshes: Mesh[] = [];
  thing.traverse((one) => {
    if ((one as Mesh).isMesh) meshes.push(one as Mesh);
  });

  // Ткань - матовый белый хлопок с ворсом, как на сцене торга: без sheen она блестит пластиком.
  if (shape?.cloth) {
    for (const mesh of meshes) {
      const came = mesh.material as { normalMap?: Texture | null };
      mesh.material = new THREE.MeshPhysicalMaterial({
        color: shape.paint ?? REPAINT.color,
        roughness: 0.96,
        metalness: 0,
        sheen: 1,
        sheenRoughness: 0.85,
        sheenColor: new THREE.Color(0xffffff),
        normalMap: came?.normalMap ?? null,
        normalScale: new THREE.Vector2(0.7, 0.7),
      });
    }
  }

  const ray = new THREE.Raycaster();
  const anchor = new THREE.Object3D();
  const found: Record<string, { point: InstanceType<Three["Vector3"]>; normal: InstanceType<Three["Vector3"]>; up: InstanceType<Three["Vector3"]>; size: number; top: boolean }> = {};
  for (const spot of shape?.spots ?? []) {
    const angle = (spot.azimuth * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    if (spot.top) ray.set(new THREE.Vector3(spot.shift ?? 0, low + tall + 1, 0), new THREE.Vector3(0, -1, 0));
    else
      ray.set(
        dir
          .clone()
          .multiplyScalar(1.2)
          .add(new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle)).multiplyScalar(spot.shift ?? 0))
          .setY(low + tall * spot.height),
        dir.clone().negate(),
      );
    const named = meshes.filter((mesh) => !spot.parts || spot.parts.some((part) => mesh.name.startsWith(part)));
    const hit = ray.intersectObjects(named.length ? named : meshes, false)[0];
    if (!hit?.face) continue;
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    anchor.position.copy(hit.point);
    anchor.up.set(spot.top ? -1 : 0, spot.top ? 0 : 1, 0);
    anchor.lookAt(hit.point.clone().add(normal));
    found[spot.code] = { point: hit.point.clone(), normal, up: anchor.up.clone(), size: Math.max(spot.size[0], spot.size[1]), top: Boolean(spot.top) };
    // Место без картинки - только точка, без печати.
    const urls = logos[spot.code];
    if (!urls?.length) continue;
    const img = await image(urls);
    if (!img) continue;
    const depth = spot.reach ?? (spot.wrap ? Math.min(shape!.depth, spot.top ? 0.02 : 0.03) : shape!.depth);
    const geometry = new DecalGeometry(hit.object as Mesh, hit.point, anchor.rotation, new THREE.Vector3(spot.size[0], spot.size[1], depth));
    if (!geometry.getAttribute("position")?.count) continue;
    const map = texture(THREE, img, spot.tile ? [1, 1] : spot.size, spot.tile ? "tile" : spot.wrap ? "wrap" : "fit");
    if (spot.tile) {
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(2.2, (2.2 * spot.size[1]) / spot.size[0]);
    }
    inner.add(
      new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -4 }),
      ),
    );
  }

  // Центр описанной сферы - в ноль, радиус - в единицу: дальше вещь меряется долями шара.
  const sphere = new THREE.Box3().setFromObject(inner).getBoundingSphere(new THREE.Sphere());
  inner.position.copy(sphere.center).multiplyScalar(-1 / sphere.radius);
  inner.scale.setScalar(1 / sphere.radius);
  const root = new THREE.Group();
  root.add(inner);
  root.updateMatrixWorld(true);
  const foot = -new THREE.Box3().setFromObject(root).min.y;
  const view = shape ? facing(shape.spots, (code) => Boolean(logos[code]?.length)) : facing([], () => false);
  // Точки мест - в те же координаты, что и вещь: сдвиг центра и масштаб шара.
  const spots: Record<string, SpotAnchor> = {};
  for (const [code, one] of Object.entries(found)) {
    const point = one.point.clone().sub(sphere.center).divideScalar(sphere.radius);
    spots[code] = {
      point: [point.x, point.y, point.z],
      normal: [one.normal.x, one.normal.y, one.normal.z],
      up: [one.up.x, one.up.y, one.up.z],
      size: one.size / sphere.radius,
      top: one.top,
    };
  }
  return { root, view, foot, spots };
}
