"use client";

import { useEffect, useRef } from "react";
import type { Shape } from "./spots.ts";
import { dress } from "./dress.ts";

type Three = typeof import("three");

/**
 * Одна вещь крупно, живой моделью: логотипы на местах, мягкая тень, вещь
 * медленно вращается, её можно крутить. Для страницы торга.
 *
 * focus - код места: вещь доворачивается к нему. onShots - кадры мест на
 * прозрачном фоне, камера прямо на место; снимаются один раз после сборки,
 * для списка мест рядом.
 */
export function ThingView({
  model,
  shape,
  logos,
  focus,
  onShots,
  onReady,
}: {
  model: string;
  shape: Shape | undefined;
  logos: Record<string, string[]>;
  focus?: { code: string; at: number } | null;
  onShots?: (shots: Record<string, string>) => void;
  onReady?: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const turnTo = useRef<((code: string) => void) | null>(null);

  useEffect(() => {
    if (focus) turnTo.current?.(focus.code);
  }, [focus]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let stop = false;
    let cleanup = () => {};

    void (async () => {
      const THREE: Three = await import("three");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const { MeshoptDecoder } = await import("three/examples/jsm/libs/meshopt_decoder.module.js");
      const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
      const { DecalGeometry } = await import("three/examples/jsm/geometries/DecalGeometry.js");
      if (stop) return;

      const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
      const dressed = await dress(THREE, loader, DecalGeometry, model, shape, logos);
      if (stop) return;

      const studio = (renderer: InstanceType<Three["WebGLRenderer"]>) => {
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
      };
      const light = (scene: InstanceType<Three["Scene"]>, renderer: InstanceType<Three["WebGLRenderer"]>) => {
        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        const key = new THREE.DirectionalLight(0xffffff, 1);
        key.position.set(2, 4, 5);
        scene.add(key);
        return pmrem;
      };
      const tan = Math.tan((15 * Math.PI) / 180);

      // ---------- Кадры мест: отдельный холст, прозрачный фон ----------
      if (onShots && shape) {
        const SIZE = 200;
        const shotR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        shotR.setPixelRatio(1);
        shotR.setSize(SIZE, SIZE);
        shotR.setClearColor(0x000000, 0);
        studio(shotR);
        const shotScene = new THREE.Scene();
        const pm = light(shotScene, shotR);
        const cam = new THREE.PerspectiveCamera(30, 1, 0.005, 50);
        shotScene.add(dressed.root);
        const shots: Record<string, string> = {};
        for (const [code, one] of Object.entries(dressed.spots)) {
          const point = new THREE.Vector3(...one.point);
          const normal = new THREE.Vector3(...one.normal);
          const up = new THREE.Vector3(...one.up);
          const right = new THREE.Vector3().crossVectors(up, normal).normalize();
          const dir = normal.clone().addScaledVector(up, 0.2).addScaledVector(right, 0.25).normalize();
          // Мелкое место - ближе: иначе логотип размером с ноготь.
          const near = one.size < 0.18 ? 1.45 : 0.95;
          cam.up.copy(up);
          cam.position.copy(point).addScaledVector(dir, one.size / (near * tan));
          cam.lookAt(point);
          shotR.render(shotScene, cam);
          shots[code] = shotR.domElement.toDataURL("image/png");
        }
        shotScene.remove(dressed.root);
        pm.dispose();
        shotR.dispose();
        if (!stop) onShots(shots);
      }

      // ---------- Живая вещь ----------
      const renderer = new THREE.WebGLRenderer({ canvas: el, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      studio(renderer);
      const scene = new THREE.Scene();
      const pmrem = light(scene, renderer);
      scene.add(dressed.root);
      const shadowTex = (() => {
        const c = document.createElement("canvas");
        c.width = c.height = 128;
        const g = c.getContext("2d")!;
        const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        r.addColorStop(0, "rgba(0,0,0,.16)");
        r.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = r;
        g.fillRect(0, 0, 128, 128);
        return new THREE.CanvasTexture(c);
      })();
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = -dressed.foot - 0.005;
      scene.add(shadow);

      const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
      const [vx, vy, vz] = dressed.view;
      let yaw = Math.atan2(vx, vz);
      let pitch = Math.asin(vy);
      let spin = 0;
      let target: { yaw: number; pitch: number } | null = null;
      turnTo.current = (code) => {
        const one = dressed.spots[code];
        if (!one) return;
        const [nx, ny, nz] = one.normal;
        target = { yaw: Math.atan2(nx, nz), pitch: one.top ? 1.1 : Math.max(-0.1, Math.min(1.1, Math.asin(Math.max(-1, Math.min(1, ny))) * 0.8 + 0.15)) };
      };

      const resize = () => {
        const r = el.getBoundingClientRect();
        renderer.setSize(r.width, r.height, false);
        camera.aspect = r.width / Math.max(r.height, 1);
        camera.updateProjectionMatrix();
      };
      resize();
      const watch = new ResizeObserver(resize);
      watch.observe(el);

      let drag: { x: number; y: number } | null = null;
      const down = (event: PointerEvent) => {
        drag = { x: event.clientX, y: event.clientY };
        target = null;
        el.setPointerCapture(event.pointerId);
      };
      const move = (event: PointerEvent) => {
        if (!drag) return;
        spin = -(event.clientX - drag.x) * 0.008;
        yaw += spin;
        pitch = Math.max(-0.2, Math.min(1.2, pitch + (event.clientY - drag.y) * 0.006));
        drag = { x: event.clientX, y: event.clientY };
      };
      const up = () => (drag = null);
      el.addEventListener("pointerdown", down);
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);

      // Описанная сфера вещи - радиус 1: камера отходит так, чтобы она влезла с запасом.
      const dist = 1.15 / tan;
      let last = performance.now();
      let frame = 0;
      const tick = (now: number) => {
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        if (target) {
          let d = target.yaw - yaw;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          yaw += d * (1 - Math.pow(0.01, dt));
          pitch += (target.pitch - pitch) * (1 - Math.pow(0.01, dt));
        } else if (!drag) {
          yaw += spin + dt * 0.12;
          spin *= Math.pow(0.05, dt);
        }
        camera.position.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(dist);
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      onReady?.();

      cleanup = () => {
        cancelAnimationFrame(frame);
        watch.disconnect();
        el.removeEventListener("pointerdown", down);
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
        turnTo.current = null;
        pmrem.dispose();
        renderer.dispose();
      };
    })();

    return () => {
      stop = true;
      cleanup();
    };
    // Вещь собирается один раз на модель и набор картинок.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, shape, JSON.stringify(logos)]);

  return <canvas ref={canvas} className="thing-view" />;
}
