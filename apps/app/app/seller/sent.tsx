"use client";

import { Bar } from "./parts.tsx";

/** Отправлено: вещь пока видна только продавцу, на маркет её выводим мы. */
export function Sent({
  photos,
  spots,
  onBack,
}: {
  photos: number;
  spots: number;
  onBack: () => void;
}) {
  return (
    <>
      <Bar title="Sent" onBack={onBack} step="3 of 3" />
      <div className="sl-holo">
        <div />
        <span>Hologram - 3D model in preparation</span>
      </div>
      <h2 className="sl-h2">Your thing is saved</h2>
      <p className="sl-lead">
        Only you see it for now. Price the spots, and we put it on the
        Market. We add a 3D model later, usually within a day.
      </p>
      <div className="sl-card sl-steps">
        <div className="sl-step">
          <i />
          <b>Photos</b>
          <small>{photos} received</small>
        </div>
        <div className="sl-step">
          <i />
          <b>Spots</b>
          <small>{spots === 1 ? "1 spot marked" : `${spots} spots marked`}</small>
        </div>
        <div className="sl-step">
          <i className="now" />
          <b>Price the spots</b>
          <small>Open your thing and set prices</small>
        </div>
        <div className="sl-step">
          <i className="later" />
          <b>3D model</b>
          <small>We add it, usually within a day</small>
        </div>
      </div>
      <button type="button" className="sl-btn light" onClick={onBack}>
        Back to your things
      </button>
    </>
  );
}
