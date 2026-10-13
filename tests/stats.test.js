import test from "node:test";
import assert from "node:assert/strict";
import { derive, totals } from "../src/logic.js";
import { dailySpend, rhythm, insights, nonEssential } from "../src/stats.js";

const tx = [
  { id: "a", d: "2026-10-01", t: "MAXI 451 BEOGRAD", a: -2400 },
  { id: "b", d: "2026-10-02", t: "BANKOMAT RAIFFEISEN", a: -10000 },
  { id: "c", d: "2026-10-03", t: "WOLT BEOGRAD", a: -1800 },
  { id: "d", d: "2026-10-03", t: "WOLT BEOGRAD", a: -1800 },
];
const receipts = [
  { id: "r1", kind: "fiscal", store: "Univerexport", total: 480, payment: "gotovina", issued_at: "2026-09-20T12:00:00", items: [{ name: "DAVIDOFF GOLD", price: 480, qty: 1, total: 480 }] },
  { id: "r2", kind: "fiscal", store: "Univerexport", total: 520, payment: "gotovina", issued_at: "2026-10-04T12:00:00", items: [{ name: "DAVIDOFF GOLD", price: 520, qty: 1, total: 520 }] },
];

test("zbir po danima je isti kao potrošnja za mesec", () => {
  const L = derive({ tx, receipts });
  const d = dailySpend(L);
  const oct = Object.entries(d).filter(([k]) => k.startsWith("2026-10")).reduce((s, [, v]) => s + v, 0);
  assert.equal(Math.round(oct * 100) / 100, totals(L.filter(e => e.d.startsWith("2026-10"))).spend);
});

test("upozorenja: skuplji artikal i moguće dvostruko naplaćeno", () => {
  const L = derive({ tx, receipts });
  const t = insights(L, "2026-10-05", null).map(i => i.title);
  assert.ok(t.some(x => /DAVIDOFF GOLD je skuplji/.test(x)));
  assert.ok(t.some(x => /dvostruko/.test(x)));
});

test("nije nužno: dostava i cigarete, paklice sa računa", () => {
  const L = derive({ tx, receipts });
  const n = nonEssential(L, "2026-10-05");
  assert.equal(n.rows.find(r => r.id === "dostava").v, 3600);
  assert.equal(n.packs, 2);   // poslednjih 30 dana: oba računa
  const R = rhythm(L, "2026-10-05");
  assert.ok(R.month > 0 && R.projected >= R.month);
});

test("bez računa i pretplata: gotovina plaćena za porez ne postaje nepoznata potrošnja", async () => {
  const { derive, totals, FIXED } = await import("../src/logic.js");
  const { dailySpend } = await import("../src/stats.js");
  const atm = { id: "a", d: "2026-10-12", t: "BANKOMAT RAIFFEISEN", a: -30000 };
  const porez = { id: "p", kind: "manual", cat: "racuni", total: 22643, issued_at: "2026-10-12T12:00:00", payment: "gotovina", refund: false, items: [], merchant: "Porez" };
  const L = derive({ tx: [atm], receipts: [porez] });
  assert.equal(totals(L).spend, 30000);
  assert.equal(totals(L, FIXED).spend, 7357);
  assert.equal(dailySpend(L, FIXED)["2026-10-12"], 7357);
  assert.equal(dailySpend(L)["2026-10-12"], 30000);
});

test("koliko smeš dnevno: Ostalo minus računi koji se još očekuju, podeljeno na dane do datuma", async () => {
  const { derive } = await import("../src/logic.js");
  const { dailyBudget } = await import("../src/stats.js");
  const m = (id, cat, total, d, pay = "kartica") => ({ id, kind: "manual", cat, total, issued_at: d + "T12:00:00", payment: pay, refund: false, items: [], merchant: id });
  const L = derive({ tx: [], receipts: [m("a", "racuni", 5000, "2026-09-05"), m("b", "pretplate", 2000, "2026-09-10"), m("c", "pretplate", 1086, "2026-10-12"), m("d", "izlasci", 500, "2026-10-14", "gotovina")] });
  const B = dailyBudget(63134, L, "2026-10-14", "2026-10-31");
  assert.equal(B.daysLeft, 18);
  assert.equal(B.monthly, 7000);
  assert.equal(B.reserve, 5914);
  assert.equal(B.spentToday, 500);
  assert.equal(B.perDay, 3206.67);
  assert.equal(B.leftToday, 2706.67);
  // do 15. novembra: još jedan ceo mesec računa
  const N = dailyBudget(63134, L, "2026-10-14", "2026-11-15");
  assert.equal(N.months, 1);
  assert.equal(N.reserve, 12914);
});
