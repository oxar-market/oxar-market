import { PROOF } from "@/lib/proof";

/**
 * Что уже покупали за место. Стоит выше объяснения, потому что доказательство
 * убеждает раньше описания: сначала человек видит, что за это платят, потом
 * читает, чем занимаемся мы.
 *
 * Суммы крупные и кликабельные - вся строка ведёт в источник. Это не украшение:
 * цифра, которую нельзя проверить, на этом сайте не живёт.
 */

export function Proof() {
  return (
    <div className="proof">
      {PROOF.map((row) => (
        <a
          key={row.url}
          className="proof-row"
          href={row.url}
          target="_blank"
          rel="noreferrer"
        >
          <span className="proof-amount">{row.amount}</span>
          <span className="proof-what">{row.what}</span>
          <span className="proof-who">{row.who}</span>
        </a>
      ))}
      <p className="proof-note">
        Every one of these was a one off, put together by hand. No price list, no
        calendar, no escrow, and no way to buy the same spot next month.
      </p>
    </div>
  );
}
