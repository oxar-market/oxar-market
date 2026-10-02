import type { Metadata } from "next";

/**
 * Условия словами, которыми говорит сам продукт, а не юридическим туманом.
 *
 * Страница появилась после первого дня торга: человек отправил на свой
 * кошелёк не ту монету и спросил, вернём ли мы деньги. Ответ «мы не можем» -
 * правда архитектуры, и здесь она сказана до перевода, а не после.
 *
 * Это не замена юристу. Дорастём до заметных денег - текст посмотрит юрист.
 */

export const metadata: Metadata = {
  title: "OXAR - Terms",
  robots: { index: false },
};

export default function Terms() {
  return (
    <main className="app">
      <section className="screen">
        <h1>Terms</h1>
        <p className="muted">
          Short and in plain words, because this is how the product itself
          works. Last updated 3 Oct 2026.
        </p>

        <ul className="rules">
          <li>
            <strong>Your wallet is yours.</strong> Whether you signed in with a
            wallet or created one by email, the keys belong to you. We never
            hold your funds and we cannot take them. The one thing we can do
            is decide a dispute, as described below.
          </li>
          <li>
            <strong>Blockchain transfers are final.</strong> Coins sent to a
            wrong address, on a wrong network, or in a wrong token cannot be
            recovered by anyone, including us. Check twice before sending:
            USDC, Solana network.
          </li>
          <li>
            <strong>The auction is run by a program, not by us.</strong> Bids
            are locked in its escrow on Solana. If you are outbid, your money
            comes back to your wallet automatically. The winning bid stays in
            escrow until the seller shows proof, as described below, and then
            pays the seller minus the platform fee (currently 10%). These
            rules are public and we cannot bend them for anyone.
          </li>
          <li>
            <strong>Artwork.</strong> Bid only with artwork you have the right
            to use. We may decline to print artwork that is unlawful or
            hateful.
          </li>
          <li>
            <strong>No promises.</strong> The service is provided as is. We do
            not give financial advice and we do not guarantee outcomes of any
            auction.
          </li>
        </ul>

        <h2>Buyer protection</h2>
        <ul className="rules">
          <li>
            <strong>Proof deadline.</strong> Before the auction opens, the
            seller sets the day by which they will show the thing in use with
            the winning logos. You see this day before you bid, and it cannot
            be moved earlier.
          </li>
          <li>
            <strong>No proof, no payment.</strong> If the seller shows no proof
            by that day, the winning bids go back to the winners. Anyone can
            trigger the refund; it does not depend on us.
          </li>
          <li>
            <strong>72 hours to check.</strong> Once the seller sends proof,
            each winner has 72 hours to check it. Release the payment and the
            seller is paid at once. Say nothing, and the seller is paid when
            the 72 hours are over.
          </li>
          <li>
            <strong>Disputes.</strong> If the proof is not right, dispute it
            within the 72 hours. Your bid stays in escrow and OXAR decides:
            pay the seller, return the bid to you, or split it. We can only
            send the bid to you or to the seller, never anywhere else. The
            platform fee is taken only from the part that goes to the seller.
          </li>
          <li>
            <strong>30 days.</strong> If we have not decided a dispute within
            30 days, anyone can close it and the bid goes back to the winner.
          </li>
          <li>
            <strong>Moved events.</strong> If the event where the thing is
            shown moves to a later date, OXAR can move the proof deadline later
            as well, never earlier and never after it has passed. Winners see
            the new date.
          </li>
          <li>
            <strong>Auctions before 3 Oct 2026</strong> were paid out to the
            seller when they closed, under the rules at the time.
          </li>
        </ul>

        <p className="muted">
          Step by step: <a href="/how">how it works</a>. Questions: <a href="mailto:support@oxar.app">support@oxar.app</a>
        </p>

        <a className="ghost" href="/">
          Back to the auction
        </a>
      </section>
    </main>
  );
}
