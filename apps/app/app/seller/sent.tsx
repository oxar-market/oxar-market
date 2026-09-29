"use client";

import { Bar } from "./parts.tsx";

/** Отправлено: листинг собираем мы, продавец видит, где его вещь. */
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
        <span>Hologram - 3D listing in preparation</span>
      </div>
      <h2 className="sl-h2">We prepare your thing</h2>
      <p className="sl-lead">
        We check the spots and build the 3D listing, usually within a day.
        The thing shows up here as ready to price.
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
          <b>3D listing</b>
          <small>In preparation</small>
        </div>
        <div className="sl-step">
          <i className="later" />
          <b>Price the spots</b>
          <small>Once the listing is ready</small>
        </div>
      </div>
      <button type="button" className="sl-btn light" onClick={onBack}>
        Back to your things
      </button>
    </>
  );
}
