import { test } from "node:test";
import assert from "node:assert/strict";
import { myLogos } from "./logos.ts";

const bid = (mediaUrl: string, brand: string) => ({ lotId: "L", brand, mediaUrl });

test("свои логотипы - по одному на картинку, свежие первыми", () => {
  const out = myLogos([bid("a.png", "Acme"), bid("b.png", "Acme"), bid("a.png", "Acme"), bid("c.png", "Bolt")]);
  assert.deepEqual(
    out.map((one) => one.mediaUrl),
    ["a.png", "b.png", "c.png"],
  );
});

test("одна картинка под разными именами - одна плитка с последним именем", () => {
  const out = myLogos([bid("a.png", "Acme Labs"), bid("a.png", "Acme")]);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.brand, "Acme Labs");
});

test("пустые адреса не показываем", () => {
  assert.deepEqual(myLogos([bid("", "Acme")]), []);
});
