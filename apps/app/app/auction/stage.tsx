"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { fitInside } from "./fit.ts";
import { DECAL_DEPTH, REPAINT, SPOTS, type Spot } from "./spots.ts";
import { develop } from "./tone.ts";

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
  /**
   * Сцена собралась и готова показывать картинки. Вместе с этим отдаёт четыре
   * снимка вещи - перёд, правый бок, спину, левый, - по одному на ракурс.
   */
  onReady?: (views: string[]) => void;
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
        scene.environment = pmrem.fromScene(studio(THREE), 0.03).texture;
        scene.environmentIntensity = 1;

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

        // Номера мест рисуются в канвас, а текстура кэшируется навсегда.
        // Успей мы до того, как доехал шрифт, - цифры на вещи остались бы
        // системными, и переснять их было бы нечем.
        await document.fonts.ready;
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

        // Ткань, а не пластик. Три вещи делают разницу: карта нормалей под
        // переплетение, sheen - физический параметр ворса, - и высокая
        // шершавость. Без них свет ложится ровным пятном, и вещь читается
        // как отливка.
        const weave = knitMap(THREE);
        for (const mesh of meshes) {
          mesh.material = new THREE.MeshPhysicalMaterial({
            color: REPAINT.color,
            roughness: 0.96,
            metalness: 0,
            sheen: 1,
            sheenRoughness: 0.85,
            sheenColor: new THREE.Color(0xffffff),
            normalMap: weave,
            normalScale: new THREE.Vector2(0.55, 0.55),
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

        // Кромки: горловина, низ рукавов, подол. Их в модели нет вовсе -
        // она гладкая труба с рукавами, - а в настоящей вещи именно они и
        // читаются как шитьё.
        for (const edge of hems(THREE, meshes)) scene.add(edge);

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

        // Тень держим в переменной: её, как и кольцо, надо убрать со снимков
        // для кнопок - в кнопке размером с ноготь подиум читается как грязь.
        let shadow: InstanceType<typeof THREE.Mesh> | null = null;
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
          shadow = disc;
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

        /**
         * Четыре снимка вещи - по одному на ракурс, для кнопок под сценой.
         *
         * Снимает тот же рендерер и та же сцена, сразу после сборки: кнопка
         * показывает саму вещь, а не слово «Back», и показывает её ровно
         * такой, какая она на экране. Отдельные картинки в репозитории для
         * этого не нужны, а главное - они разошлись бы с моделью молча.
         *
         * Снимок один раз и навсегда: примеренный логотип на кнопках не
         * появится. Кнопка отвечает на «с какой стороны смотрим», а не «что
         * сейчас на вещи», и перерисовывать её на каждую картинку значило бы
         * гонять рендер ради ногтя.
         */
        const views = (() => {
          const side = 320;
          const paper = document.createElement("canvas");
          paper.width = paper.height = side;
          const ink = paper.getContext("2d");
          if (!ink) return [];

          // Цветовое пространство у цели не задаётся намеренно: three всё
          // равно пишет в неё рабочий линейный цвет, а не то, что здесь
          // попросишь, - ветка на sRGB есть только у холста и у XR. Прежняя
          // строка выглядела как настройка, а не делала ничего.
          const target = new THREE.WebGLRenderTarget(side, side);
          const lens = new THREE.PerspectiveCamera(camera.fov, 1, 0.1, 100);
          // Кадр теснее, чем на сцене: в кнопке каждый пиксель на счету.
          const back = (reach / Math.tan(fov / 2)) * 1.12;
          const pixels = new Uint8Array(side * side * 4);
          const shots: string[] = [];

          ring.visible = false;
          if (shadow) shadow.visible = false;

          for (let quarter = 0; quarter < 4; quarter++) {
            const angle = (quarter * Math.PI) / 2;
            lens.position.set(Math.sin(angle) * back, 0, Math.cos(angle) * back);
            lens.lookAt(0, 0, 0);
            renderer.setRenderTarget(target);
            renderer.render(scene, lens);
            renderer.readRenderTargetPixels(target, 0, 0, side, side, pixels);

            // Плёночная кривая и перевод в sRGB - руками: в рендер-цель three
            // последний проход не выполняет, и без проявки светлая вещь на
            // кнопке выбивалась в чистый белый. Выдержку берём у рендерера,
            // чтобы снимок не разошёлся со сценой при её правке.
            develop(pixels, renderer.toneMappingExposure);

            const image = ink.createImageData(side, side);
            // Строки переворачиваются: GL считает их от нижнего края кадра,
            // канвас - от верхнего, и без этого вещь встаёт на голову.
            for (let row = 0; row < side; row++) {
              const from = (side - 1 - row) * side * 4;
              image.data.set(pixels.subarray(from, from + side * 4), row * side * 4);
            }
            ink.putImageData(image, 0, 0);
            shots.push(paper.toDataURL("image/webp", 0.85));
          }

          renderer.setRenderTarget(null);
          target.dispose();
          ring.visible = true;
          if (shadow) shadow.visible = true;
          return shots;
        })();

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
        ready.current?.(views);

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
  // Шрифт берём у страницы: в канвас переменная из CSS не приходит, а имя
  // семейства next/font собирает сам и на каждой сборке заново.
  const font = (size: number) => `600 ${size}px ${getComputedStyle(document.body).fontFamily}`;
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

/**
 * Карта нормалей трикотажа, нарисованная на месте.
 *
 * Своя, а не скачанная: чужой файл - это лицензия, вес и ещё одна вещь,
 * которая разойдётся с моделью молча. Здесь двести пятьдесят шесть точек в
 * квадрате и немного синусов.
 *
 * Без неё ткань освещается как гладкий пластик: свет ложится ровным пятном, и
 * вещь читается как отливка, а не как полотно. Здесь - ряды петель со сдвигом
 * через ряд, поперечный рубчик и мелкое зерно под ворс, а из высот считаются
 * нормали разностями.
 */
function knitMap(THREE: typeof import("three")) {
  const side = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = side;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("нет 2d-контекста");

  const cols = 14;
  const rows = 18;
  const height = new Float32Array(side * side);
  for (let y = 0; y < side; y++) {
    const row = Math.floor((y / side) * rows);
    const shift = row % 2 ? Math.PI : 0;
    for (let x = 0; x < side; x++) {
      const loop = Math.sin((x / side) * cols * Math.PI * 2 + shift) * 0.5 + 0.5;
      const rib = Math.sin((y / side) * rows * Math.PI * 2) * 0.5 + 0.5;
      height[y * side + x] = loop * 0.5 + rib * 0.32 + Math.random() * 0.18;
    }
  }

  const at = (x: number, y: number) =>
    height[((y + side) % side) * side + ((x + side) % side)];

  const image = ctx.createImageData(side, side);
  const strength = 2.4;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const nx = -(at(x + 1, y) - at(x - 1, y)) * strength;
      const ny = -(at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(nx, ny, 1);
      const at4 = (y * side + x) * 4;
      image.data[at4] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      image.data[at4 + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      image.data[at4 + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      image.data[at4 + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  const made = new THREE.CanvasTexture(canvas);
  made.wrapS = made.wrapT = THREE.RepeatWrapping;
  made.repeat.set(26, 26);
  made.anisotropy = 8;
  return made;
}

/**
 * Съёмочный павильон вместо типовой комнаты three.
 *
 * `RoomEnvironment` освещает вещь как интерьер: свет ровный и со всех сторон.
 * Белая футболка в нём теряет края - ей нечем отделиться от белого фона.
 * В предметной съёмке делают обратное: тёмное окружение и несколько крупных
 * мягких источников, и тогда по краю вещи идёт тонкая серая грань, которая и
 * рисует форму.
 */
function studio(THREE: typeof import("three")) {
  const room = new THREE.Scene();

  const panel = (
    width: number,
    height: number,
    glow: number,
    place: [number, number, number],
    look: [number, number, number] = [0, 0, 0],
  ) => {
    const light = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(glow, glow, glow) }),
    );
    light.position.set(...place);
    light.lookAt(...look);
    room.add(light);
    return light;
  };

  // Тёмные стены - это и есть то, от чего белая вещь отделяется.
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(10, 10, 10),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.06, 0.06, 0.065),
      side: THREE.BackSide,
    }),
  );
  room.add(walls);

  // Крупный верхний софтбокс спереди - главный. Он же даёт блик по плечам.
  panel(6, 4, 4.2, [0.6, 3.2, 2.6]);
  // Заполняющий слева, вдвое тише: без него левая половина проваливается.
  panel(5, 5, 1.5, [-3.4, 0.6, 1.4]);
  // Справа ещё тише - разница между сторонами и делает объём.
  panel(4, 5, 0.7, [3.4, 0.4, 0.6]);
  // Контровой сзади: тонкая светлая грань по силуэту, как в каталоге.
  panel(4, 4, 2.6, [-1.2, 1.4, -3.4]);
  // Отражение от пола, слабое: снизу вещь не должна быть черной.
  panel(6, 6, 0.5, [0, -2.6, 0], [0, 1, 0]);

  return room;
}

/**
 * Кромки вещи, построенные по её собственным дыркам.
 *
 * Горловина, низ рукавов и подол - это границы полотна: рёбра, у которых
 * только один треугольник. Найти их можно прямо в геометрии, ничего не
 * покупая и не рисуя. Дальше по каждой границе идёт трубка - так выглядит
 * подвёрнутый и прошитый край, - а у горловины она толще, потому что там
 * вязаная резинка, а не подгиб.
 *
 * Вершины сначала склеиваются по координате: glTF режет их по швам UV, и без
 * склейки каждое такое ребро выглядело бы границей.
 */
function hems(
  THREE: typeof import("three"),
  meshes: InstanceType<typeof import("three").Mesh>[],
) {
  const made: InstanceType<typeof import("three").Mesh>[] = [];

  for (const mesh of meshes) {
    const position = mesh.geometry.attributes.position;
    const index = mesh.geometry.index;
    const grid = 1e4;

    const points: InstanceType<typeof THREE.Vector3>[] = [];
    const seen = new Map<string, number>();
    const weld = (raw: number) => {
      const spot = new THREE.Vector3().fromBufferAttribute(position, raw);
      const key = `${Math.round(spot.x * grid)},${Math.round(spot.y * grid)},${Math.round(spot.z * grid)}`;
      let id = seen.get(key);
      if (id === undefined) {
        id = points.length;
        seen.set(key, id);
        points.push(spot);
      }
      return id;
    };

    const times = new Map<string, number>();
    const total = index ? index.count : position.count;
    for (let at = 0; at < total; at += 3) {
      const corners = [0, 1, 2].map((step) =>
        weld(index ? index.getX(at + step) : at + step),
      );
      for (let side = 0; side < 3; side++) {
        const from = corners[side];
        const to = corners[(side + 1) % 3];
        const key = from < to ? `${from}:${to}` : `${to}:${from}`;
        times.set(key, (times.get(key) ?? 0) + 1);
      }
    }

    // Соседи по границе: у каждой вершины края их ровно двое.
    const next = new Map<number, number[]>();
    for (const [key, count] of times) {
      if (count !== 1) continue;
      const [from, to] = key.split(":").map(Number);
      (next.get(from) ?? next.set(from, []).get(from)!).push(to);
      (next.get(to) ?? next.set(to, []).get(to)!).push(from);
    }

    const walked = new Set<number>();
    const loops: number[][] = [];
    for (const start of next.keys()) {
      if (walked.has(start)) continue;
      const loop = [start];
      walked.add(start);
      let here = start;
      for (;;) {
        const step = (next.get(here) ?? []).find((one) => !walked.has(one));
        if (step === undefined) break;
        walked.add(step);
        loop.push(step);
        here = step;
      }
      // Меньше десятка точек - это дырка в сетке, а не край вещи.
      if (loop.length > 12) loops.push(loop);
    }
    if (loops.length === 0) continue;

    // Горловина - самая высокая из границ. У неё резинка, она толще.
    const heights = loops.map((loop) =>
      loop.reduce((sum, one) => sum + points[one].y, 0) / loop.length,
    );
    const collar = heights.indexOf(Math.max(...heights));

    mesh.geometry.computeBoundingBox();
    const span = (mesh.geometry.boundingBox ?? new THREE.Box3()).getSize(
      new THREE.Vector3(),
    );
    const thin = Math.max(span.x, span.y) * 0.004;

    loops.forEach((loop, which) => {
      const curve = new THREE.CatmullRomCurve3(
        loop.map((one) => points[one]),
        true,
        "centripetal",
      );
      const edge = new THREE.Mesh(
        new THREE.TubeGeometry(
          curve,
          Math.min(loop.length, 420),
          which === collar ? thin * 2.4 : thin,
          8,
          true,
        ),
        new THREE.MeshPhysicalMaterial({
          color: REPAINT.color,
          roughness: 0.98,
          metalness: 0,
          sheen: 1,
          sheenRoughness: 0.9,
          sheenColor: new THREE.Color(0xffffff),
        }),
      );
      edge.applyMatrix4(mesh.matrixWorld);
      made.push(edge);
    });
  }

  return made;
}
