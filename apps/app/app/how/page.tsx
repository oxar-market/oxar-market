import type { Metadata } from "next";

/**
 * Как работает площадка - словами, а не условиями. /terms - что мы обещаем и
 * чего не можем; здесь - путь торга от начала до денег, для покупателя и для
 * продавца, по шагам. Числа здесь - из программы эскроу, а не обещания:
 * комиссия, 72 часа, 30 дней.
 */

export const metadata: Metadata = {
  title: "OXAR - How it works",
};

export default function How() {
  return (
    <main className="app">
      <section className="screen">
        <h1>How it works</h1>
        <p className="muted">
          OXAR auctions ad spots on physical things. A real item gets its spots marked, each spot
          goes up for auction, and the winning logo is printed on the item. Payments are in USDC
          on Solana and are held by an escrow program, not by us.
        </p>

        <h2>If you bid</h2>
        <ol className="rules">
          <li>
            <strong>Pick a spot.</strong> Each thing shows who has it, where and when it will be
            used, and the day by which the seller shows proof. You see all of it before you bid.
          </li>
          <li>
            <strong>Bid with your logo.</strong> Your bid leaves your wallet and is locked in the
            escrow program. If someone outbids you, your money comes back to your wallet in the
            same transaction.
          </li>
          <li>
            <strong>Last minutes.</strong> A bid near the end moves the close for the whole thing
            forward, by up to one hour in total. Sniping in the last second does not win.
          </li>
          <li>
            <strong>You win.</strong> Your bid stays in escrow. The seller prints your logo and
            uses the thing as described.
          </li>
          <li>
            <strong>Proof.</strong> The seller shows the thing in use with your logo by the proof
            day. If notifications are on, you get one. You have 72 hours to check it.
          </li>
          <li>
            <strong>Release or dispute.</strong> If it looks right, release the payment and the
            seller is paid at once. If it does not, dispute it, and OXAR decides. If you do
            nothing, the seller is paid when the 72 hours are over.
          </li>
          <li>
            <strong>No proof.</strong> If the seller shows no proof by the proof day, your bid
            goes back to you.
          </li>
        </ol>

        <h2>If you sell</h2>
        <ol className="rules">
          <li>
            <strong>Get access.</strong> Request seller access. We approve sellers by hand.
          </li>
          <li>
            <strong>Add a thing.</strong> Take photos and drag a frame over each spot you want to
            sell.
          </li>
          <li>
            <strong>Set up the auction.</strong> Reserve, minimum step, when it opens and closes,
            who has the thing, where and when it is used, and the day you show proof by.
          </li>
          <li>
            <strong>Publish.</strong> Publishing needs a small amount of SOL for the accounts the
            program opens. The button shows the exact amount; most of it comes back to you after
            the auction.
          </li>
          <li>
            <strong>Review.</strong> We check the thing and put it on the Market.
          </li>
          <li>
            <strong>After the auction.</strong> Download the winning logos, print them, and use the
            thing as described.
          </li>
          <li>
            <strong>Show proof.</strong> Upload photos or links of the thing in use by the proof
            day. Each spot is paid out to you when its winner releases it, or 72 hours after the
            proof if nobody disputes.
          </li>
        </ol>

        <h2>Money</h2>
        <ul className="rules">
          <li>
            <strong>Escrow.</strong> Bids are held by an open program on Solana. We cannot take
            them. The only thing we can do is decide a dispute, and even then the bid can only go
            to the winner or to the seller.
          </li>
          <li>
            <strong>Fee.</strong> The platform fee is 10% of the winning bid; the seller gets the
            other 90%. In a split decision, the fee is taken only from the seller&apos;s part. A
            spot that does not sell costs nothing.
          </li>
          <li>
            <strong>Disputes.</strong> OXAR decides within 30 days: pay the seller, return the bid,
            or split it. If we do not decide in 30 days, the bid goes back to the winner.
          </li>
        </ul>

        <p className="muted">
          The full rules are in the <a href="/terms">terms</a>. Questions:{" "}
          <a href="mailto:support@oxar.app">support@oxar.app</a>
        </p>

        <a className="ghost" href="/">
          Back to the auction
        </a>
      </section>
    </main>
  );
}
