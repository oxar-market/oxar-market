# Fuzzing the escrow with Trident

A harness for [Trident](https://github.com/Ackee-Blockchain/trident) 0.12. The
fuzzer is guided through the lifecycle of an auction and, after every step,
checks invariants the program must hold under any sequence of actions.

## Invariants

1. **An open lot's vault holds exactly the top bid.** `vault.amount == lot.top_bid`,
   and zero for a lot without bids.
2. **Tokens are conserved.** The sum over every known token account (bidders,
   sellers, platform) plus every open vault equals everything that was minted.
   Nothing appears or disappears in any operation.
3. **The sale close only moves forward and never past the cap.** `closes_at`
   never decreases, never exceeds `hard_closes_at`, and the fee and fee
   recipient copied from the config at open never change for the life of the sale.
4. **Every settlement path sums to the bid, to the unit.** Payout: the seller
   receives `top_bid − fee`, the platform `fee`. Refund: the last bidder receives
   exactly `top_bid`, the seller nothing. Arbiter: the three parts add up to
   `top_bid`. In all three cases the vault is closed.

On top of that, expected rejections are asserted with their specific error
codes: a bid below the minimum step, a bid after close, a wrong previous bidder,
a stranger closing a running sale, closing a lot that has a winner before the
proof deadline has passed, a crank paying out inside the dispute window, paying
out a disputed lot, and a dispute after the window.

## Flows

| Flow | What it does |
|---|---|
| `open_sale` | The seller opens a sale: duration from 10 minutes to 30 days (mostly under two days), an extension window of up to one hour, a proof deadline after the hard cap. |
| `open_lot` | A lot on a random sale with a random reserve and minimum step; on a closed sale `LotClosed` is expected. |
| `place_bid` | A random bidder bids on a random lot. 15% of bids are deliberately below the minimum, 15% pass a wrong previous bidder. Checks the refund to the outbid bidder, the extension and its cap. |
| `time_passes` | Jumps forward: minutes, hours, days, sometimes more than a month. |
| `settle_lot` | Settles a lot on a closed sale: proof, early payout by the winner, payout by a crank after 72 hours, dispute and an arbiter decision with a random split, refund when there is no winner or the proof was missed. |
| `dispute_late` | A dispute after the window from the real winner: must be rejected. |

Each iteration sets the platform up from scratch with a random fee from 0 to
100%, two sellers and four bidders holding a million tokens each.

## Running

```bash
# once: cargo install trident-cli --version 0.12.0 --locked
cd chain
cargo-build-sbf --manifest-path programs/oxar-escrow/Cargo.toml --tools-version v1.52 --sbf-out-dir target/deploy
cd trident-tests
trident fuzz run escrow            # random seed
trident fuzz run escrow <SEED>     # reproduce a run
```

The number of iterations and steps is set in `main()` of `escrow/test_fuzz.rs`.

## Results

Run on 18 October 2026, 10,000 iterations × 150 steps (1.5 million steps),
master seed `8b1075e1403ee97b3f5838ede817efaaf6199a64461c3c49c1effcf2ffa6f11b`.
Invariant violations: 0. Panics: 0.

| Instruction | Invoked | Succeeded | Rejected (expected) |
|---|---|---|---|
| bidder_places_bid | 129,010 | 66,787 | 62,223 |
| seller_closes_lot | 115,517 | 62,501 | 53,016 |
| seller_opens_lot | 240,264 | 76,734 | 163,530 |
| seller_opens_sale | 249,866 | 249,866 | 0 |
| lot_pays_seller | 5,457 | 3,650 | 1,807 |
| seller_submits_proof | 4,829 | 4,829 | 0 |
| winner_disputes | 1,604 | 1,604 | 0 |
| winner_disputes (after the window) | 1,605 | 0 | 1,605 |
| arbiter_decides | 1,514 | 1,514 | 0 |

Every rejection was matched against the error code it was expected to fail
with; there were no unexpected rejections and no unexpected successes.

## Not covered

- `admin_sets_terms` after the initial setup, and admin handover.
- `arbiter_moves_proof` (moving the proof deadline).
- Legacy sales with `proof_deadline == 0`.
- Tokens sent to a vault outside the auction (covered by the integration test
  in `tests/oxar-auction.ts`).
- The program-owner check on first setup: TridentSVM has no program data
  account, so the check is skipped, the same as in the deploy script.
