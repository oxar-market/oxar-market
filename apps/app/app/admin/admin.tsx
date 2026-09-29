"use client";

import { useEffect, useRef, useState } from "react";
import { ThingStage, type Stage } from "@oxar/stage";
import {
  awaitsReview,
  reviewThing,
  loadAdminThings,
  loadHouseThings,
  saveSpotGeo,
  updateThing,
  uploadModel,
  type AdminThing,
} from "@/lib/admin";
import { shapeOf } from "@/lib/listing";
import { decideSeller, loadApplications, type Application } from "@/lib/applications";
import { Bar, SpotMark, Thumb } from "../seller/parts.tsx";
import { Winners } from "../winners.tsx";

/**
 * Админка по вещам продавцов. Вещь попадает на маркет, когда продавец
 * открыл торг и админ её одобрил; здесь же ей дают имя, прикладывают
 * модель и ставят на ней места.
 */
export function Admin() {
  const [things, setThings] = useState<AdminThing[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  // Люди и вещи - разные очереди: заявки в продавцы не тонут среди вещей.
  const [section, setSection] = useState<"people" | "things">("things");
  // Сколько ждут решения - число на вкладке, чтобы было видно, есть ли дело.
  const [people, setPeople] = useState(0);

  function reload() {
    void loadAdminThings().then(setThings);
    void loadApplications().then((list) => setPeople(list.length));
  }
  useEffect(reload, []);
  const toReview = (things ?? []).filter(awaitsReview).length;

  const thing = things?.find((one) => one.id === open);
  if (thing) {
    return <AdminThingView thing={thing} onBack={() => setOpen(null)} onChanged={reload} />;
  }

  const sections = (
    <div className="role-toggle slim">
      {(["things", "people"] as const).map((one) => (
        <button
          key={one}
          type="button"
          className={section === one ? "role-tab on" : "role-tab"}
          onClick={() => setSection(one)}
        >
          {one === "things" ? "Things" : "People"}
          {(one === "things" ? toReview : people) > 0 && (
            <span className="ad-count">{one === "things" ? toReview : people}</span>
          )}
        </button>
      ))}
    </div>
  );

  if (section === "people") {
    return (
      <>
        {sections}
        <Applications onChanged={reload} />
      </>
    );
  }

  return (
    <>
      {sections}

      <HouseLogos />

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
              <span
                className={`sl-state ${one.active ? "live" : one.declinedReason ? "declined" : "preparing"}`}
              >
                <i />
                {one.active
                  ? "ON MARKET"
                  : one.declinedReason
                    ? "DECLINED"
                    : one.published
                      ? "PUBLISHED - REVIEW"
                      : "TO REVIEW"}
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
  const [reason, setReason] = useState("");
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
            {thing.spots.map((one, at) =>
              one.rect && one.photo === index ? (
                <SpotMark key={one.id} rect={one.rect} outline={one.outline} number={at + 1} />
              ) : null,
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
        <h3>Review</h3>
        {thing.active ? (
          <p className="muted">Approved. It shows on the Market while its auction is open.</p>
        ) : thing.declinedReason ? (
          <p className="muted">Declined: {thing.declinedReason}</p>
        ) : (
          <p className="muted">
            {thing.published
              ? "The seller published the auction. Approve it to show it on the Market."
              : "Not published yet. Approve now and it shows on the Market once the seller publishes."}
          </p>
        )}
        {!thing.active && (
          <button
            type="button"
            className="sl-btn dark"
            disabled={busy}
            onClick={() => run(() => reviewThing(thing.id, true), "Could not approve it.")}
          >
            Approve
          </button>
        )}
        {thing.active && (
          <button
            type="button"
            className="sl-btn light"
            disabled={busy}
            onClick={() => run(() => updateThing(thing.id, { active: false }), "Could not hide it.")}
          >
            Hide from market
          </button>
        )}
        {!thing.declinedReason && (
          <>
            <label className="sl-field ad-reason">
              Reason to decline - the seller sees it
              <textarea
                value={reason}
                maxLength={500}
                rows={3}
                placeholder="The spots are on a curved part, logos would not print well."
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="sl-btn light"
              disabled={busy || reason.trim().length < 3}
              onClick={() => run(() => reviewThing(thing.id, false, reason.trim()), "Could not decline it.")}
            >
              Decline
            </button>
          </>
        )}
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

/** Заявки в продавцы: одобрить - и у человека появляется вкладка Seller. */
function Applications({ onChanged }: { onChanged: () => void }) {
  const [list, setList] = useState<Application[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  function reload() {
    void loadApplications().then(setList);
  }
  useEffect(reload, []);

  async function decide(userId: string, approve: boolean) {
    setBusy(userId);
    setFailed(false);
    const ok = await decideSeller(userId, approve);
    setBusy(null);
    if (!ok) setFailed(true);
    reload();
    onChanged();
  }

  return (
    <>
      <div className="sl-head">
        <h2>Seller applications</h2>
        <span>{list?.length ?? ""}</span>
      </div>
      {list?.length === 0 && <p className="muted">No applications waiting.</p>}
      {failed && <p className="bad">Could not save the decision. Try again.</p>}
      {list?.map((one) => (
        <div className="sl-card ad-card" key={one.userId}>
          <b>{one.contact}</b>
          {one.about && <p className="muted">{one.about}</p>}
          <p className="muted mono">
            {one.wallet ?? "no wallet"} ·{" "}
            {new Date(one.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </p>
          <div className="ad-decide">
            <button
              type="button"
              className="sl-btn light"
              disabled={busy === one.userId}
              onClick={() => decide(one.userId, false)}
            >
              Decline
            </button>
            <button
              type="button"
              className="sl-btn dark"
              disabled={busy === one.userId}
              onClick={() => decide(one.userId, true)}
            >
              Approve
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

/**
 * Наши вещи: что печатать. Пока торг идёт - лидеры, после закрытия -
 * победители. Футболку печатаем мы, и логотипы нужны нам самим.
 */
function HouseLogos() {
  const [things, setThings] = useState<{ id: string; title: string }[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    void loadHouseThings().then(setThings);
  }, []);
  if (things.length === 0) return null;
  return (
    <>
      <div className="sl-head">
        <h2>Our things - logos</h2>
      </div>
      {things.map((one) => (
        <div key={one.id} className="ad-house">
          <button
            type="button"
            className="sl-btn light"
            onClick={() => setOpen(open === one.id ? null : one.id)}
          >
            {open === one.id ? `Hide ${one.title}` : one.title}
          </button>
          {open === one.id && <Winners thingId={one.id} />}
        </div>
      ))}
    </>
  );
}
