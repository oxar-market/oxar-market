"use client";

import { useEffect, useRef, useState } from "react";
import { ThingStage, type Stage } from "@oxar/stage";
import {
  awaitsReview,
  reviewThing,
  loadAdminThings,
  saveSpotGeo,
  updateThing,
  uploadModel,
  uploadProof,
  type AdminThing,
} from "@/lib/admin";
import { photoUrl } from "@/lib/seller";
import { shapeOf } from "@/lib/listing";
import { decideSeller, loadApplications, type Application } from "@/lib/applications";
import { Bar, SpotMark, Thumb } from "../seller/parts.tsx";

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

  // Решение принято - сразу следующая вещь, что ждёт решения; нет таких -
  // обратно к списку. Список берём свежий: решение только что его изменило.
  async function next(done: string) {
    const list = await loadAdminThings();
    setThings(list);
    void loadApplications().then((people) => setPeople(people.length));
    setOpen(list.find((one) => one.id !== done && awaitsReview(one))?.id ?? null);
  }

  const thing = things?.find((one) => one.id === open);
  if (thing) {
    return (
      <AdminThingView
        key={thing.id}
        thing={thing}
        onBack={() => setOpen(null)}
        onChanged={reload}
        onReviewed={() => void next(thing.id)}
      />
    );
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

      <div className="sl-head">
        <h2>Things</h2>
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
                {/* Три слова на все вещи, наши тоже: ждёт, одобрена, отклонена. */}
                {one.active ? "APPROVED" : one.declinedReason ? "DECLINED" : "AWAITING APPROVAL"}
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
  onReviewed,
}: {
  thing: AdminThing;
  onBack: () => void;
  onChanged: () => void;
  /** Одобрена или отклонена - дальше следующая. */
  onReviewed: () => void;
}) {
  const [title, setTitle] = useState(thing.title);
  const [tagline, setTagline] = useState(thing.tagline ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  // «Кто, где, когда, особенность» правит и админ: продавец пишет это до
  // публикации, а поправить после неё, когда торг уже идёт, можем только мы.
  const [worn, setWorn] = useState(thing.worn);
  const [viewing, setViewing] = useState<number | null>(null);
  const [picked, setPicked] = useState(
    () => (thing.spots.find((spot) => !spot.geo) ?? thing.spots[0])?.code ?? null,
  );
  const spot = thing.spots.find((one) => one.code === picked) ?? null;
  const [size, setSize] = useState<[string, string]>(() => sizeOf(spot));
  const stage = useRef<Stage | null>(null);

  useEffect(() => setSize(sizeOf(spot)), [spot?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  // Решение: получилось - к следующей вещи, нет - остаёмся с ошибкой.
  async function decide(job: () => Promise<boolean>, failure: string) {
    setBusy(true);
    setError("");
    const ok = await job();
    setBusy(false);
    if (ok) onReviewed();
    else setError(failure);
  }

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

      <div className="sl-card ad-card">
        <h3>Who, where and when</h3>
        {(["by", "where", "when"] as const).map((key) => (
          <label className="sl-field" key={key}>
            {key === "by" ? "Who has it" : key === "where" ? "Where" : "When"}
            <span className="sl-input soft">
              <input
                value={worn[key]}
                maxLength={120}
                onChange={(event) => setWorn({ ...worn, [key]: event.target.value })}
              />
            </span>
          </label>
        ))}
        <label className="sl-field ad-reason">
          What makes it special (optional)
          <textarea
            value={worn.about}
            maxLength={300}
            rows={3}
            onChange={(event) => setWorn({ ...worn, about: event.target.value })}
          />
        </label>
        <p className="muted">Who, where and when are needed before the auction opens. The rest is optional.</p>
        <button
          type="button"
          className="sl-btn light"
          disabled={busy || JSON.stringify(worn) === JSON.stringify(thing.worn)}
          onClick={() =>
            run(
              () =>
                updateThing(thing.id, {
                  worn_by: worn.by.trim() || null,
                  worn_where: worn.where.trim() || null,
                  worn_when: worn.when.trim() || null,
                  worn_about: worn.about.trim() || null,
                }),
              "Could not save it.",
            )
          }
        >
          Save
        </button>
      </div>

      {/* Снимки открываются крупно - для 3D-модели их смотрят с разметкой и
          без, и сохраняют оригинал. */}
      <div className="ad-photos">
        {thing.photos.map((url, index) => (
          <button type="button" className="sl-photo ad-photo" key={url} onClick={() => setViewing(index)}>
            <img src={url} alt="" />
            {thing.spots.map((one, at) =>
              one.rect && one.photo === index ? (
                <SpotMark key={one.id} rect={one.rect} outline={one.outline} number={at + 1} />
              ) : null,
            )}
          </button>
        ))}
      </div>
      {viewing !== null && (
        <PhotoViewer thing={thing} at={viewing} onAt={setViewing} onClose={() => setViewing(null)} />
      )}

      {/* У наших вещей модель и места живут в коде: ставить их здесь нечего. */}
      {!thing.house && (
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

      )}

      {/* Пруф: фото вещи в деле. Пока их нет, итоги говорят «preparing». */}
      <div className="sl-card ad-card">
        <h3>Proof</h3>
        {thing.proof.length > 0 ? (
          <div className="ad-photos">
            {thing.proof.map((path) => (
              <span className="sl-photo ad-proof" key={path}>
                <img src={photoUrl(path)} alt="" />
                <button
                  type="button"
                  className="ghost small"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => updateThing(thing.id, { proof_photos: thing.proof.filter((one) => one !== path) }),
                      "Could not remove it.",
                    )
                  }
                >
                  Remove
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="muted">No photos yet. The results page says the thing is being prepared.</p>
        )}
        <label className="sl-btn light">
          Add photos
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            disabled={busy}
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              event.target.value = "";
              if (files.length) void run(() => uploadProof(thing.id, files, thing.proof), "Upload failed.");
            }}
          />
        </label>
      </div>

      {!thing.house && (
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
        {/* Отклонённую не одобряют: продавцу остаётся только удалить её. */}
        {!thing.active && !thing.declinedReason && (
          <button
            type="button"
            className="sl-btn dark"
            disabled={busy}
            onClick={() => decide(() => reviewThing(thing.id, true), "Could not approve it.")}
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
              onClick={() => decide(() => reviewThing(thing.id, false, reason.trim()), "Could not decline it.")}
            >
              Decline
            </button>
          </>
        )}
      </div>
      )}

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
 * Снимок крупно: с разметкой мест или без - по ней и по голому кадру
 * собирают 3D-модель. «Original» открывает сам файл, его и сохраняют.
 */
function PhotoViewer({
  thing,
  at,
  onAt,
  onClose,
}: {
  thing: AdminThing;
  at: number;
  onAt: (at: number) => void;
  onClose: () => void;
}) {
  const [marks, setMarks] = useState(true);
  const count = thing.photos.length;
  return (
    <div className="reviews-dim" onClick={onClose}>
      <div className="ad-viewer" role="dialog" aria-label="Photo" onClick={(event) => event.stopPropagation()}>
        <div className="ad-viewer-bar">
          <div className="role-toggle slim">
            {([true, false] as const).map((one) => (
              <button
                key={String(one)}
                type="button"
                className={marks === one ? "role-tab on" : "role-tab"}
                onClick={() => setMarks(one)}
              >
                {one ? "With spots" : "Clean"}
              </button>
            ))}
          </div>
          {/* Оригинал и есть «Clean»: отдельная кнопка повторяла бы переключатель. */}
          <button type="button" className="sl-pill" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="sl-photo ad-viewer-photo">
          <img src={thing.photos[at]} alt="" />
          {marks &&
            thing.spots.map((one, index) =>
              one.rect && one.photo === at ? (
                <SpotMark key={one.id} rect={one.rect} outline={one.outline} number={index + 1} />
              ) : null,
            )}
        </div>
        {count > 1 && (
          <div className="ad-viewer-nav">
            <button type="button" className="sl-pill" onClick={() => onAt((at - 1 + count) % count)}>
              &larr; Prev
            </button>
            <span className="muted">
              {at + 1} of {count}
            </span>
            <button type="button" className="sl-pill" onClick={() => onAt((at + 1) % count)}>
              Next &rarr;
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
