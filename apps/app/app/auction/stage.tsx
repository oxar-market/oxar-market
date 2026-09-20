"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { fitInside } from "./fit.ts";
import { DECAL_DEPTH, REPAINT, SPOTS, type Spot } from "./spots.ts";

/**
 * Сама вещь: футболка, которую можно вертеть, с местами под нанесение.
 *
 * Места - это декали: куски геометрии, выштампованные из самой модели по
 * нормали к поверхности. Они повторяют форму ткани, потому что это и есть её
 * поверхность, а не квадрат поверх картинки. Поэтому пятно на рукаве лежит на
 * рукаве, а не висит рядом с ним.
 *
 * three.js и модель грузятся динамически: это сотни килобайт, и тянуть их в
 * основной бандл ради первого экрана нельзя - до сцены человек ещё должен
 * долистать.
 *
 * Без WebGL сцена не поднимется, и это не повод ронять экран: торг, ставки и
 * сроки остаются на месте, вещь заменяется строкой.
 */

export type Stage = {
  /** Довернуть вещь к азимуту. Зовут ряд ракурсов и выбор места из списка. */
  face(azimuth: number): void;
  /**
   * Показать картинку в месте. `null` возвращает пустую рамку.
   *
   * Это превью и только превью: оно живёт в браузере и никуда не уезжает.
   * Чужим оно станет видно, когда картинка приедет вместе со ставкой.
   */
  show(code: string, image: HTMLImageElement | null): void;
};

export function ThingStage({
  picked,
  onPick,
  stage,
  onReady,
}: {
  /** Код выбранного места: оно горит на вещи постоянно. */
  picked: string | null;
  onPick: (code: string) => void;
  /** Сюда сцена кладёт свои ручки, когда собралась. */
  stage: RefObject<Stage | null>;
  /** Сцена собралась и готова показывать картинки. */
  onReady?: () => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [hovered, setHovered] = useState<string | null>(null);

  // Клик по месту приходит из сцены, а обработчик живёт в React. Через ref,
  // чтобы сцену не пересобирать на каждый ре-рендер: пересборка - это заново
  // загруженная модель и заново выштампованные декали.
  const pick = useRef(onPick);
  pick.current = onPick;
  const ready = useRef(onReady);
  ready.current = onReady;
  const pickedNow = useRef(picked);
  const mark = useRef<((code: string | null) => void) | null>(null);

  useEffect(() => {
    pickedNow.current = picked;
    mark.current?.(picked);
  }, [picked]);

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
        // Заполняющий свет сзади заметный, а не символический: половина мест
        // на спине, и под одним передним светом она уходила в серое.
        const fill = new THREE.DirectionalLight(0xffffff, 0.45);
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

        const thing = gltf.scene;
        const meshes: InstanceType<typeof THREE.Mesh>[] = [];
        thing.traverse((node) => {
          if ((node as InstanceType<typeof THREE.Mesh>).isMesh) {
            meshes.push(node as InstanceType<typeof THREE.Mesh>);
          }
        });
        if (meshes.length === 0) throw new Error("в модели нет поверхностей");

        for (const mesh of meshes) {
          mesh.material = new THREE.MeshStandardMaterial({
            color: REPAINT.color,
            roughness: REPAINT.roughness,
            metalness: 0,
          });
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
        // Начальный разворот - к выбранному месту: оно могло смениться, пока
        // сцена собиралась.
        const startSpot =
          SPOTS.find((spot) => spot.code === pickedNow.current) ?? SPOTS[0];
        // К грани, на которой место, а не точно под его угол: угол у места
        // двойной службы, он же сдвиг вбок внутри грани, и камера, поставленная
        // под него, показывала бы вещь вполоборота с первого кадра.
        const first = (Math.round(startSpot.azimuth / 90) * 90 * Math.PI) / 180;
        const far = (reach / Math.tan(fov / 2)) * 1.35;
        camera.position.set(Math.sin(first) * far, 0, Math.cos(first) * far);
        camera.updateProjectionMatrix();
        controls.update();

        const placed = new THREE.Box3().setFromObject(thing);
        const low = placed.min.y;
        const tall = placed.max.y - placed.min.y;
        const placedSize = placed.getSize(new THREE.Vector3());

        // Подиум, как в предметной съёмке: тонкое кольцо на полу и мягкая тень
        // под вещью. Без них она висела в воздухе, и было непонятно, что её
        // можно крутить - кольцо и есть поворотный круг.
        const floor = low + 0.002;
        // Кольцо заметно уже габарита вещи: на узком экране сцена высокая, по
        // горизонтали видно мало, и широкий подиум срезало бы краями - вместо
        // круга получались две дуги, упирающиеся в рамку.
        const ringRadius = Math.max(placedSize.x, placedSize.z) * 0.52;
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

        // Куда именно легло место, решает сама модель: луч снаружи внутрь
        // находит точку на поверхности и её нормаль, и декаль встаёт по ним.
        // Рамки чёрные, а не синие: синий читается как «интерфейс поверх
        // вещи», а место под нанесение - часть самой вещи. Выбранное берёт
        // чернила интерфейса, свободные - на тон мягче, чтобы девять пятен
        // разом не забивали футболку.
        const tint = { idle: 0x3a3d45, hot: 0x16181d };
        const raycaster = new THREE.Raycaster();
        const anchor = new THREE.Object3D();
        const decals: { code: string; mesh: InstanceType<typeof THREE.Mesh> }[] = [];

        for (const spot of SPOTS) {
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
            hit.point
              .clone()
              .add(hit.normal.clone().transformDirection(surface.matrixWorld)),
          );

          const geometry = new DecalGeometry(
            surface,
            hit.point,
            anchor.rotation,
            new THREE.Vector3(spot.size[0], spot.size[1], DECAL_DEPTH),
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
          decals.push({ code: spot.code, mesh });
        }

        // Горят место под курсором и выбранное. Выбранное - постоянно: оно и
        // есть предмет торга на этом экране.
        let over: string | null = null;
        let chosen: string | null = pickedNow.current;
        // Картинки, которые человек примерил сам. Лежат отдельно от общих
        // пустых рамок: те делятся между местами одного размера, а эти свои.
        const mine = new Map<string, InstanceType<typeof THREE.Texture>>();
        const restyle = () => {
          for (const decal of decals) {
            // Место с примеренной картинкой подсветка не трогает: цвет там
            // принадлежит логотипу, а не рамке.
            if (mine.has(decal.code)) continue;
            const material = decal.mesh.material as InstanceType<
              typeof THREE.MeshStandardMaterial
            >;
            const hot = decal.code === over || decal.code === chosen;
            material.color.set(hot ? tint.hot : tint.idle);
            material.opacity = hot ? 1 : 0.88;
          }
        };
        mark.current = (code) => {
          chosen = code;
          restyle();
        };
        restyle();

        // Наведение и клик считаем по самим декалям: они настоящие меши, и
        // попадание в них честнее любой проекции в экранные координаты.
        const pointer = new THREE.Vector2();
        const under = (event: PointerEvent) => {
          const rect = renderer.domElement.getBoundingClientRect();
          pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(pointer, camera);
          const hits = raycaster.intersectObjects(
            decals.map((decal) => decal.mesh),
            false,
          );
          return hits[0]
            ? decals.find((decal) => decal.mesh === hits[0].object)
            : undefined;
        };

        const onMove = (event: PointerEvent) => {
          const found = under(event);
          const code = found?.code ?? null;
          if (code === over) return;
          over = code;
          setHovered(code);
          renderer.domElement.style.cursor = code ? "pointer" : "grab";
          restyle();
        };
        // Клик считаем только если палец не уехал: иначе поворот вещи
        // заканчивался бы сменой выбранного места.
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
          const found = under(event);
          if (found) pick.current(found.code);
        };

        renderer.domElement.addEventListener("pointermove", onMove);
        renderer.domElement.addEventListener("pointerdown", onDown);
        renderer.domElement.addEventListener("pointerup", onUp);

        // Довороты доедаются в цикле кадров долей за кадр - это то же
        // затухание, что у самих контролов, поэтому вещь не дёргается.
        const up = new THREE.Vector3(0, 1, 0);
        let turning = 0;
        stage.current = {
          show(code, image) {
            const decal = decals.find((one) => one.code === code);
            const spot = SPOTS.find((one) => one.code === code);
            if (!decal || !spot) return;
            const material = decal.mesh.material as InstanceType<
              typeof THREE.MeshStandardMaterial
            >;
            // Своя текстура у каждого места: пустые рамки одного размера
            // делятся одной на всех, а картинка у каждого своя, и чужую
            // освобождать нельзя.
            const own = mine.get(code);
            if (own) own.dispose();

            if (!image) {
              mine.delete(code);
              material.map = placeholder(THREE, spot);
              // Рамке цвет возвращает общая подсветка.
              restyle();
              return;
            }

            const texture = artwork(THREE, spot, image);
            mine.set(code, texture);
            material.map = texture;
            // Логотип показываем как есть: синий налёт рамки на нём читался
            // бы как часть печати, а печатать будут именно то, что видно.
            material.color.set(0xffffff);
            material.opacity = 1;
            material.needsUpdate = true;
          },
          face(azimuth) {
            const target = (azimuth * Math.PI) / 180;
            const current = Math.atan2(camera.position.x, camera.position.z);
            let delta = target - current - turning;
            // В короткую сторону круга, с учётом ещё не доеденного поворота.
            delta =
              ((((delta + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) -
              Math.PI;
            turning += delta;
          },
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
        ready.current?.();

        cleanup = () => {
          cancelAnimationFrame(frame);
          for (const texture of mine.values()) texture.dispose();
          mine.clear();
          stage.current = null;
          mark.current = null;
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
        if (!stop) setState("failed");
      }
    })();

    return () => {
      stop = true;
      cleanup();
    };
  }, [stage]);

  return (
    <div className="stage" ref={mount}>
      {state === "loading" && <span className="stage-note">Loading the shirt…</span>}
      {state === "failed" && (
        <span className="stage-note">This view needs WebGL, which is off here.</span>
      )}
      {state === "ready" && (
        <span className="stage-hint">
          {hovered
            ? (SPOTS.find((spot) => spot.code === hovered)?.label ?? "Spot")
            : "Drag to turn the shirt. Tap a spot."}
        </span>
      )}
    </div>
  );
}

/**
 * Свободное место рисуется рамкой, как пустующий щит: пунктир по контуру, чуть
 * заметная заливка, номер внутри. Сплошная заливка читалась как брак печати, а
 * не как место, которое можно занять.
 *
 * Номер, а не «your ad here»: мест пятнадцать, клетка мелкая, и фраза в ней
 * превратилась бы в грязь. Номер же - это то, чем место называют вслух: «беру
 * седьмое». Он и в списке справа, и на самой вещи один и тот же.
 *
 * Рисунок белый, а цвет задаёт материал: тогда наведение по-прежнему меняет
 * один color, а не пересобирает текстуру.
 */
const sheets = new Map<string, InstanceType<typeof import("three").CanvasTexture>>();

function placeholder(THREE: typeof import("three"), spot: Spot) {
  const [wide, tall] = spot.size;
  // Ключ - размер и номер: клетки одного размера отличаются только им.
  const key = `${wide}x${tall}:${spot.label}`;
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

  // Номер посередине клетки. Кегль подбирается под ширину рамки, а не берётся
  // долей от холста: иначе на широком месте цифры вылезают за пунктир.
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const room = canvas.width - (pad + line) * 2 - short * 0.2;
  const font = (size: number) => `600 ${size}px ui-sans-serif, system-ui, sans-serif`;
  let size = short * 0.34;
  ctx.letterSpacing = `${size * 0.04}px`;
  ctx.font = font(size);
  const width = ctx.measureText(spot.label).width;
  if (width > room) {
    size *= room / width;
    ctx.letterSpacing = `${size * 0.04}px`;
    ctx.font = font(size);
  }
  ctx.fillText(spot.label, canvas.width / 2, canvas.height / 2);

  const made = new THREE.CanvasTexture(canvas);
  made.colorSpace = THREE.SRGBColorSpace;
  made.anisotropy = 8;
  sheets.set(key, made);
  return made;
}

/**
 * Логотип в месте: картинка, вписанная в пропорции самого места.
 *
 * Холст делается по форме места, а картинка ложится в него целиком, с полями.
 * Растянуть её по месту нельзя - напечатают ровно то, что видно.
 */
function artwork(
  THREE: typeof import("three"),
  spot: Spot,
  image: HTMLImageElement,
) {
  const [wide, tall] = spot.size;
  const span = 512;
  const canvas = document.createElement("canvas");
  canvas.width = wide >= tall ? span : Math.round((span * wide) / tall);
  canvas.height = wide >= tall ? Math.round((span * tall) / wide) : span;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("нет 2d-контекста");

  const box = fitInside(
    { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height },
    { width: canvas.width, height: canvas.height },
  );
  ctx.drawImage(image, box.x, box.y, box.width, box.height);

  const made = new THREE.CanvasTexture(canvas);
  made.colorSpace = THREE.SRGBColorSpace;
  made.anisotropy = 8;
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
