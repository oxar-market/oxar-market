import { test } from "node:test";
import assert from "node:assert/strict";
import { auctionLink, leadText, shareText, shareIntent, tieText } from "./share.ts";

test("текст твита: сумма, вещь и ссылка, без длинных тире", () => {
  const text = shareText({ cents: 17500, title: "The tie" });
  assert.equal(text, "I just bid $175 to put my logo on the tie.\n\nOutbid me if you can: app.oxar.app");
  assert.ok(!/[—–]/.test(text));
});

test("место называется, только если их у вещи несколько", () => {
  assert.equal(
    shareText({ cents: 4000, title: "Local Event Tee", spot: "07" }),
    "I just bid $40 to put my logo on Local Event Tee, spot 07.\n\nOutbid me if you can: app.oxar.app",
  );
});

test("центы не теряются", () => {
  assert.match(shareText({ cents: 17550, title: "The tie" }), /\$175\.50/);
});

test("ссылка на окно твита кодирует текст целиком", () => {
  const url = new URL(shareIntent("a & b\nc"));
  assert.equal(url.origin + url.pathname, "https://x.com/intent/post");
  assert.equal(url.searchParams.get("text"), "a & b\nc");
});

test("кто, где и когда - строками, если они известны", () => {
  const text = shareText({
    cents: 17500,
    title: "The tie",
    worn: { by: "Simon (@simonmolitor)", where: "Solana Ecosystem Call, live", when: "October 29" },
  });
  assert.equal(
    text,
    "I just bid $175 to put my logo on the tie.\nWho: Simon (@simonmolitor)\nWhere: Solana Ecosystem Call, live\nWhen: October 29\n\nOutbid me if you can: app.oxar.app",
  );
});

test("неизвестное не пишется", () => {
  const text = shareText({ cents: 17500, title: "The tie", worn: { by: null, where: "Kyiv", when: null } });
  assert.equal(text, "I just bid $175 to put my logo on the tie.\nWhere: Kyiv\n\nOutbid me if you can: app.oxar.app");
});

test("твит не длиннее 280: лишние строки отпадают с конца", () => {
  const long = "x".repeat(120);
  const text = shareText({ cents: 17500, title: "The tie", worn: { by: long, where: long, when: long } });
  assert.ok(text.length <= 280, String(text.length));
  assert.match(text, /^I just bid \$175/);
  assert.match(text, /Outbid me if you can: app\.oxar\.app$/);
});

test("ссылка ведёт прямо на торг вещи", () => {
  assert.equal(auctionLink("3bbef1e7-9398-4164-84cb-4f48f1a39ec6"), "https://app.oxar.app/?thing=3bbef1e7-9398-4164-84cb-4f48f1a39ec6");
});

test("в твите о ставке - прямая ссылка, если она есть", () => {
  const text = shareText({ cents: 17500, title: "The tie", link: "https://app.oxar.app/?thing=x" });
  assert.match(text, /Outbid me if you can: https:\/\/app\.oxar\.app\/\?thing=x$/);
});

test("ставка лидера от площадки - не от первого лица", () => {
  const text = leadText({ cents: 15000, title: "The tie", link: "https://app.oxar.app/?thing=x" });
  assert.equal(text, "Top bid on the tie: $150.\n\nOutbid it: https://app.oxar.app/?thing=x");
  assert.ok(!/\bI\b/.test(text));
});

test("галстук говорит сам: своя ставка", () => {
  assert.equal(
    tieText({ mine: true, brand: "Acme", cents: 17500 }),
    "I'm going live on @EcosystemCall with @simonmolitor on Oct 29.\n\nWearing Acme all over. Top bid: $175.\n\nBid there: app.oxar.app/tie",
  );
});

test("галстук говорит сам: лидер, которым делится площадка", () => {
  assert.equal(
    tieText({ mine: false, brand: "Acme", cents: 15000 }),
    "I'm going live on @EcosystemCall with @simonmolitor on Oct 29.\n\nRight now I'm wearing Acme. Top bid: $150.\n\nBid there: app.oxar.app/tie",
  );
});

test("без названия бренда - без пустых слов", () => {
  assert.match(tieText({ mine: true, brand: "", cents: 17500 }), /Wearing this logo all over/);
  assert.ok(tieText({ mine: false, brand: "  ", cents: 17500 }).includes("Right now I'm wearing someone's logo."));
});
