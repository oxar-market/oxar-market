import Link from "next/link";
import { notFound } from "next/navigation";
import { PLACEMENTS, formatUsd, splitPayout, type PlacementKind } from "@oxar/core";
import { busyRanges, listingOf, sellerByHandle } from "@/lib/db";
import { RequestForm } from "@/app/components/RequestForm";

export default async function PlacementPage({
  params,
}: {
  params: Promise<{ handle: string; kind: string }>;
}) {
  const { handle, kind } = await params;
  const spec = PLACEMENTS.find((p) => p.kind === kind);
  if (!spec) notFound();

  const seller = await sellerByHandle(handle);
  if (!seller) notFound();

  const listing = await listingOf(seller.id, kind as PlacementKind);
  if (!listing) notFound();

  const busy = await busyRanges(listing.id);
  const payout = splitPayout(listing.price_cents);

  return (
    <main>
      <header className="top">
        <Link href={`/s/${seller.x_handle}`} className="back">
          ← {seller.display_name}
        </Link>
        <h1>
          {spec.label} · {formatUsd(listing.price_cents)}
        </h1>
        <p className="muted">
          {listing.term_days} days on @{seller.x_handle} ·{" "}
          {seller.follower_count.toLocaleString("en-US")} followers
        </p>
      </header>

      <section>
        <h2>What you get</h2>
        <p>
          Your {spec.label.toLowerCase()} stays on the profile for{" "}
          {listing.term_days} days straight. We check the profile on a schedule
          and keep the log. If it comes down early, you get the unused days back.
        </p>
        <p className="muted small">
          Seller receives {formatUsd(payout.netCents)}, platform fee{" "}
          {formatUsd(payout.feeCents)}. You pay {formatUsd(payout.grossCents)}.
        </p>
      </section>

      <RequestForm
        listingId={listing.id}
        termDays={listing.term_days}
        priceCents={listing.price_cents}
        busy={busy}
      />
    </main>
  );
}
