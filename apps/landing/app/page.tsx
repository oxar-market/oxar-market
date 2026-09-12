import { Waitlist } from "./components/Waitlist";

// Суммы сделок (логотип Solana, баннер Fabiano) сюда сознательно не вынесены:
// они известны только со слов одного поста. Факты без цифр — правда, которую
// мы можем подтвердить. Цифры добавим, когда найдём первоисточники.

export default function Home() {
  return (
    <main>
      <section className="hero">
        <span className="tag">OXAR</span>
        <h1>
          You already own a billboard.
          <br />
          You&apos;re just not charging rent.
        </h1>
        <p className="lead">
          Sell a specific spot on your X profile - avatar, banner, bio link,
          pinned post - for a specific number of days. Paid in USDC on Solana.
          Escrow releases the money only for time the placement actually ran.
        </p>
        <a href="#waitlist" className="primary link-button">
          Join the waitlist
        </a>
      </section>

      <section>
        <h2>This is already happening</h2>
        <ul className="proof">
          <li>Solana sold ad space on its own logo for a charity campaign.</li>
          <li>Creators rent out their X banners to projects, one DM at a time.</li>
          <li>Communities get paid to run a project&apos;s avatar for a week.</li>
          <li>TikTokers rent out their foreheads.</li>
        </ul>
        <p className="muted">
          The behaviour exists. The infrastructure doesn&apos;t.
        </p>
      </section>

      <section>
        <h2>How it works</h2>
        <div className="columns">
          <div>
            <h3>If you have an audience</h3>
            <ol>
              <li>
                <strong>Get verified.</strong> We check the account is yours.
                One time, by hand.
              </li>
              <li>
                <strong>List your spots.</strong> Pick what you&apos;re willing to
                sell, set your price and your calendar.
              </li>
              <li>
                <strong>Approve and get paid.</strong> Every request arrives with
                the exact creative attached. Reject anything you don&apos;t want
                on your profile.
              </li>
            </ol>
          </div>
          <div>
            <h3>If you need attention</h3>
            <ol>
              <li>
                <strong>Pick a spot.</strong> Browse by placement type, audience
                size and price. See what&apos;s free and when.
              </li>
              <li>
                <strong>Pay into escrow.</strong> USDC on Solana. Funds are
                locked, not sent.
              </li>
              <li>
                <strong>Get proof.</strong> We check the profile on a schedule
                and log it.
              </li>
            </ol>
          </div>
        </div>
      </section>

      <section>
        <h2>Why this isn&apos;t a DM with extra steps</h2>
        <dl className="facts">
          <div>
            <dt>Escrow, not trust</dt>
            <dd>The money sits in on-chain escrow. Nobody can pull it, including us.</dd>
          </div>
          <div>
            <dt>Proof of placement</dt>
            <dd>We record that the spot was actually up, for the whole term.</dd>
          </div>
          <div>
            <dt>Pro-rata refunds</dt>
            <dd>Placement removed on day 3 of 5? You pay for 3.</dd>
          </div>
          <div>
            <dt>Creator control</dt>
            <dd>Every request is approved by hand. Your profile, your call.</dd>
          </div>
        </dl>
      </section>

      <section>
        <h2>What you can sell</h2>
        <p className="slots">
          Avatar · Banner · Name suffix · Bio text · Bio link · Location · Pinned post
        </p>
        <p className="muted">X first. More platforms - and physical space - later.</p>
      </section>

      <Waitlist />

      <footer>
        <span>OXAR</span>
        <a href="https://app.oxar.app">app.oxar.app</a>
      </footer>
    </main>
  );
}
