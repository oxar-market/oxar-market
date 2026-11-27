"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Group, Mesh, MeshBasicMaterial, Object3D, Quaternion, Vector3 } from "three";
import type { Shape } from "./spots.ts";
import { dress } from "./dress.ts";

/**
 * Витрина главной: глобус с нашими вещами, который по прокрутке
 * раскладывается в бесконечное поле мест.
 *
 * Порядок показа:
 * 1. Пока грузятся модели, из точек собирается знак OXAR. Страница не
 *    показывается, пока не загружено всё: дальше ничего не подгружается.
 * 2. Знак улетает в шапку - ровно туда, где стоит логотип (markTarget).
 * 3. Появляется глобус, вещи по очереди опускаются на него. Его тянут
 *    мышью или пальцем во все стороны; точки под курсором приподнимаются.
 * 4. Колесо (или свайп мимо шара) - шар уходит вниз за экран, вещи по дуге
 *    летят в свои плитки поля. Обратно на шар не возвращаемся: поле
 *    бесконечное, по нему дальше и ходят.
 *
 * Данных и сети здесь нет: вещи и адреса картинок приходят снаружи.
 */

export type GlobeThing = {
  id: string;
  /** Куда ведёт клик по вещи. */
  href: string;
  /** Подпись плитки в поле. */
  title: string;
  /** Строка внизу слева, когда курсор на вещи. */
  caption: string;
  live: boolean;
  /** Пометка рядом с названием, когда это не торг: «Pilot» - прогон идеи без ставок. */
  tag?: string;
  /** Модель: у наших вещей - из формы, у прочих - своя. */
  model: string;
  shape?: Shape;
  /** Картинки мест: код места - адреса по порядку, берётся первый, что откроется. */
  logos: Record<string, string[]>;
};

type Three = typeof import("three");

/** Где стоят вещи на шаре: широта и долгота, разбросано, а не по верху. */
const ON: [number, number][] = [
  [-0.35, 0.32],
  [0.95, -0.3],
  [2.15, 0.52],
  [3.35, -0.12],
  [4.6, 0.22],
  [5.6, -0.45],
  [1.6, 0.05],
  [2.8, -0.55],
];

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => x * x * (3 - 2 * x);
const out = (x: number) => 1 - Math.pow(1 - x, 3);
const wrap = (v: number, s: number) => (((v % s) + s * 1.5) % s) - s / 2;

/** Поле: колонки со сдвигом через одну, как у развеса работ на выставке. */
function layout(small: boolean) {
  const T = small ? 104 : 142;
  const PX = small ? 190 : 277;
  const PY = small ? 218 : 300;
  const OFF = small ? 54 : 72;
  const COLS = 8;
  const ROWS = 4;
  const cells: { x: number; y: number }[] = [];
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) cells.push({ x: c * PX, y: r * PY + (c % 2 ? OFF : 0) });
  const W = COLS * PX;
  const H = ROWS * PY;
  const mid = { x: W / 2 - PX / 2, y: H / 2 - PY / 2 };
  // Вещи - в середину, свободные места - вокруг.
  cells.sort((a, b) => Math.hypot(a.x - mid.x, (a.y - mid.y) * 1.3) - Math.hypot(b.x - mid.x, (b.y - mid.y) * 1.3));
  return { T, W, H, mid, cells };
}

export function Globe({
  things,
  mark,
  markTarget,
  onLanded,
  intro,
}: {
  things: GlobeThing[];
  /** Знак для загрузки - та же картинка, что в шапке. */
  mark: string;
  /** Логотип в шапке: туда прилетает знак. */
  markTarget: () => Element | null;
  onLanded: () => void;
  /** Текст под шаром. Гаснет с переходом в поле. */
  intro: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const fx = useRef<HTMLCanvasElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const introBox = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const hintText = useRef<HTMLSpanElement>(null);
  const count = useRef<HTMLDivElement>(null);
  const caption = useRef<HTMLDivElement>(null);
  const landed = useRef(onLanded);
  landed.current = onLanded;
  const target = useRef(markTarget);
  target.current = markTarget;

  // Раскладка зависит от ширины окна, поэтому считается в браузере, а не при
  // сборке страницы: иначе статический HTML с раскладкой компьютера разошёлся
  // бы с телефоном при гидратации.
  const [grid, setGrid] = useState<ReturnType<typeof layout> | null>(null);
  useEffect(() => setGrid(layout(window.innerWidth < 760)), []);
  const shown = grid ? things.slice(0, grid.cells.length) : [];

  useEffect(() => {
    const host = root.current;
    const cv = canvas.current;
    const fxv = fx.current;
    const fieldEl = field.current;
    if (!grid || !host || !cv || !fxv || !fieldEl) return;
    const small = window.innerWidth < 760;
    let stop = false;
    let cleanup = () => {};

    (async () => {
      const THREE: Three = await import("three");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const { MeshoptDecoder } = await import("three/examples/jsm/libs/meshopt_decoder.module.js");
      const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
      const { DecalGeometry } = await import("three/examples/jsm/geometries/DecalGeometry.js");
      if (stop) return;

      const { T, W, H, mid, cells } = grid;
      const tileEls = [...fieldEl.querySelectorAll<HTMLElement>("[data-tile]")];
      const tiles = cells.map((cell, at) => ({ ...cell, el: tileEls[at]!, thing: shown[at] ?? null, sx: 0, sy: 0 }));
      if (window.matchMedia("(pointer: coarse)").matches && hintText.current) hintText.current.textContent = "Swipe up";

      // Страница - целиком сцена: без прокрутки документа, колесо и жесты наши.
      const html = document.documentElement;
      const before = { overflow: html.style.overflow, body: document.body.style.overflow };
      html.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      const cls = document.body.classList;
      const setCls = (name: string, on: boolean) => host.classList.toggle(name, on);

      // ---------- Сцена ----------
      const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene();
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      const key = new THREE.DirectionalLight(0xffffff, 1.1);
      key.position.set(3, 5, 6);
      scene.add(key);
      const TAN = Math.tan((15 * Math.PI) / 180);
      const CAMZ = 14;
      const HW = 2 * CAMZ * TAN;
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
      camera.position.set(0, 0, CAMZ);
      const px = () => HW / window.innerHeight;
      const toWorld = (x: number, y: number) => new THREE.Vector3((x - window.innerWidth / 2) * px(), -(y - window.innerHeight / 2) * px(), 0);
      const resize = () => {
        renderer.setSize(window.innerWidth, window.innerHeight, false);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
      };
      resize();
      window.addEventListener("resize", resize);

      // ---------- Глобус: непрозрачный шар и точки, которые тянутся к курсору ----------
      const globe = new THREE.Group();
      scene.add(globe);
      const fill = new THREE.Mesh(new THREE.SphereGeometry(0.995, 64, 48), new THREE.MeshBasicMaterial({ color: 0xf1f0ec, toneMapped: false }));
      globe.add(fill);
      const ND = 3600;
      const base = new Float32Array(ND * 3);
      const pos = new Float32Array(ND * 3);
      const col = new Float32Array(ND * 3);
      const dot = new Float32Array(ND);
      const lift = new Float32Array(ND);
      for (let i = 0; i < ND; i++) {
        const y = 1 - ((i + 0.5) / ND) * 2;
        const r = Math.sqrt(1 - y * y);
        const th = i * Math.PI * (3 - Math.sqrt(5));
        base.set([Math.cos(th) * r, y, Math.sin(th) * r], i * 3);
      }
      pos.set(base);
      // Цвета сразу в sRGB: шейдер свой, пересчёта цвета нет.
      const C0 = [0.66, 0.64, 0.6];
      const C1 = [0.07, 0.07, 0.07];
      const S0 = 3.2;
      const S1 = 7.5;
      for (let i = 0; i < ND; i++) {
        col.set(C0, i * 3);
        dot[i] = S0;
      }
      const dots = new THREE.BufferGeometry();
      dots.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      dots.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
      dots.setAttribute("aSize", new THREE.BufferAttribute(dot, 1));
      const dotMat = new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 1 } },
        vertexShader:
          "attribute float aSize; attribute vec3 aColor; varying vec3 vC; uniform float uScale;" +
          "void main() { vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }",
        fragmentShader: "varying vec3 vC; void main() { vec2 d = gl_PointCoord - 0.5; if (dot(d, d) > 0.25) discard; gl_FragColor = vec4(vC, 1.0); }",
      });
      globe.add(new THREE.Points(dots, dotMat));
      globe.rotation.x = 0.22;
      const near = new THREE.Vector3();
      let touching = false;

      const UP = new THREE.Vector3(0, 1, 0);
      const FWD = new THREE.Vector3(0, 0, 1);
      const shadowTex = (() => {
        const c = document.createElement("canvas");
        c.width = c.height = 128;
        const g = c.getContext("2d")!;
        const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, "rgba(60,55,45,.35)");
        grad.addColorStop(1, "rgba(60,55,45,0)");
        g.fillStyle = grad;
        g.fillRect(0, 0, 128, 128);
        return new THREE.CanvasTexture(c);
      })();

      // ---------- Состояние ----------
      type Item = { group: Group; spin: Group; n: Vector3; tile: (typeof tiles)[number]; foot: number; shadow: Mesh; qTile: Quaternion; thing: GlobeThing };
      const items: Item[] = [];
      let P = 0;
      let locked = false;
      let loading = true;
      let born = Infinity;
      let idle = 0;
      let vx = 0;
      let vy = 0;
      let hover: Item | null = null;
      let hoverTile: (typeof tiles)[number] | null = null;
      const cam = { x: mid.x + T / 2, y: mid.y + T / 2 };
      const vel = { x: 0, y: 0 };
      const R = () => (small ? window.innerWidth * 0.34 : Math.min(window.innerHeight * 0.29, window.innerWidth * 0.3));
      const GC = () => ({ x: window.innerWidth / 2, y: window.innerHeight * (small ? 0.4 : 0.42) });
      const AX = new THREE.Vector3(1, 0, 0);
      const AY = new THREE.Vector3(0, 1, 0);
      const qT = new THREE.Quaternion();
      // Поворот вокруг осей экрана: тянешь вправо - поверхность едет вправо, вверх - вверх.
      const rot = (ax: number, ay: number) => {
        qT.setFromAxisAngle(AY, ax);
        globe.quaternion.premultiply(qT);
        qT.setFromAxisAngle(AX, ay);
        globe.quaternion.premultiply(qT);
      };
      const lock = () => {
        P = 1;
        locked = true;
        setCls("globe-grid", true);
      };
      // Вернулись со страницы торга ([ All auctions ]) - сразу в поле, без глобуса.
      if (new URLSearchParams(window.location.search).has("grid")) lock();

      // ---------- Ввод ----------
      const ray = new THREE.Raycaster();
      const m2 = new THREE.Vector2();
      const groups = () => items.map((one) => one.group);
      const cast = (e: PointerEvent): { item: Item | null; ground: Vector3 | null } => {
        m2.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
        ray.setFromCamera(m2, camera);
        // Первое, что видно: вещь или сам шар. Вещь за шаром не ловится.
        const hit = ray.intersectObjects([fill, ...groups()], true)[0];
        if (!hit) return { item: null, ground: null };
        if (hit.object === fill) return { item: null, ground: hit.point };
        let one: Object3D | null = hit.object;
        while (one && !items.some((item) => item.group === one)) one = one.parent;
        return { item: items.find((item) => item.group === one) ?? null, ground: null };
      };
      const scroll = (d: number) => {
        idle = performance.now();
        if (locked) {
          cam.y += d;
          return;
        }
        P = clamp(P + d / 900);
        if (P >= 1) lock();
      };
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        if (loading) return;
        if (locked) {
          cam.x += e.deltaX;
          cam.y += e.deltaY;
          return;
        }
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
          rot(-e.deltaX * 0.003, 0);
          return;
        }
        scroll(e.deltaY);
      };
      let drag: { x: number; y: number; mode: "pan" | "spin" | "swipe" } | null = null;
      let moved = 0;
      const onGlobe = (e: PointerEvent) => {
        const g = GC();
        return Math.hypot(e.clientX - g.x, e.clientY - g.y) < R() * 1.25;
      };
      const onDown = (e: PointerEvent) => {
        if ((e.target as Element | null)?.closest?.("header, a.globe-bar, button") || loading) return;
        // На шаре (и на вещах на нём) - крутим, мимо шара - листаем к полю.
        drag = { x: e.clientX, y: e.clientY, mode: locked ? "pan" : onGlobe(e) ? "spin" : "swipe" };
        moved = 0;
        vel.x = vel.y = 0;
        vx = vy = 0;
        cls.add("globe-drag");
      };
      const onMove = (e: PointerEvent) => {
        if (drag) {
          const dx = e.clientX - drag.x;
          const dy = e.clientY - drag.y;
          moved += Math.abs(dx) + Math.abs(dy);
          if (locked) {
            cam.x -= dx;
            cam.y -= dy;
            vel.x = -dx;
            vel.y = -dy;
          } else if (drag.mode === "spin") {
            const k = 1 / Math.max(R(), 120);
            vx = dx * k;
            vy = dy * k;
            rot(vx, vy);
          } else scroll(-dy * 1.6);
          drag.x = e.clientX;
          drag.y = e.clientY;
        }
        if (!locked && !loading) {
          const c = cast(e);
          hover = drag ? null : c.item;
          touching = Boolean(c.ground) && P < 0.05;
          if (c.ground) near.copy(globe.worldToLocal(c.ground.clone())).normalize();
          cls.toggle("globe-hand", Boolean(hover));
          if (caption.current) caption.current.textContent = hover?.thing.caption ?? "";
        } else if (locked) {
          const el = (e.target as Element | null)?.closest?.("[data-thing]");
          hoverTile = el ? (tiles.find((tile) => tile.el === el) ?? null) : null;
          cls.toggle("globe-hand", Boolean(hoverTile));
          if (caption.current) caption.current.textContent = hoverTile?.thing?.caption ?? "";
        }
      };
      const onLeave = () => {
        touching = false;
      };
      const onUp = () => {
        drag = null;
        cls.remove("globe-drag");
      };
      const onClick = (e: MouseEvent) => {
        if (moved > 6) {
          e.preventDefault();
          return;
        }
        if (!locked && hover) window.location.href = hover.thing.href;
      };
      const noDrag = (e: DragEvent) => e.preventDefault();
      window.addEventListener("wheel", onWheel, { passive: false });
      window.addEventListener("pointerdown", onDown);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      document.addEventListener("pointerleave", onLeave);
      window.addEventListener("click", onClick, true);
      window.addEventListener("dragstart", noDrag);

      // ---------- Кадр ----------
      const wn = new THREE.Vector3();
      const pA = new THREE.Vector3();
      const pL = new THREE.Vector3();
      const pB = new THREE.Vector3();
      const qA = new THREE.Quaternion();
      const tmp = new THREE.Vector3();
      // Квадратичная кривая Безье: a -> (через c) -> b.
      const bez = (to: Vector3, a: Vector3, c: Vector3, b: Vector3, t: number) => {
        const s = 1 - t;
        to.set(s * s * a.x + 2 * s * t * c.x + t * t * b.x, s * s * a.y + 2 * s * t * c.y + t * t * b.y, s * s * a.z + 2 * s * t * c.z + t * t * b.z);
      };
      let last = performance.now();
      let frame = 0;
      const tick = (now: number) => {
        frame = requestAnimationFrame(tick);
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const g = GC();
        const Rpx = R();
        const Rw = Rpx * px();
        const since = (now - born) / 1000;

        // Застряли на полпути - доезжаем до ближайшего края.
        if (!locked && !drag && P > 0 && P < 1 && now - idle > 500) {
          P += ((P < 0.35 ? 0 : 1) - P) * (1 - Math.pow(0.02, dt));
          if (P > 0.995) lock();
          if (P < 0.003) P = 0;
        }
        if (locked && !drag) {
          cam.x += vel.x;
          cam.y += vel.y;
          vel.x *= Math.pow(0.03, dt);
          vel.y *= Math.pow(0.03, dt);
        }
        if (introBox.current) introBox.current.style.opacity = String(loading ? 0 : clamp(1 - P * 2.5) * clamp(since / 0.8));
        // Подсказка - под шаром, проявляется позже текста и уходит с первым движением вниз.
        if (hint.current) {
          hint.current.style.top = `${g.y + Rpx + 18}px`;
          hint.current.style.opacity = String(loading ? 0 : clamp(1 - P * 6) * clamp((since - 1.6) / 0.8));
        }

        // Глобус проявляется после загрузки, при переходе уходит вниз за экран - целым, не тая.
        const gIn = out(clamp((since - 0.05) / 1.1));
        const sink = ease(clamp(P * 1.15));
        const rest = toWorld(g.x, g.y);
        globe.position.copy(toWorld(g.x, g.y + sink * vh * 0.95));
        globe.scale.setScalar(Math.max(0.001, Rw * gIn));
        if (!drag) {
          rot(vx + dt * 0.08, vy);
          vx *= Math.pow(0.05, dt);
          vy *= Math.pow(0.05, dt);
        }
        globe.visible = gIn > 0 && sink < 0.999;
        globe.updateMatrixWorld();

        // Точки под курсором приподнимаются, растут и темнеют.
        let any = false;
        for (let i = 0; i < ND; i++) {
          let goal = 0;
          if (touching) {
            const d = Math.hypot(base[i * 3]! - near.x, base[i * 3 + 1]! - near.y, base[i * 3 + 2]! - near.z);
            if (d < 0.32) goal = Math.pow(1 - d / 0.32, 2);
          }
          const l = lift[i]! + (goal - lift[i]!) * (1 - Math.pow(0.004, dt));
          if (Math.abs(l - lift[i]!) > 1e-4 || l > 1e-3) {
            any = true;
            lift[i] = l;
            const k = 1 + l * 0.09;
            for (let c = 0; c < 3; c++) {
              pos[i * 3 + c] = base[i * 3 + c]! * k;
              col[i * 3 + c] = C0[c]! + (C1[c]! - C0[c]!) * l;
            }
            dot[i] = S0 + (S1 - S0) * l;
          }
        }
        if (any) for (const name of ["position", "aColor", "aSize"]) dots.attributes[name]!.needsUpdate = true;
        // Размер точки в пикселях - от размера шара, чтобы на телефоне точки не были крупнее.
        dotMat.uniforms.uScale!.value = CAMZ * renderer.getPixelRatio() * (Rpx / 261);

        // Плитки поля.
        const cx = vw / 2;
        const cy = vh / 2;
        for (const tile of tiles) {
          const x = wrap(tile.x - cam.x, W) + cx;
          const y = wrap(tile.y - cam.y, H) + cy;
          tile.sx = x;
          tile.sy = y;
          const vis = x > -T - 40 && x < vw + 40 && y > -T - 60 && y < vh + 40;
          tile.el.style.display = vis ? "" : "none";
          if (!vis) continue;
          tile.el.style.transform = `translate3d(${x}px,${y}px,0)`;
          const d = Math.hypot(x + T / 2 - cx, y + T / 2 - cy) / Math.hypot(cx, cy);
          tile.el.style.opacity = String(tile.thing ? clamp((P - 0.88) / 0.12) : clamp((P - 0.4 - d * 0.4) / 0.25));
        }

        // Вещи: опускаются на глобус -> стоят на нём -> взлетают по дуге в свою плитку.
        items.forEach((item, i) => {
          const sOn = Rw * 0.34;
          wn.copy(item.n).applyQuaternion(globe.quaternion).normalize();
          // На шаре: низ вещи на поверхности, стоит по нормали, в землю не проваливается.
          pA.copy(rest).addScaledVector(wn, Rw * gIn + item.foot * sOn);
          qA.setFromUnitVectors(UP, wn);
          const e = out(clamp((since - 0.35 - i * 0.14) / 0.9));
          let sc = sOn * (0.6 + 0.4 * e);
          item.group.position.copy(pA).addScaledVector(wn, Rw * 0.6 * (1 - e));
          item.group.quaternion.copy(qA);
          // В поле: сначала отрываемся от поверхности, потом по дуге в плитку.
          const k = ease(clamp(P * 1.35 - i * 0.07));
          if (k > 0) {
            const tile = item.tile;
            pB.copy(toWorld(tile.sx + T / 2, tile.sy + T / 2));
            pL.copy(pA).addScaledVector(wn, Rw * 0.9).add(tmp.set(0, Rw * 0.4, 0));
            bez(item.group.position, pA, pL, pB, k);
            item.group.quaternion.copy(qA).slerp(item.qTile, k);
            sc = sOn + (T * 0.47 * px() - sOn) * k;
          }
          item.group.scale.setScalar(Math.max(0.0001, sc));
          (item.shadow.material as MeshBasicMaterial).opacity = (1 - clamp(k * 6)) * e * e;
          item.spin.rotation.y += dt * (hover === item || hoverTile === item.tile ? 1.3 : 0.2);
          const tile = item.tile;
          item.group.visible =
            !loading && e > 0.001 && (k < 0.02 || (tile.sx > -T - 80 && tile.sx < vw + 80 && tile.sy > -T - 80 && tile.sy < vh + 80));
        });
        renderer.render(scene, camera);
      };
      frame = requestAnimationFrame(tick);

      // ---------- Загрузка: знак собирается из точек по мере загрузки моделей ----------
      const ctx = fxv.getContext("2d")!;
      const dpr = Math.min(window.devicePixelRatio, 2);
      const img = await new Promise<HTMLImageElement>((done) => {
        const one = new Image();
        one.onload = () => done(one);
        one.onerror = () => done(one);
        one.src = mark;
      });
      const LH = Math.min(window.innerHeight * 0.22, 180);
      const LW = img.width ? (LH * img.width) / img.height : LH * 0.7;
      const off = document.createElement("canvas");
      off.width = Math.max(1, Math.round(LW));
      off.height = Math.max(1, Math.round(LH));
      const oc = off.getContext("2d")!;
      if (img.width) oc.drawImage(img, 0, 0, off.width, off.height);
      const pixels = oc.getImageData(0, 0, off.width, off.height).data;
      const STEP = small ? 2.2 : 2.4;
      // Точки - из самого знака, с его цветами.
      const pts: { tx: number; ty: number; sx: number; sy: number; th: number; ph: number; col: string }[] = [];
      for (let y = 0; y < off.height; y += STEP)
        for (let x = 0; x < off.width; x += STEP) {
          const k = (Math.round(y) * off.width + Math.round(x)) * 4;
          if (pixels[k + 3]! < 140) continue;
          const a = Math.random() * Math.PI * 2;
          const d = Math.max(window.innerWidth, window.innerHeight) * (0.35 + Math.random() * 0.45);
          pts.push({
            tx: x - LW / 2,
            ty: y - LH / 2,
            sx: Math.cos(a) * d,
            sy: Math.sin(a) * d,
            th: Math.random(),
            ph: Math.random() * 6.28,
            col: `rgb(${pixels[k]},${pixels[k + 1]},${pixels[k + 2]})`,
          });
        }
      const fxState: { progress: number; shown: number; fly: { at: number; to: DOMRect; done: () => void } | null } = {
        progress: 0,
        shown: 0,
        fly: null,
      };
      const sizeFx = () => {
        fxv.width = window.innerWidth * dpr;
        fxv.height = window.innerHeight * dpr;
      };
      sizeFx();
      window.addEventListener("resize", sizeFx);
      const t0 = performance.now();
      let fxFrame = 0;
      const drawFx = (now: number) => {
        const t = (now - t0) / 1000;
        // Показанный прогресс догоняет настоящий плавно; первые точки летят сразу.
        fxState.shown += (Math.max(fxState.progress, 0.12) - fxState.shown) * 0.06;
        let cx = window.innerWidth / 2;
        let cy = window.innerHeight / 2;
        let sc = 1;
        let imgA = 0;
        if (fxState.fly) {
          const k = clamp((now - fxState.fly.at) / 950);
          const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
          const r = fxState.fly.to;
          cx += (r.left + r.width / 2 - cx) * e;
          cy += (r.top + r.height / 2 - cy) * e;
          sc = 1 + (r.height / LH - 1) * e;
          // Точки сливаются в цельный знак в начале полёта.
          imgA = clamp(k * 3);
          if (k >= 1) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, fxv.width, fxv.height);
            fxState.fly.done();
            return;
          }
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(sc, sc);
        if (imgA < 1) {
          ctx.globalAlpha = 1 - imgA;
          for (const p of pts) {
            const a = ease(clamp((fxState.shown * 1.3 - p.th * 0.9) / 0.4));
            if (a <= 0) continue;
            const wob = (1 - a) * 6;
            const x = p.sx + (p.tx - p.sx) * a + Math.sin(t * 2 + p.ph) * wob;
            const y = p.sy + (p.ty - p.sy) * a + Math.cos(t * 2.3 + p.ph) * wob;
            const r = 0.5 + 0.75 * a;
            ctx.fillStyle = p.col;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
          }
        }
        if (imgA > 0 && img.width) {
          ctx.globalAlpha = imgA;
          ctx.drawImage(img, -LW / 2, -LH / 2, LW, LH);
        }
        ctx.restore();
        fxFrame = requestAnimationFrame(drawFx);
      };
      fxFrame = requestAnimationFrame(drawFx);

      cleanup = () => {
        cancelAnimationFrame(frame);
        cancelAnimationFrame(fxFrame);
        window.removeEventListener("resize", resize);
        window.removeEventListener("resize", sizeFx);
        window.removeEventListener("wheel", onWheel);
        window.removeEventListener("pointerdown", onDown);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        document.removeEventListener("pointerleave", onLeave);
        window.removeEventListener("click", onClick, true);
        window.removeEventListener("dragstart", noDrag);
        cls.remove("globe-drag", "globe-hand");
        html.style.overflow = before.overflow;
        document.body.style.overflow = before.body;
        renderer.dispose();
        pmrem.dispose();
      };

      // ---------- Все модели - до показа ----------
      const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
      const total = Math.max(shown.length, 1);
      for (const [i, thing] of shown.entries()) {
        let dressed;
        try {
          dressed = await dress(THREE, loader, DecalGeometry, thing.model, thing.shape, thing.logos);
        } catch {
          // Модель не открылась - вещь остаётся плиткой с подписью, без 3D.
          fxState.progress = (i + 1) / total;
          continue;
        }
        if (stop) return;
        const spin = new THREE.Group();
        spin.add(dressed.root);
        const group = new THREE.Group();
        group.add(spin);
        const shadow = new THREE.Mesh(
          new THREE.PlaneGeometry(1.5, 1.5),
          new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0 }),
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = -dressed.foot + 0.01;
        group.add(shadow);
        scene.add(group);
        const [lon, lat] = ON[i % ON.length]!;
        const view = new THREE.Vector3(...dressed.view);
        items.push({
          group,
          spin,
          shadow,
          thing,
          foot: dressed.foot,
          tile: tiles[i]!,
          n: new THREE.Vector3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)),
          // В плитке вещь видна с той стороны, где её логотипы.
          qTile: new THREE.Quaternion().setFromUnitVectors(view, FWD).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0, 0))),
        });
        fxState.progress = (i + 1) / total;
        if (count.current) count.current.textContent = `${String(i + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
      }
      fxState.progress = 1;
      renderer.compile(scene, camera);
      // Знак собрался - летим к логотипу в шапке.
      await new Promise<void>((done) => {
        const wait = () => (stop || fxState.shown > 0.985 ? done() : requestAnimationFrame(wait));
        wait();
      });
      await new Promise((done) => setTimeout(done, 350));
      if (stop) return;
      setCls("globe-landing", true);
      const to = target.current()?.getBoundingClientRect() ?? new DOMRect(26, 22, 13, 18);
      await new Promise<void>((done) => {
        fxState.fly = { at: performance.now(), to, done };
      });
      if (stop) return;
      loading = false;
      setCls("globe-loading", false);
      setCls("globe-landing", false);
      born = performance.now();
      landed.current();
    })();

    return () => {
      stop = true;
      cleanup();
    };
    // Сцена собирается один раз, когда известна раскладка: вещи приходят до
    // этого и потом не меняются.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid]);

  return (
    <div className="globe globe-loading" ref={root} style={grid ? { ["--t" as string]: `${grid.T}px` } : undefined}>
      <canvas className="globe-canvas" ref={canvas} />
      <div className="globe-field" ref={field}>
        {grid?.cells.map((_, at) => {
          const thing = shown[at];
          return thing ? (
            <a key={at} className="globe-tile" data-tile data-thing href={thing.href} draggable={false}>
              <span className="globe-lab">
                <span>{String(at + 1).padStart(2, "0")}.</span>
                <b>{thing.title}</b>
                {thing.live && <i className="globe-live">Live</i>}
                {thing.tag && <i className="globe-tag">{thing.tag}</i>}
              </span>
              <span className="globe-box" />
            </a>
          ) : (
            <div key={at} className="globe-tile globe-free" data-tile>
              <span className="globe-box" />
            </div>
          );
        })}
      </div>
      <div className="globe-intro" ref={introBox}>
        {intro}
      </div>
      <div className="globe-hint" ref={hint}>
        <span ref={hintText}>Scroll</span>
        <i />
      </div>
      <div className="globe-caption" ref={caption} />
      <canvas className="globe-fx" ref={fx} />
      <div className="globe-count" ref={count} />
    </div>
  );
}
