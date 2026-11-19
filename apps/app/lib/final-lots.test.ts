import { test } from "node:test";
import assert from "node:assert/strict";
import { finalLots } from "./final-lots.ts";

const lot = (id: string, spot_id: string, status: string, closes_at: string, rehearsal = false) => ({
  id,
  spot_id,
  status,
  closes_at,
  rehearsal,
});

test("по месту - последний настоящий торг, прогоны и отменённые не в счёт", () => {
  const got = finalLots([
    lot("rehearsal", "chest", "won", "2026-12-01T00:00:00Z", true),
    lot("old", "chest", "unsold", "2026-09-01T00:00:00Z"),
    lot("real", "chest", "won", "2026-10-01T00:00:00Z"),
    lot("cancelled", "chest", "cancelled", "2026-11-01T00:00:00Z"),
    lot("draft", "chest", "draft", "2026-11-02T00:00:00Z"),
  ]);
  assert.deepEqual(got.map((one) => one.id), ["real"]);
});

test("каждое место отдельно: проданное и непроданное оба остаются", () => {
  const got = finalLots([
    lot("a", "chest", "won", "2026-10-01T00:00:00Z"),
    lot("b", "back", "unsold", "2026-10-01T00:00:00Z"),
  ]);
  assert.deepEqual(got.map((one) => one.id).sort(), ["a", "b"]);
});

test("только прогоны - итогов нет", () => {
  assert.deepEqual(finalLots([lot("r", "chest", "won", "2026-10-01T00:00:00Z", true)]), []);
});
