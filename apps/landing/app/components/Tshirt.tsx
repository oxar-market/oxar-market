"use client";

import { useEffect, useRef, useState } from "react";

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
 * Цен здесь нет намеренно. Ни одна футболка ещё не продана, проверять
 * размещение на ткани мы пока не умеем, и ставить цифру было бы обещанием,
 * которого мы не выполним. Место ведёт в вейтлист.
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
const SPOTS: Spot[] = [
  { id: "chest", label: "Chest", height: 0.56, azimuth: 0, size: [0.14, 0.12] },
  { id: "left-chest", label: "Left chest", height: 0.72, azimuth: -22, size: [0.05, 0.045] },
  { id: "right-chest", label: "Right chest", height: 0.72, azimuth: 22, size: [0.05, 0.045] },
  { id: "hem-front", label: "Front hem", height: 0.14, azimuth: 0, size: [0.11, 0.04] },
  { id: "back", label: "Back", height: 0.56, azimuth: 180, size: [0.15, 0.14] },
  { id: "nape", label: "Nape", height: 0.86, azimuth: 180, size: [0.08, 0.03] },
  { id: "sleeve-left", label: "Left sleeve", height: 0.74, azimuth: -78, size: [0.055, 0.045] },
  { id: "sleeve-right", label: "Right sleeve", height: 0.74, azimuth: 78, size: [0.055, 0.045] },
];

export function Tshirt({ role, onWaitlist }: { role: Role; onWaitlist: () => void }) {
  const mount = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  // Клик по месту приходит из сцены, а обработчик живёт в React. Через ref -
  // чтобы сцену не пересобирать на каждый ре-рендер.
  const waitlist = useRef(onWaitlist);
  waitlist.current = onWaitlist;

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
        cloth.material = new THREE.MeshStandardMaterial({
          color: 0xdcdfe4,
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
            new THREE.Vector3(spot.size[0], spot.size[1], 0.12),
          );
          const material = new THREE.MeshStandardMaterial({
            color: 0x9fcdf0,
            roughness: 0.95,
            metalness: 0,
            transparent: true,
            // Полупрозрачно: сквозь пятно должна читаться ткань, иначе это уже
            // не размеченное место, а закрашенный кусок вещи.
            opacity: 0.6,
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
            material.color.set(decal.id === id ? 0x1d9bf0 : 0x9fcdf0);
            material.opacity = decal.id === id ? 0.8 : 0.6;
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
          if (pick(event)) waitlist.current();
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
        {hovered
          ? SPOTS.find((spot) => spot.id === hovered)?.label
          : "Drag to turn the shirt. Tap a spot to sign up."}
      </p>

      <p className="muted small">
        {role === "advertiser"
          ? "Every marked area is a surface you could rent - on a team shirt, a merch drop, a conference tee."
          : "Every marked area is something a club or a team could rent out."}
      </p>
      <p className="muted small">
        Nobody is selling shirts yet. A profile can be checked automatically, a shirt
        needs a photo and a place - that part is next.
      </p>
      <button className="primary ts-cta" onClick={onWaitlist}>
        Join the waitlist
      </button>
    </div>
  );
}
