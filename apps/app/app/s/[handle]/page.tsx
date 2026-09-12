import Link from "next/link";
import { notFound } from "next/navigation";
import { PLACEMENTS, formatUsd } from "@oxar/core";
import { listingsOfSeller, sellerByHandle } from "@/lib/db";

// Карточка продавца — макет профиля X: видно, какое место продаётся и сколько
// стоит, ровно там, где оно будет стоять.

export default async function SellerPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const seller = await sellerByHandle(handle);
  if (!seller) notFound();

  const rows = await listingsOfSeller(seller.id);
  const priceOf = (kind: string) => rows.find((l) => l.kind === kind);

  return (
    <main>
      <header className="top">
        <Link href="/" className="back">
          ← All placements
        </Link>
        <h1>{seller.display_name}</h1>
        <p className="muted">
          @{seller.x_handle} · {seller.follower_count.toLocaleString("en-US")} followers
          {seller.is_org ? " · community account" : ""}
        </p>
        {seller.bio && <p>{seller.bio}</p>}
      </header>

      <section className="mock">
        <div className="mock-banner">
          <Slot seller={seller.x_handle} kind="banner" listing={priceOf("banner")} />
        </div>
        <div className="mock-avatar">
          <Slot seller={seller.x_handle} kind="avatar" listing={priceOf("avatar")} />
        </div>
        <div className="mock-body">
          <div className="mock-name">
            {seller.display_name}{" "}
            <Slot
              seller={seller.x_handle}
              kind="name_suffix"
              listing={priceOf("name_suffix")}
            />
          </div>
          <div className="mock-line">
            <Slot seller={seller.x_handle} kind="bio_text" listing={priceOf("bio_text")} />
          </div>
          <div className="mock-meta">
            <Slot seller={seller.x_handle} kind="bio_link" listing={priceOf("bio_link")} />
            <Slot seller={seller.x_handle} kind="location" listing={priceOf("location")} />
          </div>
          <div className="mock-pinned">
            <Slot
              seller={seller.x_handle}
              kind="pinned_post"
              listing={priceOf("pinned_post")}
            />
          </div>
        </div>
      </section>

      <section>
        <h2>Everything for sale here</h2>
        {rows.length === 0 ? (
          <p className="muted">This account isn&apos;t selling any spots yet.</p>
        ) : (
          <ul className="listings">
            {rows.map((listing) => (
              <li key={listing.id}>
                <Link href={`/s/${seller.x_handle}/${listing.kind}`}>
                  <div className="row">
                    <strong>
                      {PLACEMENTS.find((p) => p.kind === listing.kind)?.label}
                    </strong>
                    <span className="price">{formatUsd(listing.price_cents)}</span>
                  </div>
                  <div className="row muted small">
                    <span>{listing.term_days} days</span>
                    <span>Request →</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Slot({
  seller,
  kind,
  listing,
}: {
  seller: string;
  kind: string;
  listing?: { price_cents: number; term_days: number };
}) {
  const label = PLACEMENTS.find((p) => p.kind === kind)?.label ?? kind;

  if (!listing) {
    return <span className="slot off">{label} - not for sale</span>;
  }

  return (
    <Link href={`/s/${seller}/${kind}`} className="slot">
      {label} · {formatUsd(listing.price_cents)} / {listing.term_days}d
    </Link>
  );
}
