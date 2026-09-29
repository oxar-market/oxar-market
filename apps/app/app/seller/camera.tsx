"use client";

import { useEffect, useRef, useState } from "react";
import { toPortrait } from "./desktop.tsx";

/** Сколько снимков просим: прямо и по одному с каждой стороны. */
const SHOTS = 3;

/**
 * Камера: всегда тёмная, во весь экран, поверх вкладок.
 *
 * Снимок режется до 4:5 по центру - в той же пропорции его потом размечают,
 * и доли мест совпадают с кадром без пересчёта обрезки.
 */
export function Camera({
  onCancel,
  onDone,
}: {
  onCancel: () => void;
  onDone: (photos: Blob[]) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [live, setLive] = useState<"starting" | "on" | "off">("starting");
  const [photos, setPhotos] = useState<{ blob: Blob; url: string }[]>([]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (stop) return stream.getTracks().forEach((track) => track.stop());
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play();
        }
        setLive("on");
      } catch {
        setLive("off");
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(
    () => () => photos.forEach((one) => URL.revokeObjectURL(one.url)),
    // Ссылки освобождаются, когда камера уходит с экрана.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function shoot() {
    const source = video.current;
    if (!source || live !== "on" || photos.length >= SHOTS) return;
    const vw = source.videoWidth;
    const vh = source.videoHeight;
    // Самый большой прямоугольник 4:5 по центру кадра.
    const w = Math.min(vw, (vh * 4) / 5);
    const h = (w * 5) / 4;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(Math.min(w, 1200));
    canvas.height = Math.round((canvas.width * 5) / 4);
    canvas
      .getContext("2d")
      ?.drawImage(source, (vw - w) / 2, (vh - h) / 2, w, h, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob) setPhotos((was) => [...was, { blob, url: URL.createObjectURL(blob) }]);
      },
      "image/jpeg",
      0.88,
    );
  }

  return (
    <div className="sl-camera">
      <div className="sl-camera-bar">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <b>Photograph the thing</b>
        <span>1 of 3</span>
      </div>

      <div className="sl-finder">
        <video ref={video} playsInline muted />
        {live !== "on" && (
          <span className="sl-finder-note">
            {live === "starting"
              ? "Starting the camera"
              : "The camera is off. Allow camera access for this site in the browser settings."}
          </span>
        )}
        <i />
        <i />
        <i />
        <i />
      </div>

      <p className="sl-camera-hint">
        Whole thing in the frame, flat even light. One shot straight on, then
        one from each side.
      </p>
      {/* Снимки уже есть в галерее - брать их, а не переснимать. Режутся к
          той же пропорции 4:5, что и кадры камеры. */}
      <label className="sl-gallery">
        Choose from your photos
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={async (event) => {
            const files = [...(event.target.files ?? [])].slice(0, SHOTS - photos.length);
            event.target.value = "";
            const cropped = await Promise.all(files.map(toPortrait));
            setPhotos((was) =>
              [...was, ...cropped.map((blob) => ({ blob, url: URL.createObjectURL(blob) }))].slice(0, SHOTS),
            );
          }}
        />
      </label>

      <div className="sl-camera-row">
        <span className="sl-shots">
          {photos.map((one) => (
            <img key={one.url} src={one.url} alt="" />
          ))}
          {photos.length === 0 && (
            <>
              <em />
              <em />
            </>
          )}
          <span>{photos.length}</span>
        </span>
        <button
          type="button"
          className="sl-shutter"
          aria-label="Take a photo"
          disabled={live !== "on" || photos.length >= SHOTS}
          onClick={shoot}
        />
        <button
          type="button"
          className="sl-next"
          disabled={photos.length === 0}
          onClick={() => onDone(photos.map((one) => one.blob))}
        >
          Next
        </button>
      </div>
    </div>
  );
}
