import { test } from "node:test";
import assert from "node:assert/strict";
import { clean, emailHtml, emailText, escapeHtml, message, type Lot } from "./messages.ts";

const NOW = Date.parse("2026-10-03T12:00:00Z");
const min = 60_000;
const at = (ms: number) => new Date(NOW + ms).toISOString();

const lot: Lot = { spot: "Spot 1", thing: "Test Tee", house: false, closesAt: null };
const houseLot: Lot = { spot: "4", thing: "OXAR Tee", house: true, closesAt: null };

const YOU = "https://app.oxar.app/?tab=you";
const AUCTION = "https://app.oxar.app/?tab=auction";
const MARKET = "https://app.oxar.app/?tab=market";

const KINDS = [
  "outbid", "proof", "ending", "won", "appeal_last_day", "refunded",
  "decided", "sold", "proof_due", "paid", "disputed", "dispute_admin",
];

// Данные события, с которыми каждый вид даёт письмо.
const DATA: Record<string, Record<string, unknown>> = {
  outbid: { amount_cents: 12_345 },
  proof: {},
  ending: { closes_at: at(30 * min) },
  won: { proof_by: at(7 * 24 * 60 * min) },
  appeal_last_day: { until: at(20 * 60 * min) },
  refunded: {},
  decided: { seller_bps: 5_000 },
  sold: { proof_by: at(7 * 24 * 60 * min) },
  proof_due: { proof_by: at(3 * 24 * 60 * min) },
  paid: {},
  disputed: {},
  dispute_admin: {},
};

test("каждый вид события даёт заголовок, текст, кнопку и ссылку в приложение", () => {
  for (const kind of KINDS) {
    const m = message(kind, DATA[kind], lot, NOW);
    assert.ok(m, kind);
    assert.ok(m.title && m.body && m.action, kind);
    assert.match(m.url, /^https:\/\/app\.oxar\.app\/\?tab=(you|auction|market)$/, kind);
    // Никаких длинных и средних тире в английском тексте.
    assert.doesNotMatch(m.title + m.body + m.action, /[\u2013\u2014]/, kind);
  }
});

test("неизвестный вид - ничего", () => {
  assert.equal(message("nope", {}, lot, NOW), null);
});

test("перебили: сумма и кнопка к торгу; торг нашей вещи - вкладка Auction, вещи продавца - Market", () => {
  const m = message("outbid", { amount_cents: 12_345 }, lot, NOW)!;
  assert.equal(m.title, "You've been outbid on Spot 1");
  assert.match(m.body, /\$123\.45/);
  assert.equal(m.action, "Bid again");
  assert.equal(m.url, MARKET);
  const house = message("outbid", { amount_cents: 500 }, houseLot, NOW)!;
  assert.equal(house.title, "You've been outbid on spot 4");
  assert.equal(house.url, AUCTION);
});

test("пруф пришёл: кнопка проверить, вкладка You", () => {
  const m = message("proof", {}, lot, NOW)!;
  assert.equal(m.title, "Proof is in for Spot 1");
  assert.match(m.body, /Test Tee/);
  assert.equal(m.action, "Check the proof");
  assert.equal(m.url, YOU);
});

test("конец торга: время до конца - настоящее, а не «час»", () => {
  const ends = (ms: number, closesAt: string | null = null) =>
    message("ending", { closes_at: at(ms) }, { ...lot, closesAt }, NOW)?.title;
  assert.equal(ends(14 * min), "Bidding ends in 14 minutes");
  assert.equal(ends(14 * min + 20_000), "Bidding ends in 14 minutes");
  assert.equal(ends(14 * min + 40_000), "Bidding ends in 15 minutes");
  assert.equal(ends(2 * min), "Bidding ends in 2 minutes");
  assert.equal(ends(70_000), "Bidding ends in a minute");
  assert.equal(ends(20_000), "Bidding ends in a minute");
  assert.equal(ends(59 * min), "Bidding ends in 59 minutes");
  assert.equal(ends(59 * min + 40_000), "Bidding ends in an hour");
  assert.equal(ends(60 * min), "Bidding ends in an hour");
  assert.equal(ends(85 * min), "Bidding ends in an hour");
  assert.equal(ends(95 * min), "Bidding ends in 2 hours");
});

test("конец торга: поздние ставки отодвинули конец - берём время из лота", () => {
  const m = message("ending", { closes_at: at(10 * min) }, { ...lot, closesAt: at(25 * min) }, NOW)!;
  assert.equal(m.title, "Bidding ends in 25 minutes");
  assert.match(m.body, /Oct 3, 12:25 UTC/);
  assert.equal(m.action, "Open the auction");
  assert.equal(m.url, MARKET);
  // Время в лоте раньше, чем в событии, - так не бывает, но верим позднему.
  const earlier = message("ending", { closes_at: at(30 * min) }, { ...lot, closesAt: at(5 * min) }, NOW)!;
  assert.equal(earlier.title, "Bidding ends in 30 minutes");
});

test("конец торга, который уже прошёл, не шлём", () => {
  assert.equal(message("ending", { closes_at: at(-1 * min) }, lot, NOW), null);
  assert.equal(message("ending", { closes_at: at(0) }, lot, NOW), null);
  assert.equal(message("ending", { closes_at: "не время" }, lot, NOW), null);
});

test("выиграл: срок пруфа в тексте, кнопка к выигрышам", () => {
  const m = message("won", DATA.won, lot, NOW)!;
  assert.equal(m.title, "You won Spot 1");
  assert.match(m.body, /Spot 1 on Test Tee: your logo goes on it\./);
  assert.match(m.body, /Oct 10, 12:00 UTC/);
  assert.equal(m.action, "Open your wins");
  assert.equal(m.url, YOU);
  assert.doesNotMatch(message("won", {}, lot, NOW)!.body, /until/);
});

test("последний день проверки и возврат ставки", () => {
  const last = message("appeal_last_day", DATA.appeal_last_day, lot, NOW)!;
  assert.equal(last.title, "Last day to check the proof");
  assert.match(last.body, /Oct 4, 08:00 UTC/);
  assert.equal(last.action, "Check the proof");
  const back = message("refunded", {}, lot, NOW)!;
  assert.equal(back.title, "Your bid came back");
  assert.equal(back.action, "See your bids");
  assert.equal(back.url, YOU);
});

test("решение по спору: доля продавца словами", () => {
  const split = (bps: number) => message("decided", { seller_bps: bps }, lot, NOW)!.body;
  assert.match(split(10_000), /the payment goes to the seller/);
  assert.match(split(0), /the bid goes back to the winner/);
  assert.match(split(2_500), /25% goes to the seller, the rest back to the winner/);
  assert.equal(message("decided", { seller_bps: 0 }, lot, NOW)!.action, "See the decision");
});

test("продавцу: торг закончился, оплата, спор; админу - новый спор", () => {
  const sold = message("sold", DATA.sold, lot, NOW)!;
  assert.equal(sold.title, "Your auction ended");
  assert.match(sold.body, /Test Tee: the results/);
  assert.equal(sold.action, "Open your seller cabinet");
  assert.equal(message("paid", {}, lot, NOW)!.title, "Payment received");
  assert.equal(message("disputed", {}, lot, NOW)!.action, "See the dispute");
  const admin = message("dispute_admin", {}, lot, NOW)!;
  assert.equal(admin.action, "Review the dispute");
  assert.equal(admin.url, YOU);
});

test("срок пруфа: настоящее время до срока, а не номер окна", () => {
  const due = (proofBy: string, days = 7) => message("proof_due", { proof_by: proofBy, days }, lot, NOW)?.title;
  // Сегодня по UTC.
  assert.equal(due("2026-10-03T23:59:00Z"), "Proof due today, by 23:59 UTC");
  assert.equal(due("2026-10-03T12:30:00Z", 1), "Proof due today, by 12:30 UTC");
  // Меньше суток, но уже завтра по UTC.
  assert.equal(due("2026-10-04T09:00:00Z"), "Proof due tomorrow, by 09:00 UTC");
  // Больше суток, завтра.
  assert.equal(due("2026-10-04T18:00:00Z", 1), "Proof due tomorrow, by 18:00 UTC");
  assert.equal(due("2026-10-06T10:00:00Z", 1), "Proof due in 3 days");
  assert.equal(due("2026-10-10T11:00:00Z"), "Proof due in 7 days");
  const m = message("proof_due", { proof_by: "2026-10-06T10:00:00Z", days: 7 }, lot, NOW)!;
  assert.match(m.body, /Test Tee: show it in use with the logos by Oct 6, 10:00 UTC/);
  assert.equal(m.action, "Send the proof");
  assert.equal(m.url, YOU);
});

test("срок пруфа, который прошёл или не задан, не шлём", () => {
  assert.equal(message("proof_due", { proof_by: "2026-10-03T11:59:00Z", days: 1 }, lot, NOW), null);
  assert.equal(message("proof_due", { days: 1 }, lot, NOW), null);
});

test("без вещи и места текст не ломается", () => {
  const empty: Lot = { spot: "", thing: "", house: false, closesAt: null };
  assert.equal(message("outbid", { amount_cents: 100 }, empty, NOW)!.title, "You've been outbid");
  assert.match(message("paid", {}, empty, NOW)!.body, /^Your spot:/);
  assert.match(message("sold", {}, empty, NOW)!.body, /^Your thing:/);
  assert.equal(message("won", {}, empty, NOW)!.title, "You won a spot");
});

test("clean: одна строка, без ссылок и доменов, не длиннее 60 знаков", () => {
  assert.equal(clean("Tee\nBcc: x@evil.com"), "Tee Bcc: x@");
  assert.equal(clean("Visit https://evil.example/x now"), "Visit now");
  assert.equal(clean("go to www.evil.io today"), "go to today");
  assert.equal(clean("cheap at evil.shop/deal"), "cheap at");
  assert.equal(clean("a".repeat(100)).length, 60);
  assert.equal(clean("  Tee \t  front  "), "Tee front");
});

test("подписи продавца в тексте - очищенные", () => {
  const dirty: Lot = { spot: "Chest\r\nvisit evil.com", thing: "Tee https://evil.example", house: false, closesAt: null };
  const m = message("won", {}, dirty, NOW)!;
  assert.equal(m.title, "You won Chest visit");
  assert.doesNotMatch(m.body, /evil|https|\r|\n/);
});

test("escapeHtml экранирует всё, что меняет разметку", () => {
  assert.equal(escapeHtml(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
});

test("письмо HTML: логотип, заголовок, текст, кнопка, подвал", () => {
  const m = message("proof", {}, lot, NOW)!;
  const html = emailHtml(m);
  assert.match(html, /<img src="https:\/\/oxar\.app\/mark\.png"/);
  assert.match(html, /<h1[^>]*>Proof is in for Spot 1<\/h1>/);
  assert.match(html, /<a href="https:\/\/app\.oxar\.app\/\?tab=you"[^>]*>Check the proof<\/a>/);
  assert.match(html, /To change or stop these emails, open You &gt; Notifications in the app\./);
  // Только встроенные стили: ни внешних таблиц, ни блока style, ни скриптов.
  assert.doesNotMatch(html, /<link|<style|<script/i);
  assert.doesNotMatch(html, /[\u2013\u2014]/);
});

test("письмо HTML: текст продавца экранирован", () => {
  const evil: Lot = { spot: `<img src=x onerror="alert(1)">`, thing: `Tee <b>&</b>`, house: false, closesAt: null };
  const html = emailHtml(message("proof", {}, evil, NOW)!);
  assert.doesNotMatch(html, /<img src=x|<b>|onerror="/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /Tee &lt;b&gt;&amp;&lt;\/b&gt;/);
});

test("письмо текстом: текст, действие со ссылкой, подвал", () => {
  const m = message("proof_due", { proof_by: "2026-10-06T10:00:00Z", days: 7 }, lot, NOW)!;
  assert.equal(
    emailText(m),
    `${m.body}\n\nSend the proof: https://app.oxar.app/?tab=you\n\n` +
      "To change or stop these emails, open You > Notifications in the app.",
  );
});
