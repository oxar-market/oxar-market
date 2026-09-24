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
          works. Last updated 24 Sep 2026.
        </p>

        <ul className="rules">
          <li>
            <strong>Your wallet is yours.</strong> Whether you signed in with a
            wallet or created one by email, the keys belong to you. We never
            hold your funds and we are not able to move them.
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
            comes back to your wallet automatically. When the auction closes,
            the winning bid pays the seller minus the platform fee (currently
            10%). These rules are public and we cannot bend them for anyone.
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

        <p className="muted">
          Questions: <a href="mailto:support@oxar.app">support@oxar.app</a>
        </p>

        <a className="ghost" href="/">
          Back to the auction
        </a>
      </section>
    </main>
  );
}
