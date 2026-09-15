import { PROOF, type ProofRow } from "@/lib/proof";

/**
 * Что уже покупали за место. Стоит выше объяснения, потому что доказательство
 * убеждает раньше описания: сначала человек видит, что за это платят, потом
 * читает, чем занимаемся мы.
 *
 * Строка со ссылкой кликается целиком и ведёт в источник. Строка без ссылки
 * выглядит так же, но не кликается - подчёркивать разницу отдельно не надо,
 * курсор и так покажет.
 */

function Row({ row }: { row: ProofRow }) {
  return (
    <>
      <span className="proof-amount">{row.amount}</span>
      <span className="proof-what">{row.what}</span>
      {row.who && <span className="proof-who">{row.who}</span>}
    </>
  );
}

export function Proof() {
  return (
    <div className="proof">
      {PROOF.map((row) =>
        row.url ? (
          <a
            key={row.amount}
            className="proof-row"
            href={row.url}
            target="_blank"
            rel="noreferrer"
          >
            <Row row={row} />
          </a>
        ) : (
          <span className="proof-row" key={row.amount}>
            <Row row={row} />
          </span>
        ),
      )}
      <p className="proof-note">
        Every one of these was a one off, put together by hand. No price list, no
        calendar, no escrow, and no way to buy the same spot next month.
      </p>
    </div>
  );
}
