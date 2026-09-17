"use client";

import { useEffect, useRef, useState } from "react";
import { formatUsd } from "@oxar/core";
import { lotsOnSurface, type Lot } from "@/lib/auctions";
import { AuctionLot } from "./AuctionLot";

/**
 * Трёхмерный макет футболки. Вещь крутится мышью и пальцем, как в любом
 * конструкторе мерча.
 *
 * Места под нанесение - это декали: куски геометрии, выштампованные из самой
 * модели по нормали к поверхности. Они повторяют складки ткани и заминаются
 * вместе с ней, потому что это и есть ткань, а не квадрат поверх картинки.
 *
 * three.js и сама модель грузятся динамически, только когда окно открыли: это
 * около мегабайта, и тянуть его в основной бандл ради одной иконки на столе
 * нельзя.
 *
 * Зоны названы так же, как места в каталоге: по этому имени вид находит свой
 * лот. Зона, выставленная на торги, ведёт в форму ставки; остальные - в
 * вейтлист, потому что обещать цену на непроданном месте нечем.
 *
 * Эскроу тут нет намеренно, и это не упущение. Он отдаёт деньги за время,
 * которое размещение простояло, а простой ткани проверить нечем: ни строки, ни
 * картинки профиля, ни id поста. Плюс печать - невозвратная трата продавца до
 * начала. Разобрано в docs/plan-payments.md.
 */

type Role = "creator" | "advertiser";

type Spot = {
  id: string;
  label: string;
  /** Высота на вещи: 0 - низ, 1 - плечи. */
  height: number;
  /** Угол вокруг оси: 0 - грудь, 180 - спина, ±90 - бока. */
  azimuth: number;
  /** Размер пятна на ткани, в единицах модели. */
  size: [number, number];
};

// Место задано высотой и углом, а не точкой в пространстве: луч летит
// горизонтально с этой высоты под этим углом, и куда он попадёт, понятно
// заранее. Подбирать координаты на глаз для чужой модели - гиблое дело.
//
// Размечена вся вещь: три панели спереди, три сзади, загривок, оба бока и оба
// рукава. Одиннадцать отдельных мест, а не одно большое пятно - продаётся
// каждое по отдельности, как девять зон на аватарке Solana.
//
// Ловушка, на которой развалилась прошлая раскладка: `height` - это доля от
// высоты вещи, от 0 до 1, а `size` - единицы модели. Шкалы разные. Вещь
// ростом SHIRT_SPAN единиц, поэтому панель высотой 0.14 единиц занимает
// 0.14 / 0.62 = 23% роста, и «зазор» в 0.07 доли, то есть 0.043 единицы,
// съедается ею целиком. Соседи налезали друг на друга.
//
// Поэтому вертикаль здесь посчитана, а не подобрана на глаз: перёд и спина
// делятся на три панели по PANEL_TALL единиц с зазором PANEL_GAP между ними.
//
// Второе правило: азимуты соседей расходятся на 90 градусов, а не на 20.
// Смещение по горизонтали равно радиусу торса на синус угла, и на ±20 оно
// меньше половины ширины грудной панели - метка на груди оказывается внутри
// неё. Отдельных грудных меток поэтому нет: на этом масштабе они занимали три
// процента вещи и лезли под воротник.

/** Во столько единиц модели вписана вещь: см. scale ниже по файлу. */
const SHIRT_SPAN = 0.62;
/** Высота одной панели и просвет между соседями, в единицах модели. */
const PANEL_TALL = 0.1;
const PANEL_GAP = 0.036;

/** Доля роста для центра панели номер index, считая снизу. */
function panelHeight(index: number): number {
  const bottom = 0.18 * SHIRT_SPAN;
  return (bottom + PANEL_TALL / 2 + index * (PANEL_TALL + PANEL_GAP)) / SHIRT_SPAN;
}

const SPOTS: Spot[] = [
  // Перёд: подол, живот, грудь - три панели одной высоты с равным просветом
  { id: "tshirt_hem_front", label: "Front hem", height: panelHeight(0), azimuth: 0, size: [0.18, PANEL_TALL] },
  { id: "tshirt_stomach", label: "Stomach", height: panelHeight(1), azimuth: 0, size: [0.18, PANEL_TALL] },
  { id: "tshirt_chest", label: "Chest", height: panelHeight(2), azimuth: 0, size: [0.18, PANEL_TALL] },
  // Бока: узкие полосы между панелями и рукавами
  { id: "tshirt_side_left", label: "Left side", height: 0.45, azimuth: -90, size: [0.06, 0.16] },
  { id: "tshirt_side_right", label: "Right side", height: 0.45, azimuth: 90, size: [0.06, 0.16] },
  // Рукава ниже плечевого шва, иначе пятно заезжает на плечо
  { id: "tshirt_sleeve_left", label: "Left sleeve", height: 0.7, azimuth: -78, size: [0.07, 0.05] },
  { id: "tshirt_sleeve_right", label: "Right sleeve", height: 0.7, azimuth: 78, size: [0.07, 0.05] },
  // Спина, зеркально переду, плюс загривок над верхней панелью
  { id: "tshirt_hem_back", label: "Back hem", height: panelHeight(0), azimuth: 180, size: [0.2, PANEL_TALL] },
  { id: "tshirt_lower_back", label: "Lower back", height: panelHeight(1), azimuth: 180, size: [0.2, PANEL_TALL] },
  { id: "tshirt_back", label: "Back", height: panelHeight(2), azimuth: 180, size: [0.2, PANEL_TALL] },
  { id: "tshirt_nape", label: "Nape", height: 0.87, azimuth: 180, size: [0.1, 0.04] },
];

// Глубина коробки, которой декаль вырезается из ткани. Было 0.12, и на этом
// боковые пятна заворачивались на перёд: коробка на боку захватывала и
// переднюю поверхность тоже, потому что там ткань круто уходит за угол.
// Ткань тонкая, ей хватает малого.
const DECAL_DEPTH = 0.07;

/** Подпись под моделью: что за зона и в каких она торгах. */
function hint(hovered: string | null, lot: Lot | null): string {
  if (!hovered) return "Drag to turn the shirt. Tap a spot.";
  const label = SPOTS.find((spot) => spot.id === hovered)?.label ?? "Spot";
  if (!lot) return `${label} - not for sale yet`;
  return `${label} - bidding from ${formatUsd(lot.reserve_cents)}`;
}

export function Tshirt({ role, onWaitlist }: { role: Role; onWaitlist: () => void }) {
  const mount = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  // Клик по месту приходит из сцены, а обработчик живёт в React. Через ref -
  // чтобы сцену не пересобирать на каждый ре-рендер.
  const [lots, setLots] = useState<Lot[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  // Клик по месту приходит из сцены, а обработчик живёт в React. Через ref -
  // чтобы сцену не пересобирать на каждый ре-рендер.
  const onPick = useRef<(id: string) => void>(() => {});
  onPick.current = (id) => setPicked(id);

  useEffect(() => {
    lotsOnSurface("tshirt").then(setLots);
  }, []);

  const lotFor = (id: string | null) =>
    lots.find((lot) => lot.listing.kind === id) ?? null;

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
        // Плёночная кривая с приглушённой выдержкой: без неё белая ткань под
        // студийным светом выбивалась в чистый белый и теряла складки.
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

        const gltf = await new GLTFLoader().loadAsync("/models/shirt.glb");
        if (stop) {
          renderer.dispose();
          return;
        }

        const shirt = gltf.scene;
        const cloth = shirt.getObjectByProperty("isMesh", true) as
          | InstanceType<typeof THREE.Mesh>
          | undefined;
        if (!cloth) throw new Error("в модели нет ткани");

        // Модель приходит с запечённой текстурой чужого демо. Нам нужна чистая
        // вещь: на ней читаются наши места, а не чужой принт.
        // Светлее прежнего, но не белая: на чистом белом под этой выдержкой
        // пропадают складки, а вместе с ними и ощущение вещи.
        cloth.material = new THREE.MeshStandardMaterial({
          color: 0xedeff3,
          roughness: 0.92,
          metalness: 0,
        });

        const box = new THREE.Box3().setFromObject(shirt);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const scale = 0.62 / Math.max(size.x, size.y);
        shirt.scale.setScalar(scale);
        shirt.position.sub(center.multiplyScalar(scale));
        scene.add(shirt);
        shirt.updateMatrixWorld(true);

        const reach = 0.62 * 0.5;
        const fov = (camera.fov * Math.PI) / 180;
        camera.position.set(0, 0, (reach / Math.tan(fov / 2)) * 1.35);
        camera.updateProjectionMatrix();
        controls.update();

        // Куда именно легло место, решает сама модель: луч снаружи внутрь
        // находит точку на ткани и её нормаль, и декаль встаёт по ним.
        const raycaster = new THREE.Raycaster();
        const anchor = new THREE.Object3D();
        const decals: { id: string; label: string; mesh: InstanceType<typeof THREE.Mesh> }[] =
          [];

        const placed = new THREE.Box3().setFromObject(shirt);
        const low = placed.min.y;
        const tall = placed.max.y - placed.min.y;

        for (const spot of SPOTS) {
          const angle = (spot.azimuth * Math.PI) / 180;
          const dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
          const start = dir
            .clone()
            .multiplyScalar(1.2)
            .setY(low + tall * spot.height);
          raycaster.set(start, dir.clone().negate());
          const hit = raycaster.intersectObject(cloth, false)[0];
          if (!hit || !hit.normal) continue;

          anchor.position.copy(hit.point);
          anchor.lookAt(hit.point.clone().add(hit.normal.clone().transformDirection(cloth.matrixWorld)));

          const geometry = new DecalGeometry(
            cloth,
            hit.point,
            anchor.rotation,
            new THREE.Vector3(spot.size[0], spot.size[1], DECAL_DEPTH),
          );
          const material = new THREE.MeshStandardMaterial({
            color: 0x4aa8ec,
            roughness: 0.95,
            metalness: 0,
            transparent: true,
            // Сквозь пятно по-прежнему читается ткань со складками, но само
            // пятно видно с первого взгляда: на посветлевшей ткани прежний
            // бледно-голубой при 0.6 почти сливался с фоном.
            opacity: 0.74,
            // Декаль лежит ровно на ткани, поэтому её надо чуть приподнять -
            // иначе поверхности спорят и пятно мерцает полосами.
            polygonOffset: true,
            polygonOffsetFactor: -4,
            depthWrite: false,
          });
          const mesh = new THREE.Mesh(geometry, material);
          scene.add(mesh);
          decals.push({ id: spot.id, label: spot.label, mesh });
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
            material.color.set(decal.id === id ? 0x0a7fd4 : 0x4aa8ec);
            material.opacity = decal.id === id ? 0.92 : 0.74;
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
          controls.update();
          renderer.render(scene, camera);
        };
        tick();
        setState("ready");

        cleanup = () => {
          cancelAnimationFrame(frame);
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
  }, []);

  return (
    <div className="ts">
      <div className="ts-stage" ref={mount}>
        {state === "loading" && <span className="ts-status">Loading the shirt…</span>}
        {state === "failed" && (
          <span className="ts-status">This view needs WebGL, which is off here.</span>
        )}
      </div>

      <p className="ts-hint">
        {hint(hovered, lotFor(hovered))}
      </p>

      {picked && lotFor(picked) ? (
        <>
          <button type="button" className="link-back" onClick={() => setPicked(null)}>
            Back to the shirt
          </button>
          <div className="ts-offers-head">
            <strong>{SPOTS.find((spot) => spot.id === picked)?.label}</strong>
          </div>
          <AuctionLot lot={lotFor(picked)!} />
        </>
      ) : (
        <>
          <p className="muted small">
            {role === "advertiser"
              ? "Every marked area is a surface you could rent - on a team shirt, a merch drop, a conference tee."
              : "Every marked area is something a club or a team could rent out."}
          </p>
          {lots.length === 0 && (
            <p className="muted small">
              Nothing is up for auction on a shirt right now. A profile can be checked
              automatically, a shirt needs a photo and a place - that part is done by
              hand.
            </p>
          )}
          <button className="primary ts-cta" onClick={onWaitlist}>
            Join the waitlist
          </button>
        </>
      )}
    </div>
  );
}
