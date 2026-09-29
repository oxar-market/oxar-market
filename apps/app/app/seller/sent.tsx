"use client";

import { Bar } from "./parts.tsx";

/** Отправлено: вещь уже на маркете по снимкам, модель приложим мы. */
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
      <h2 className="sl-h2">Your thing is on the Market</h2>
      <p className="sl-lead">
        Buyers see it with your photos now. Price the spots to open the
        auction. We add a 3D model later, usually within a day.
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
