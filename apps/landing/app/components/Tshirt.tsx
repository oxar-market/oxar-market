"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Трёхмерный макет футболки. Вещь крутится мышью и пальцем, как в любом
 * конструкторе мерча, а места под нанесение висят на самой ткани: их позиции
 * пересчитываются из точек на модели в экранные координаты на каждом кадре,
 * и место гаснет, когда уезжает на другую сторону.
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
  /** Точка на поверхности модели, в её собственных координатах. */
  at: [number, number, number];
  /** Куда смотрит ткань в этой точке: по ней считаем, видно место или нет. */
  face: [number, number, number];
};

const SPOTS: Spot[] = [
  { id: "chest", label: "Chest", at: [0, 0.02, 0.14], face: [0, 0, 1] },
  { id: "left-chest", label: "Left chest", at: [-0.09, 0.1, 0.115], face: [-0.3, 0, 1] },
  { id: "right-chest", label: "Right chest", at: [0.09, 0.1, 0.115], face: [0.3, 0, 1] },
  { id: "hem-front", label: "Front hem", at: [0, -0.26, 0.1], face: [0, 0, 1] },
  { id: "back", label: "Back", at: [0, 0.02, -0.12], face: [0, 0, -1] },
  { id: "nape", label: "Nape", at: [0, 0.19, -0.08], face: [0, 0.3, -1] },
  { id: "sleeve-left", label: "Left sleeve", at: [-0.23, 0.12, 0.02], face: [-1, 0.2, 0] },
  { id: "sleeve-right", label: "Right sleeve", at: [0.23, 0.12, 0.02], face: [1, 0.2, 0] },
];

type Marker = { id: string; label: string; x: number; y: number; on: boolean };

export function Tshirt({ role, onWaitlist }: { role: Role; onWaitlist: () => void }) {
  const mount = useRef<HTMLDivElement>(null);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

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
        if (stop) return;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(host.clientWidth, host.clientHeight);
        host.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        // Комната вместо файла с картой окружения: ткань без отражений выглядит
        // как бумажная выкройка, а лишний ассет тянуть не хочется.
        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

        // Свет сверху-сбоку поверх мягкой заливки: без него белая ткань на
        // светлом фоне теряет объём и читается плоским пятном.
        const key = new THREE.DirectionalLight(0xffffff, 1.6);
        key.position.set(1.2, 1.6, 1.4);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xffffff, 0.5);
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
        shirt.traverse((node) => {
          const mesh = node as { isMesh?: boolean; material?: unknown };
          if (!mesh.isMesh) return;
          // Модель приходит с запечённой текстурой чужого демо. Нам нужна
          // чистая белая вещь: на ней читаются наши места, а не чужой принт.
          mesh.material = new THREE.MeshStandardMaterial({
            color: 0xe9ebef,
            roughness: 0.85,
            metalness: 0,
          });
        });

        // Модель кладём в центр вида и отводим камеру ровно настолько, чтобы
        // вещь влезала целиком: единицы у чужой модели могут быть любыми, а
        // подобранное на глаз расстояние срезало плечи.
        const box = new THREE.Box3().setFromObject(shirt);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const scale = 0.62 / Math.max(size.x, size.y);
        shirt.scale.setScalar(scale);
        shirt.position.sub(center.multiplyScalar(scale));
        scene.add(shirt);

        const reach = 0.62 * 0.5;
        const fov = (camera.fov * Math.PI) / 180;
        camera.position.set(0, 0, (reach / Math.tan(fov / 2)) * 1.35);
        camera.updateProjectionMatrix();
        controls.update();

        const points = SPOTS.map((spot) => ({
          spot,
          at: new THREE.Vector3(...spot.at),
          face: new THREE.Vector3(...spot.face).normalize(),
        }));

        const world = new THREE.Vector3();
        const normal = new THREE.Vector3();
        const toCamera = new THREE.Vector3();

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

          const next: Marker[] = [];
          for (const point of points) {
            world.copy(point.at).applyMatrix4(shirt.matrixWorld);
            normal.copy(point.face).transformDirection(shirt.matrixWorld);
            toCamera.copy(camera.position).sub(world).normalize();
            // Ткань отвернулась от зрителя - место сейчас с той стороны.
            if (normal.dot(toCamera) < 0.15) continue;

            const projected = world.clone().project(camera);
            next.push({
              id: point.spot.id,
              label: point.spot.label,
              x: (projected.x * 0.5 + 0.5) * 100,
              y: (-projected.y * 0.5 + 0.5) * 100,
              on: true,
            });
          }
          setMarkers(next);
        };
        tick();
        setState("ready");

        cleanup = () => {
          cancelAnimationFrame(frame);
          observer.disconnect();
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

        {markers.map((marker) => (
          <button
            key={marker.id}
            type="button"
            className={hovered === marker.id ? "ts-spot on" : "ts-spot"}
            style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
            onClick={onWaitlist}
            onPointerEnter={() => setHovered(marker.id)}
            onPointerLeave={() => setHovered(null)}
            aria-label={marker.label}
          />
        ))}
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
