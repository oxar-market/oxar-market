import { test } from "node:test";
import assert from "node:assert/strict";
import { proofPayload } from "./proof-payload.ts";

test("запись пруфа не зависит от порядка фото и пробелов по краям", () => {
  const one = proofPayload({ photos: ["b.jpg", "a.jpg"], links: [" https://x.com/p/1 "], note: " On stage " });
  const two = proofPayload({ photos: ["a.jpg", "b.jpg"], links: ["https://x.com/p/1"], note: "On stage" });
  assert.equal(one, two, "тот же пруф дал бы другой хеш");
});

test("пустые ссылки отбрасываются, а порядок ссылок сохраняется", () => {
  const text = proofPayload({ photos: [], links: ["https://b.com", "", "  ", "https://a.com"], note: "" });
  assert.equal(text, JSON.stringify({ photos: [], links: ["https://b.com", "https://a.com"], note: "" }));
});

test("другое фото - другая запись", () => {
  assert.notEqual(
    proofPayload({ photos: ["a.jpg"], links: [], note: "" }),
    proofPayload({ photos: ["c.jpg"], links: [], note: "" }),
  );
});
