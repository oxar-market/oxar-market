"use client";

import { useEffect, useRef, useState } from "react";
import { formatUsd } from "@oxar/core";
import { lotBids, lotsOnSurface, type Lot, type PublicBid } from "@/lib/auctions";
import { AuctionLot, BidPage } from "./AuctionLot";

/**
 * Вещь из физического мира, размеченная под рекламу.
 *
 * Крутится мышью и пальцем, как в любом конструкторе мерча. Места под
 * нанесение - это декали: куски геометрии, выштампованные из самой модели по
 * нормали к поверхности. Они повторяют форму вещи, потому что это и есть её
 * поверхность, а не квадрат поверх картинки.
 *
 * three.js и модель грузятся динамически, только когда окно открыли: это
 * сотни килобайт, и тянуть их в основной бандл ради иконки на столе нельзя.
 *
 * Зоны названы так же, как места в каталоге: по этому имени вид находит свой
 * лот. Зона, выставленная на торги, ведёт в форму ставки; остальные - в
 * вейтлист, потому что обещать цену на непроданном месте нечем.
 *
 * Эскроу тут нет намеренно, и это не упущение. Он отдаёт деньги за время,
 * которое размещение простояло, а простой вещи проверить нечем: ни строки, ни
 * картинки профиля, ни id поста. Плюс печать - невозвратная трата продавца до
 * начала. Разобрано в docs/plan-payments.md.
 *
 * Файл общий для футболки и чемодана. Различия у них только в данных: модель,
 * разметка и слова. Держать два почти одинаковых движка значило бы чинить
 * каждую правку дважды - и однажды забыть.
 */

export type Spot = {
  id: string;
  label: string;
  /** Высота на вещи: 0 - низ габарита, 1 - верх. */
  height: number;
  /**
   * Угол вокруг оси: 0 - в сторону +Z, 90 - в сторону +X.
   *
   * Луч летит горизонтально из точки на этом угле к оси, поэтому точка
   * попадания лежит на той же прямой. На плоской грани это даёт сдвиг вдоль
   * неё: место можно двигать вбок, не заводя третью координату.
   */
  azimuth: number;
  /** Размер пятна на поверхности, в единицах модели. */
  size: [number, number];
};

/** Цвет вещи: чем красим модель и какой снимок стоит в ряду миниатюр. */
export type Variant = {
  label: string;
  color: number;
  thumb: string;
};

export type SurfaceSpec = {
  /** Имя поверхности в каталоге мест: по нему ищутся лоты. */
  surface: string;
  /** Имя вещи в шапке карточки. */
  name: string;
  model: string;
  spots: Spot[];
  /**
   * Цвета, в которых вещь бывает. Первый - тот, в котором она загружается.
   * Миниатюры - снимки этой же модели в этих же цветах, а не кружки-свотчи:
   * по кружку не видно, как цвет ложится на саму вещь.
   */
  variants: Variant[];
  /**
   * Какой материал красится при выборе цвета. Без него красится всё (случай
   * футболки, где мы и так заменяем материалы через repaint). У чемодана
   * корпус - отдельный материал, а колёса и ручка остаются фурнитурой.
   */
  paintMaterial?: string;
  /**
   * Глубина коробки, которой декаль вырезается из поверхности. Чем круче вещь
   * уходит за угол, тем меньше она должна быть: слишком глубокая коробка
   * захватывает и соседнюю грань, и пятно заворачивается на неё.
   */
  depth: number;
  /**
   * Цвет рамки места: обычный и под курсором. Зависит от самой вещи - синий
   * контур на светлой ткани читается, а на цветном корпусе сливается с ним.
   */
  tint?: { idle: number; hot: number };
  /**
   * Чем перекрасить модель. Нужно там, где она приходит с запечённой текстурой
   * чужого демо: на чистой вещи читаются наши места, а не чужой принт. Если
   * материалы модели свои и хорошие - не трогаем.
   */
  repaint?: { color: number; roughness: number };
  /**
   * Автор модели и лицензия. Нужен там, где лицензия этого требует: CC-BY
   * разрешает пользоваться чем угодно, но обязывает назвать автора рядом с
   * самой вещью, а не в файле, куда никто не заглянет.
   */
  credit?: { who: string; licence: string; url: string };
  words: {
    loading: string;
    /** Подсказка под моделью, пока ни одно место не под курсором. */
    idle: string;
    back: string;
    /** Что это за поверхность - одной фразой, с точки зрения каждой стороны. */
    forBuyer: string;
    forSeller: string;
    /** Почему тут может быть пусто. */
    empty: string;
  };
};

type Role = "creator" | "advertiser";

/**
 * Свободное место рисуется рамкой, как пустующий щит: пунктир по контуру, чуть
 * заметная заливка, подпись внутри. Сплошная заливка читалась как брак печати,
 * а не как место, которое можно занять.
 *
 * Рисунок белый, а цвет задаёт материал: тогда наведение по-прежнему меняет
 * один color, а не пересобирает текстуру.
 */
const sheets = new Map<string, InstanceType<typeof import("three").CanvasTexture>>();

const PLACEHOLDER = "YOUR AD HERE";

function placeholder(THREE: typeof import("three"), spot: Spot) {
  const [wide, tall] = spot.size;
  const key = `${wide}x${tall}`;
  const known = sheets.get(key);
  if (known) return known;

  // Холст повторяет пропорции места: иначе рамка и буквы растянутся вместе с
  // декалью.
  const span = 512;
  const canvas = document.createElement("canvas");
  canvas.width = wide >= tall ? span : Math.round((span * wide) / tall);
  canvas.height = wide >= tall ? Math.round((span * tall) / wide) : span;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("нет 2d-контекста");

  const short = Math.min(canvas.width, canvas.height);
  const pad = short * 0.06;
  const line = Math.max(2, short * 0.035);
  const frame = () =>
    roundRect(ctx, pad, pad, canvas.width - pad * 2, canvas.height - pad * 2, short * 0.12);

  ctx.fillStyle = "rgba(255,255,255,0.16)";
  frame();
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = line;
  ctx.lineCap = "round";
  ctx.setLineDash([short * 0.14, short * 0.09]);
  frame();
  ctx.stroke();

  // Подпись только там, где её прочитают, и мера тут - размер места на вещи, а
  // не размер холста. На полоске у подола или на рукаве буквы превратились бы
  // в грязь, и рамка справляется одна.
  if (Math.min(wide, tall) >= 0.1) {
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Кегль подбирается под ширину рамки, а не берётся долей от холста: на
    // широком месте надпись вылезала за пунктир.
    const room = canvas.width - (pad + line) * 2 - short * 0.14;
    const font = (size: number) => `600 ${size}px ui-sans-serif, system-ui, sans-serif`;
    let size = short * 0.17;
    ctx.letterSpacing = `${size * 0.08}px`;
    ctx.font = font(size);
    const width = ctx.measureText(PLACEHOLDER).width;
    if (width > room) {
      size *= room / width;
      ctx.letterSpacing = `${size * 0.08}px`;
      ctx.font = font(size);
    }
    ctx.fillText(PLACEHOLDER, canvas.width / 2, canvas.height / 2);
  }

  const made = new THREE.CanvasTexture(canvas);
  made.colorSpace = THREE.SRGBColorSpace;
  made.anisotropy = 8;
  sheets.set(key, made);
  return made;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  wide: number,
  tall: number,
  radius: number,
) {
  const r = Math.min(radius, wide / 2, tall / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + wide, y, x + wide, y + tall, r);
  ctx.arcTo(x + wide, y + tall, x, y + tall, r);
  ctx.arcTo(x, y + tall, x, y, r);
  ctx.arcTo(x, y, x + wide, y, r);
  ctx.closePath();
}

/** Куда зовёт контурная кнопка. Тот же адрес, что в доке и в витрине. */
const CALL_URL = "https://calendly.com/daniel-l-oxar";

export function Surface3D({
  spec,
  role,
  onWaitlist,
  onSwap,
}: {
  spec: SurfaceSpec;
  role: Role;
  onWaitlist: () => void;
  /** Открыть соседнюю вещь: «Change product» в шапке карточки. */
  onSwap: () => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [lots, setLots] = useState<Lot[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  // Форма ставки - отдельная страница, а не поля под лотом: раскрываясь, они
  // толкали экран вниз и место уезжало из виду.
  const [bidding, setBidding] = useState(false);
  const [variant, setVariant] = useState(0);
  const [tab, setTab] = useState<"about" | "spots">("about");

  // Смена места - любой дорогой - закрывает страницу ставки: она про прошлый лот.
  useEffect(() => {
    setBidding(false);
  }, [picked]);
  // Клик по месту приходит из сцены, а обработчик живёт в React. Через ref -
  // чтобы сцену не пересобирать на каждый ре-рендер.
  const onPick = useRef<(id: string) => void>(() => {});
  onPick.current = (id) => setPicked(id);
  // Обратные мостики - React дёргает сцену: перекрасить вещь, довернуть её.
  // Появляются, когда сцена собралась, и пропадают вместе с ней.
  const paint = useRef<((color: number) => void) | null>(null);
  const spin = useRef<((dir: number) => void) | null>(null);
  const variantNow = useRef(0);

  useEffect(() => {
    lotsOnSurface(spec.surface).then(setLots);
  }, [spec.surface]);

  const lotFor = (id: string | null) =>
    lots.find((lot) => lot.listing.kind === id) ?? null;

  // Ставки для левой дуги на широком экране: смотрим на торг выбранного места,
  // а пока ничего не выбрано - на первый идущий. Нет торгов - нет и дуги.
  const [arcBids, setArcBids] = useState<PublicBid[]>([]);
  const arcLot = lotFor(picked) ?? lots[0] ?? null;
  const arcLotId = arcLot?.id ?? null;

  useEffect(() => {
    if (!arcLotId) {
      setArcBids([]);
      return;
    }
    let live = true;
    lotBids(arcLotId).then((rows) => {
      if (live) setArcBids(rows.slice(0, 4));
    });
    return () => {
      live = false;
    };
  }, [arcLotId]);

  useEffect(() => {
    const host = mount.current;
    if (!host) return;

    let stop = false;
    let cleanup = () => {};

    (async () => {
      try {
        const THREE = await import("three");
        const { GLTFLoader } = await import(
          "three/examples/jsm/loaders/GLTFLoader.js"
        );
        const { OrbitControls } = await import(
          "three/examples/jsm/controls/OrbitControls.js"
        );
        const { RoomEnvironment } = await import(
          "three/examples/jsm/environments/RoomEnvironment.js"
        );
        const { DecalGeometry } = await import(
          "three/examples/jsm/geometries/DecalGeometry.js"
        );
        if (stop) return;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(host.clientWidth, host.clientHeight);
        // Плёночная кривая с приглушённой выдержкой: без неё светлая вещь под
        // студийным светом выбивается в чистый белый и теряет форму.
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.78;
        host.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        scene.environmentIntensity = 0.55;

        const key = new THREE.DirectionalLight(0xffffff, 0.75);
        key.position.set(1.2, 1.6, 1.4);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xffffff, 0.25);
        fill.position.set(-1.4, 0.4, -1);
        scene.add(fill);

        const camera = new THREE.PerspectiveCamera(
          32,
          host.clientWidth / host.clientHeight,
          0.1,
          100,
        );

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enablePan = false;
        controls.enableZoom = false;
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.rotateSpeed = 0.9;
        // Вертикаль ограничена: снизу и сверху модель выглядит как мешок.
        controls.minPolarAngle = Math.PI * 0.28;
        controls.maxPolarAngle = Math.PI * 0.72;

        const gltf = await new GLTFLoader().loadAsync(spec.model);
        if (stop) {
          renderer.dispose();
          return;
        }

        const thing = gltf.scene;
        const meshes: InstanceType<typeof THREE.Mesh>[] = [];
        thing.traverse((node) => {
          if ((node as InstanceType<typeof THREE.Mesh>).isMesh) {
            meshes.push(node as InstanceType<typeof THREE.Mesh>);
          }
        });
        if (meshes.length === 0) throw new Error("в модели нет поверхностей");

        // Что красится при выборе цвета: либо материалы, которые мы сами же
        // и создали перекраской, либо один названный материал модели.
        const paintables: InstanceType<typeof THREE.MeshStandardMaterial>[] = [];
        if (spec.repaint) {
          for (const mesh of meshes) {
            const material = new THREE.MeshStandardMaterial({
              color: spec.repaint.color,
              roughness: spec.repaint.roughness,
              metalness: 0,
            });
            mesh.material = material;
            paintables.push(material);
          }
        } else if (spec.paintMaterial) {
          for (const mesh of meshes) {
            const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const material of list) {
              if (material.name === spec.paintMaterial) {
                paintables.push(
                  material as InstanceType<typeof THREE.MeshStandardMaterial>,
                );
              }
            }
          }
        }

        const box = new THREE.Box3().setFromObject(thing);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const scale = 0.62 / Math.max(size.x, size.y);
        thing.scale.setScalar(scale);
        thing.position.sub(center.multiplyScalar(scale));
        scene.add(thing);
        thing.updateMatrixWorld(true);

        const reach = 0.62 * 0.5;
        const fov = (camera.fov * Math.PI) / 180;
        // Начальный разворот - лицевой стороной к зрителю. Она задана первым
        // местом в разметке: главное место всегда на главной грани.
        const first = ((spec.spots[0]?.azimuth ?? 0) * Math.PI) / 180;
        const far = (reach / Math.tan(fov / 2)) * 1.35;
        camera.position.set(Math.sin(first) * far, 0, Math.cos(first) * far);
        camera.updateProjectionMatrix();
        controls.update();

        // Куда именно легло место, решает сама модель: луч снаружи внутрь
        // находит точку на поверхности и её нормаль, и декаль встаёт по ним.
        //
        // Рамка зависит от цвета вещи, а цвет теперь меняется: на светлой ткани
        // читается синий контур, на тёмной он тонет - там рамка белая. Поэтому
        // не константа, а переменная, которую трогает перекраска.
        const baseTint = spec.tint ?? { idle: 0x2f9fe0, hot: 0x0a7fd4 };
        const darkTint = { idle: 0xeef4ff, hot: 0xffffff };
        let tint = baseTint;
        const raycaster = new THREE.Raycaster();
        const anchor = new THREE.Object3D();
        const decals: { id: string; mesh: InstanceType<typeof THREE.Mesh> }[] = [];

        const placed = new THREE.Box3().setFromObject(thing);
        const low = placed.min.y;
        const tall = placed.max.y - placed.min.y;
        const placedSize = placed.getSize(new THREE.Vector3());

        // Подиум, как в студийной съёмке: тонкое кольцо на полу и мягкая тень
        // под вещью. Без них она висела в воздухе, и было непонятно, что её
        // можно крутить - кольцо и есть поворотный круг.
        const floor = low + 0.002;
        const ringRadius = Math.max(placedSize.x, placedSize.z) * 0.68;
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(ringRadius, 0.0035, 8, 160),
          new THREE.MeshBasicMaterial({ color: 0xc9ccd1 }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = floor;
        scene.add(ring);

        const shade = document.createElement("canvas");
        shade.width = shade.height = 256;
        const shadeCtx = shade.getContext("2d");
        if (shadeCtx) {
          const glow = shadeCtx.createRadialGradient(128, 128, 0, 128, 128, 128);
          glow.addColorStop(0, "rgba(0,0,0,0.20)");
          glow.addColorStop(0.6, "rgba(0,0,0,0.09)");
          glow.addColorStop(1, "rgba(0,0,0,0)");
          shadeCtx.fillStyle = glow;
          shadeCtx.fillRect(0, 0, 256, 256);
          const disc = new THREE.Mesh(
            new THREE.CircleGeometry(ringRadius * 0.85, 64),
            new THREE.MeshBasicMaterial({
              map: new THREE.CanvasTexture(shade),
              transparent: true,
              depthWrite: false,
            }),
          );
          disc.rotation.x = -Math.PI / 2;
          disc.position.y = floor - 0.001;
          scene.add(disc);
        }

        for (const spot of spec.spots) {
          const angle = (spot.azimuth * Math.PI) / 180;
          const dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
          const start = dir
            .clone()
            .multiplyScalar(1.2)
            .setY(low + tall * spot.height);
          raycaster.set(start, dir.clone().negate());
          // Целимся во все меши сразу: у вещи их бывает несколько, и какая
          // именно окажется под лучом - забота геометрии, а не разметки.
          const hit = raycaster.intersectObjects(meshes, true)[0];
          if (!hit || !hit.normal) continue;
          const surface = hit.object as InstanceType<typeof THREE.Mesh>;

          anchor.position.copy(hit.point);
          anchor.lookAt(
            hit.point.clone().add(hit.normal.clone().transformDirection(surface.matrixWorld)),
          );

          const geometry = new DecalGeometry(
            surface,
            hit.point,
            anchor.rotation,
            new THREE.Vector3(spot.size[0], spot.size[1], spec.depth),
          );
          const material = new THREE.MeshStandardMaterial({
            map: placeholder(THREE, spot),
            color: tint.idle,
            roughness: 0.95,
            metalness: 0,
            transparent: true,
            // Сквозь место по-прежнему читается сама вещь: заливка под рамкой
            // почти прозрачная, и держит внимание сам контур.
            opacity: 0.88,
            // Декаль лежит ровно на поверхности, поэтому её надо чуть
            // приподнять - иначе они спорят и пятно мерцает полосами.
            polygonOffset: true,
            polygonOffsetFactor: -4,
            depthWrite: false,
          });
          const mesh = new THREE.Mesh(geometry, material);
          scene.add(mesh);
          decals.push({ id: spot.id, mesh });
        }

        // Наведение и клик считаем по самим декалям: они настоящие меши, и
        // попадание в них честнее любой проекции в экранные координаты.
        const pointer = new THREE.Vector2();
        let over: string | null = null;
        const pick = (event: PointerEvent) => {
          const rect = renderer.domElement.getBoundingClientRect();
          pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(pointer, camera);
          const hits = raycaster.intersectObjects(
            decals.map((decal) => decal.mesh),
            false,
          );
          return hits[0] ? decals.find((decal) => decal.mesh === hits[0].object) : undefined;
        };

        const onMove = (event: PointerEvent) => {
          const found = pick(event);
          const id = found?.id ?? null;
          if (id === over) return;
          over = id;
          setHovered(id);
          renderer.domElement.style.cursor = id ? "pointer" : "grab";
          for (const decal of decals) {
            const material = decal.mesh.material as InstanceType<
              typeof THREE.MeshStandardMaterial
            >;
            material.color.set(decal.id === id ? tint.hot : tint.idle);
            material.opacity = decal.id === id ? 1 : 0.88;
          }
        };
        // Клик считаем только если мышь не уехала: иначе поворот модели
        // заканчивался бы открытием вейтлиста.
        let down: { x: number; y: number } | null = null;
        const onDown = (event: PointerEvent) => {
          down = { x: event.clientX, y: event.clientY };
        };
        const onUp = (event: PointerEvent) => {
          const start = down;
          down = null;
          if (!start) return;
          if (Math.abs(event.clientX - start.x) > 5) return;
          if (Math.abs(event.clientY - start.y) > 5) return;
          const found = pick(event);
          if (found) onPick.current(found.id);
        };

        renderer.domElement.addEventListener("pointermove", onMove);
        renderer.domElement.addEventListener("pointerdown", onDown);
        renderer.domElement.addEventListener("pointerup", onUp);

        // Перекраска: цвет вещи и заодно цвет рамок - тёмная вещь требует
        // белого контура. Порог по яркости, а не список: цвета лежат в данных.
        paint.current = (color: number) => {
          for (const material of paintables) material.color.set(color);
          const shade = new THREE.Color(color);
          tint =
            0.299 * shade.r + 0.587 * shade.g + 0.114 * shade.b < 0.35
              ? darkTint
              : baseTint;
          for (const decal of decals) {
            const material = decal.mesh.material as InstanceType<
              typeof THREE.MeshStandardMaterial
            >;
            material.color.set(decal.id === over ? tint.hot : tint.idle);
          }
        };
        // Вещь могла быть перекрашена до того, как сцена собралась заново:
        // окно переоткрывают, а выбранный цвет живёт в React.
        if (variantNow.current > 0) {
          paint.current(spec.variants[variantNow.current].color);
        }

        // Стрелки доворачивают вещь на треть круга. Остаток доедается в цикле
        // кадров долей за кадр - это то же затухание, что у самих контролов.
        const up = new THREE.Vector3(0, 1, 0);
        let turning = 0;
        spin.current = (dir: number) => {
          turning += (dir * Math.PI) / 3;
        };

        const resize = () => {
          if (!host.clientWidth || !host.clientHeight) return;
          camera.aspect = host.clientWidth / host.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(host.clientWidth, host.clientHeight);
        };
        const observer = new ResizeObserver(resize);
        observer.observe(host);

        let frame = 0;
        const tick = () => {
          frame = requestAnimationFrame(tick);
          if (Math.abs(turning) > 0.0005) {
            const step = turning * 0.14;
            camera.position.applyAxisAngle(up, step);
            turning -= step;
          }
          controls.update();
          renderer.render(scene, camera);
        };
        tick();
        setState("ready");

        cleanup = () => {
          cancelAnimationFrame(frame);
          paint.current = null;
          spin.current = null;
          observer.disconnect();
          renderer.domElement.removeEventListener("pointermove", onMove);
          renderer.domElement.removeEventListener("pointerdown", onDown);
          renderer.domElement.removeEventListener("pointerup", onUp);
          controls.dispose();
          renderer.dispose();
          pmrem.dispose();
          renderer.domElement.remove();
        };
      } catch {
        // Без WebGL или при сбое загрузки модели окно должно остаться
        // работающим: текст и кнопка в вейтлист важнее картинки.
        if (!stop) setState("failed");
      }
    })();

    return () => {
      stop = true;
      cleanup();
    };
  }, [spec]);

  const label = (id: string | null) =>
    spec.spots.find((spot) => spot.id === id)?.label ?? "Spot";

  /**
   * Барабан цветов закольцован: лента - три копии списка подряд, и активный
   * всегда в середине окна, с соседями сверху и снизу, как в референсе.
   *
   * slot - позиция на этой тройной ленте. Ехать можно к любому видимому
   * элементу; когда пружина доехала, лента тихо перескакивает на эквивалент
   * в средней копии - глазу перескок не виден, точка та же.
   */
  const count = spec.variants.length;
  const [slot, setSlot] = useState(count);
  const [gliding, setGliding] = useState(true);
  const snapTimer = useRef(0);

  const goTo = (target: number) => {
    const index = ((target % count) + count) % count;
    setGliding(true);
    setSlot(target);
    setVariant(index);
    variantNow.current = index;
    paint.current?.(spec.variants[index].color);
    window.clearTimeout(snapTimer.current);
    snapTimer.current = window.setTimeout(() => {
      if (target < count || target >= count * 2) {
        setGliding(false);
        setSlot(count + index);
      }
    }, 480);
  };

  /** Выбрать цвет с плитки: едем к ближайшему на ленте эквиваленту, чтобы
      барабан крутился в короткую сторону, а не разматывался через весь круг. */
  const pickVariant = (index: number) => {
    if (index < 0 || index >= count) return;
    let best = count + index;
    for (const candidate of [index, count + index, count * 2 + index]) {
      if (Math.abs(candidate - slot) < Math.abs(best - slot)) best = candidate;
    }
    goTo(best);
  };

  const hint = () => {
    if (!hovered) return spec.words.idle;
    const lot = lotFor(hovered);
    if (!lot) return `${label(hovered)} - not for sale yet`;
    return `${label(hovered)} - bidding from ${formatUsd(lot.reserve_cents)}`;
  };

  return (
    <div className="ts">
      {/* Шапка карточки товара: имя крупно, переход к соседней вещи справа. */}
      <header className="ts-top">
        <h1>{spec.name}</h1>
        <button type="button" className="ts-swap" onClick={onSwap}>
          Change product
        </button>
      </header>

      <div className="ts-stage" ref={mount}>
        {state === "loading" && <span className="ts-status">{spec.words.loading}</span>}
        {state === "failed" && (
          <span className="ts-status">This view needs WebGL, which is off here.</span>
        )}
        {/* Стрелки - для тех, кто не догадался потянуть. Тянуть по-прежнему
            можно: они доворачивают ту же камеру. */}
        {state === "ready" && (
          <>
            <button
              type="button"
              className="ts-turn left"
              aria-label="Turn it left"
              onClick={() => spin.current?.(-1)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M14.5 5.5L8 12l6.5 6.5" />
              </svg>
            </button>
            <button
              type="button"
              className="ts-turn right"
              aria-label="Turn it right"
              onClick={() => spin.current?.(1)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9.5 5.5L16 12l-6.5 6.5" />
              </svg>
            </button>

            {/* Широкий экран: по бокам от вещи две дуги, как на витрине
                конфигуратора. Слева - живые ставки идущего торга, справа -
                цвета. На телефоне дуг нет: там цвета остаются плитками. */}
            {arcBids.length > 0 && arcLot && (
              <div className="ts-arc left">
                {arcBids.map((bid, index) => (
                  <button
                    key={bid.id}
                    type="button"
                    className="ts-bid"
                    onClick={() => setPicked(arcLot.listing.kind)}
                    title={`Open the ${label(arcLot.listing.kind)} auction`}
                  >
                    {/* Верхняя ставка - лидирующая, ей оранжевый нашего знака. */}
                    <span className={index === 0 ? "ts-bid-dot lead" : "ts-bid-dot"} />
                    <span className="ts-bid-text">
                      @{bid.bidder_handle} · {formatUsd(bid.amount_cents)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Цвета - закольцованный барабан: выбранный всегда в середине,
                соседи видны сверху и снизу, края тают в маске. Листается
                кликом по любому видимому цвету и колесом над дугой. */}
            <div
              className="ts-arc right"
              role="group"
              aria-label="Colors"
              onWheel={(event) => {
                goTo(slot + (event.deltaY > 0 ? 1 : -1));
              }}
            >
              <div
                className="ts-reel"
                style={{
                  transform: `translateY(${180 - (slot * 72 + 36)}px)`,
                  transition: gliding ? undefined : "none",
                }}
              >
                {[0, 1, 2].flatMap((copy) =>
                  spec.variants.map((option, index) => {
                    const at = copy * count + index;
                    const away = Math.abs(at - slot);
                    return (
                      <button
                        key={`${copy}-${option.label}`}
                        type="button"
                        className={at === slot ? "ts-swatch on" : "ts-swatch"}
                        aria-pressed={at === slot}
                        tabIndex={copy === 1 ? 0 : -1}
                        onClick={() => goTo(at)}
                        style={{
                          // Изгиб дуги: активный ближе всех к вещи, дальние
                          // утоплены к краю и гаснут с расстоянием.
                          transform: `translateX(${-Math.max(0, 18 - 7 * away)}px)`,
                          opacity: Math.max(0.3, 1 - away * 0.26),
                        }}
                      >
                        <span className="ts-swatch-text">{option.label}</span>
                        <span className="ts-swatch-dot">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={option.thumb} alt="" draggable={false} />
                        </span>
                      </button>
                    );
                  }),
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <p className="ts-hint">{hint()}</p>

      {picked && lotFor(picked) ? (
        bidding ? (
          <BidPage
            lot={lotFor(picked)!}
            title={label(picked)}
            onBack={() => setBidding(false)}
          />
        ) : (
          <>
            <button type="button" className="link-back" onClick={() => setPicked(null)}>
              {spec.words.back}
            </button>
            <div className="ts-offers-head">
              <strong>{label(picked)}</strong>
            </div>
            <AuctionLot lot={lotFor(picked)!} onBid={() => setBidding(true)} />
          </>
        )
      ) : (
        <>
          {/* Цвета вещи. Миниатюры - снимки этой же модели: по ним видно, как
              цвет ложится на вещь, чего не скажет цветной кружок. */}
          <div className="ts-variants" role="group" aria-label="Colors">
            {spec.variants.map((option, index) => (
              <button
                key={option.label}
                type="button"
                className={index === variant ? "ts-thumb on" : "ts-thumb"}
                title={option.label}
                aria-pressed={index === variant}
                onClick={() => pickVariant(index)}
              >
                {/* Снимки статические и мелкие, оптимизатору тут нечего делать. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={option.thumb} alt={option.label} draggable={false} />
              </button>
            ))}
          </div>

          <nav className="ts-tabs">
            <button
              type="button"
              className={tab === "about" ? "ts-tab on" : "ts-tab"}
              onClick={() => setTab("about")}
            >
              About
            </button>
            <button
              type="button"
              className={tab === "spots" ? "ts-tab on" : "ts-tab"}
              onClick={() => setTab("spots")}
            >
              Spots
            </button>
          </nav>

          {tab === "about" ? (
            <p className="muted small">
              {role === "advertiser" ? spec.words.forBuyer : spec.words.forSeller}
            </p>
          ) : (
            <div className="ts-rows">
              {spec.spots.map((spot) => {
                const lot = lotFor(spot.id);
                return lot ? (
                  <button
                    key={spot.id}
                    type="button"
                    className="ts-row"
                    onClick={() => setPicked(spot.id)}
                  >
                    <span>{spot.label}</span>
                    <span className="ts-row-price">
                      bidding from {formatUsd(lot.reserve_cents)}
                    </span>
                  </button>
                ) : (
                  <div key={spot.id} className="ts-row">
                    <span>{spot.label}</span>
                    <span className="ts-row-price">not for sale yet</span>
                  </div>
                );
              })}
              {lots.length === 0 && <p className="muted small">{spec.words.empty}</p>}
            </div>
          )}

          {/* Пара кнопок карточки: контурная - поговорить, залитая - в очередь. */}
          <div className="ts-ctas">
            <a className="ts-ghost" href={CALL_URL} target="_blank" rel="noreferrer">
              Book a call
            </a>
            <button className="primary ts-buy" onClick={onWaitlist}>
              Join the waitlist
            </button>
          </div>
        </>
      )}

      {/* Атрибуция модели - самой тихой строкой внизу. Убрать её совсем нельзя:
          CC BY обязывает называть автора рядом с самой вещью. */}
      {spec.credit && (
        <p className="ts-credit">
          3D model{" "}
          <a href={spec.credit.url} target="_blank" rel="noreferrer">
            {spec.credit.who}
          </a>{" "}
          · {spec.credit.licence}
        </p>
      )}
    </div>
  );
}
