"use client";

import { useEffect, useRef, useState } from "react";
import { ThingStage, type Stage } from "@oxar/stage";
import {
  loadAdminThings,
  saveSpotGeo,
  updateThing,
  uploadModel,
  type AdminThing,
} from "@/lib/admin";
import { shapeOf } from "@/lib/listing";
import { Bar, SpotMark, Thumb } from "../seller/parts.tsx";

/**
 * Админка по вещам продавцов. Вещь на маркете с момента отправки, по
 * снимкам; здесь ей дают имя, прикладывают модель и ставят на ней места.
 * «Hide from market» - если вещь там быть не должна.
 */
export function Admin() {
  const [things, setThings] = useState<AdminThing[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  function reload() {
    void loadAdminThings().then(setThings);
  }
  useEffect(reload, []);

  const thing = things?.find((one) => one.id === open);
  if (thing) {
    return <AdminThingView thing={thing} onBack={() => setOpen(null)} onChanged={reload} />;
  }

  return (
    <>
      <div className="sl-head">
        <h2>Seller things</h2>
        <span>{things?.length ?? ""}</span>
      </div>
      {things?.length === 0 && <p className="muted">Nothing sent yet.</p>}
      {things && things.length > 0 && (
        <div className="sl-card sl-things">
          {things.map((one) => (
            <button type="button" key={one.id} className="sl-thing" onClick={() => setOpen(one.id)}>
              <Thumb src={one.photos[0] ?? null} />
              <span className="sl-thing-name">{one.title}</span>
              <span className={`sl-state ${one.active ? "live" : "idle"}`}>
                <i />
                {one.active ? "ON MARKET" : "HIDDEN"}
              </span>
              <span className="sl-thing-sub">
                {one.spots.length} spots · {one.model ? "3D" : "no 3D"}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/** Размер места на модели по умолчанию - в единицах сцены, вещь в ней ~0.62. */
const SIZE = 0.1;

function AdminThingView({
  thing,
  onBack,
  onChanged,
}: {
  thing: AdminThing;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState(thing.title);
  const [tagline, setTagline] = useState(thing.tagline ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState(
    () => (thing.spots.find((spot) => !spot.geo) ?? thing.spots[0])?.code ?? null,
  );
  const spot = thing.spots.find((one) => one.code === picked) ?? null;
  const [size, setSize] = useState<[string, string]>(() => sizeOf(spot));
  const stage = useRef<Stage | null>(null);

  useEffect(() => setSize(sizeOf(spot)), [spot?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(job: () => Promise<boolean>, failure: string) {
    setBusy(true);
    setError("");
    const ok = await job();
    setBusy(false);
    if (!ok) setError(failure);
    onChanged();
  }

  // На сцене - только уже поставленные места: сцена строится один раз, и
  // каждое новое место пересобирает её ключом.
  const placed = thing.spots.filter((one) => one.geo);
  const shape = thing.model ? (shapeOf(thing.model, placed) ?? emptyShape(thing.model)) : null;
  const sceneKey = JSON.stringify(placed.map((one) => [one.code, one.geo]));
  const allPlaced = thing.spots.length > 0 && placed.length === thing.spots.length;

  return (
    <>
      <Bar title="Admin" onBack={onBack} />

      <div className="sl-card ad-card">
        <label className="sl-field">
          Title
          <span className="sl-input soft">
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </span>
        </label>
        <label className="sl-field">
          Tagline
          <span className="sl-input soft">
            <input value={tagline} onChange={(event) => setTagline(event.target.value)} />
          </span>
        </label>
        <button
          type="button"
          className="sl-btn light"
          disabled={busy || !title.trim() || (title === thing.title && tagline === (thing.tagline ?? ""))}
          onClick={() =>
            run(
              () => updateThing(thing.id, { title: title.trim(), tagline: tagline.trim() || null }),
              "Could not save the name.",
            )
          }
        >
          Save name
        </button>
      </div>

      <div className="ad-photos">
        {thing.photos.map((url, index) => (
          <div className="sl-photo" key={url}>
            <img src={url} alt="" />
            {index === 0 &&
              thing.spots.map((one, at) =>
                one.rect ? <SpotMark key={one.id} rect={one.rect} number={at + 1} /> : null,
              )}
          </div>
        ))}
      </div>

      <div className="sl-card ad-card">
        <h3>3D model</h3>
        <label className="sl-btn light">
          {thing.model ? "Replace .glb" : "Upload .glb"}
          <input
            type="file"
            accept=".glb,model/gltf-binary"
            hidden
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void run(async () => Boolean(await uploadModel(thing.id, file)), "Upload failed.");
            }}
          />
        </label>

        {shape && (
          <>
            <p className="muted">
              Pick a spot below, then click the model where it goes. Faces
              should stand upright: the spot is found by a level ray to the
              center.
            </p>
            <div className="lot-scene ad-scene">
              <ThingStage
                key={`${thing.model}:${sceneKey}`}
                shape={shape}
                picked={picked}
                onPick={setPicked}
                stage={stage}
                onSurface={(at) => {
                  if (!spot || busy) return;
                  const geo = {
                    height: round(at.height),
                    azimuth: round(at.azimuth),
                    size: [Number(size[0]) || SIZE, Number(size[1]) || SIZE] as [number, number],
                  };
                  const next = thing.spots.find((one) => !one.geo && one.code !== spot.code);
                  void run(() => saveSpotGeo(spot.id, geo), "Could not save the spot.").then(() => {
                    if (next) setPicked(next.code);
                  });
                }}
              />
            </div>
            <div className="ad-spots">
              {thing.spots.map((one, at) => (
                <button
                  type="button"
                  key={one.id}
                  className={one.code === picked ? "ad-spot on" : "ad-spot"}
                  onClick={() => setPicked(one.code)}
                >
                  {at + 1}. {one.label} {one.geo ? "✓" : ""}
                </button>
              ))}
            </div>
            {spot && (
              <div className="ad-size">
                <label className="sl-field">
                  Width
                  <span className="sl-input soft">
                    <input
                      inputMode="decimal"
                      value={size[0]}
                      onChange={(event) => setSize([event.target.value, size[1]])}
                    />
                  </span>
                </label>
                <label className="sl-field">
                  Height
                  <span className="sl-input soft">
                    <input
                      inputMode="decimal"
                      value={size[1]}
                      onChange={(event) => setSize([size[0], event.target.value])}
                    />
                  </span>
                </label>
                {spot.geo && (
                  <button
                    type="button"
                    className="sl-btn light"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          saveSpotGeo(spot.id, {
                            ...spot.geo!,
                            size: [Number(size[0]) || SIZE, Number(size[1]) || SIZE],
                          }),
                        "Could not save the size.",
                      )
                    }
                  >
                    Apply size
                  </button>
                )}
              </div>
            )}
            {!allPlaced && (
              <p className="muted">
                Buyers see the model once every spot is on it. Until then the
                auction shows the photo.
              </p>
            )}
          </>
        )}
      </div>

      <div className="sl-card ad-card">
        <h3>Status</h3>
        <button
          type="button"
          className="sl-btn dark"
          disabled={busy}
          onClick={() => run(() => updateThing(thing.id, { active: !thing.active }), "Could not change it.")}
        >
          {thing.active ? "Hide from market" : "Show on market"}
        </button>
      </div>

      {error && <p className="bad">{error}</p>}
    </>
  );
}

/**
 * Пропорции места на модели - по прямоугольнику продавца на снимке. Снимок
 * 4:5, поэтому доли сторон переводим в настоящие пропорции.
 */
function sizeOf(spot: AdminThing["spots"][number] | null): [string, string] {
  if (spot?.geo) return [String(spot.geo.size[0]), String(spot.geo.size[1])];
  if (!spot?.rect) return [String(SIZE), String(SIZE)];
  const aspect = (spot.rect.w * 4) / (spot.rect.h * 5);
  return aspect >= 1
    ? [String(SIZE), String(round(SIZE / aspect))]
    : [String(round(SIZE * aspect)), String(SIZE)];
}

function emptyShape(model: string) {
  return { model, spots: [], depth: 0.05, cloth: false, noun: "thing" };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
