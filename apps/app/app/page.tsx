import Link from "next/link";
import { PLACEMENTS, formatUsd, type PlacementKind } from "@oxar/core";
import { listings } from "@/lib/db";

export const metadata = { title: "OXAR — available placements" };

export default async function Marketplace({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind } = await searchParams;
  const active = PLACEMENTS.find((p) => p.kind === kind)?.kind;
  const rows = await listings(active as PlacementKind | undefined);

  return (
    <main>
      <header className="top">
        <span className="tag">OXAR</span>
        <h1>Available placements</h1>
        <p className="muted">
          Rent a spot on someone&apos;s X profile for a fixed number of days.
          Paid in USDC on Solana.
        </p>
      </header>

      <nav className="filters">
        <Link href="/" className={active ? "chip" : "chip on"}>
          All
        </Link>
        {PLACEMENTS.map((p) => (
          <Link
            key={p.kind}
            href={`/?kind=${p.kind}`}
            className={active === p.kind ? "chip on" : "chip"}
          >
            {p.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="muted">Nothing listed for this placement yet.</p>
      ) : (
        <ul className="listings">
          {rows.map((listing) => (
            <li key={listing.id}>
              <Link href={`/s/${listing.seller.x_handle}/${listing.kind}`}>
                <div className="row">
                  <div>
                    <strong>{listing.seller.display_name}</strong>
                    <span className="muted"> @{listing.seller.x_handle}</span>
                  </div>
                  <div className="price">{formatUsd(listing.price_cents)}</div>
                </div>
                <div className="row muted small">
                  <span>
                    {PLACEMENTS.find((p) => p.kind === listing.kind)?.label} ·{" "}
                    {listing.term_days} days
                  </span>
                  <span>
                    {listing.seller.follower_count.toLocaleString("en-US")} followers
                    {listing.seller.is_org ? " · community" : ""}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
