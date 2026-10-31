import test from "node:test";
import assert from "node:assert/strict";
import { derive } from "../src/logic.js";
import { planNumbers, weekPlan, monthPlan, suggestPlan, envelopes } from "../src/plan.js";

const cfg = {
  start: "2026-11-02", // ponedeljak
  incomes: [{ name: "Posao A", day: 1, amount: 100000 }, { name: "Posao A", day: 15, amount: 100000 }, { name: "Posao B", day: 0, amount: 95000 }],
  fixed: [{ name: "Porez", amount: 22000, cats: ["porez"] }, { name: "Računi", amount: 15000, cats: ["racuni"] }, { name: "Terapija", amount: 16000, cats: ["terapija"] }, { name: "Pretplate", amount: 8000, cats: ["pretplate"] }],
  save: [{ id: "putovanja", name: "Putovanja", amount: 15000 }, { id: "crnidani", name: "Crni dani", amount: 15000 }],
  big: { amount: 15000, cats: ["kucaauto", "lekar"] },
};
const man = (d, cat, total, extra = {}) => ({ id: d + cat + total, kind: "manual", cat, total, issued_at: d + "T12:00:00", merchant: extra.merchant || cat, store: extra.store || "", payment: extra.payment || "kartica", refund: !!extra.refund, items: [], person: "" });

test("plan: 295.000 minus fiksno, koverte i veće stvari je 189.000 za život, oko 43.500 nedeljno", () => {
  const N = planNumbers(cfg);
  assert.equal(N.life, 189000);
  assert.equal(N.week, 43466);
});

test("nedelja: fiksno i veće stvari se ne broje, prekoračenje smanjuje sledeću nedelju", () => {
  const receipts = [
    man("2026-11-03", "izlasci", 30000),
    man("2026-11-04", "market", 20000),       // prva nedelja: 50.000, preko za 6.534
    man("2026-11-05", "racuni", 15000),        // fiksno, ne broji se
    man("2026-11-06", "kucaauto", 9000),       // veće stvari, ne broji se
    man("2026-11-10", "gorivo", 5000),
  ];
  const L = derive({ tx: [], receipts });
  const w = weekPlan(cfg, L, "2026-11-11");
  assert.equal(w.last.spent, 50000);
  assert.equal(w.last.left, -6534);
  assert.equal(w.avail, 43466 - 6534);
  assert.equal(w.spent, 5000);
  assert.equal(w.left, 31932);
  assert.equal(w.daysLeft, 5);
  assert.deepEqual(w.cats.map(c => c.id), ["gorivo"]);
});

test("nedelja: ostatak se ne prenosi (ide u kovertu), prva nedelja se računa od dana plana", () => {
  const c2 = { ...cfg, start: "2026-11-05" }; // četvrtak: 4 dana prve nedelje
  const L = derive({ tx: [], receipts: [man("2026-11-06", "market", 5000)] });
  const w1 = weekPlan(c2, L, "2026-11-08");
  assert.equal(w1.avail, Math.round(189000 * 12 / 365.25 * 4));
  const w2 = weekPlan(c2, L, "2026-11-09");
  assert.ok(w2.last.left > 0);
  assert.equal(w2.avail, 43466);
});

test("mesec: plaćeno fiksno, fond za veće stvari se puni svakog meseca, koverte po imenu", () => {
  const receipts = [
    man("2026-11-15", "porez", 22000),
    man("2026-11-06", "kucaauto", 9000),
    man("2026-12-03", "lekar", 14000),
    man("2026-12-01", "stednja", 15000, { store: "putovanja", payment: "gotovina" }),
    man("2026-12-01", "stednja", 10000, { store: "crnidani", payment: "gotovina" }),
    man("2026-11-20", "stednja", 2000, { store: "putovanja", payment: "gotovina" }),
  ];
  const L = derive({ tx: [], receipts });
  const m = monthPlan(cfg, L, receipts, "2026-12-05");
  assert.equal(m.months, 2);
  assert.equal(m.bigLeft, 30000 - 9000 - 14000);
  assert.equal(m.fixed.find(f => f.name === "Porez").paid, 0); // porez je bio u novembru
  const env = envelopes(cfg, receipts, "2026-12-05");
  assert.deepEqual(env.map(e => [e.id, e.total, e.month]), [["putovanja", 17000, 15000], ["crnidani", 10000, 10000]]);
});

test("predlog plana: uplate iz poslednjih 35 dana i fiksno iz poslednjih 30", () => {
  const receipts = [
    { ...man("2026-10-01", "priliv", 100000, { merchant: "Posao A" }), refund: true },
    { ...man("2026-10-15", "priliv", 100000, { merchant: "Posao A" }), refund: true },
    { ...man("2026-10-31", "priliv", 95000, { merchant: "Posao B" }), refund: true },
    man("2026-10-20", "terapija", 16000),
  ];
  const L = derive({ tx: [], receipts });
  const p = suggestPlan(L, "2026-11-01");
  assert.deepEqual(p.incomes.map(i => [i.name, i.day, i.amount]), [["Posao A", 1, 100000], ["Posao A", 15, 100000], ["Posao B", 0, 95000]]);
  assert.equal(p.fixed.find(f => f.cats.includes("terapija")).amount, 16000);
});

test("koverta: gotovina podignuta i stavljena u kovertu iste nedelje nije potrošena, a ranija ne povećava nedelju", () => {
  const tx = [{ id: "b1", d: "2026-11-02", t: "BANKOMAT RAIFFEISEN", a: -30000 }];
  const receipts = [
    man("2026-11-02", "stednja", 15000, { store: "putovanja", payment: "gotovina" }),
    man("2026-11-02", "stednja", 15000, { store: "crnidani", payment: "gotovina" }),
    man("2026-11-03", "market", 2000),
    man("2026-11-10", "stednja", 5000, { store: "putovanja", payment: "gotovina" }), // bez podizanja te nedelje
  ];
  const L = derive({ tx, receipts });
  assert.equal(weekPlan(cfg, L, "2026-11-04").spent, 2000);
  const w2 = weekPlan(cfg, L, "2026-11-11");
  assert.equal(w2.spent, 0);
  assert.equal(w2.avail, 43466);
});

test("samo ovog meseca: vanredna uplata važi od svog dana do kraja meseca, sledeći mesec opet stalni plan", () => {
  const c = { ...cfg, start: "2026-11-02", incomes: [...cfg.incomes, { name: "Klijent C", day: 16, amount: 30000, month: "2026-11" }] };
  const L = derive({ tx: [], receipts: [] });
  assert.equal(planNumbers(c, "2026-11").life, 219000);
  assert.equal(planNumbers(c, "2026-12").life, 189000);
  assert.equal(weekPlan(c, L, "2026-11-11").avail, 43466);                       // pre uplate
  assert.equal(weekPlan(c, L, "2026-11-18").avail, 43466 + Math.round(30000 / 15 * 7)); // 16. do 30., 15 dana
  assert.equal(weekPlan(c, L, "2026-12-09").avail, 43466);
});

test("samo ovog meseca: umanjenje i mesec bez štednje i fonda", () => {
  const c = { ...cfg, start: "2026-11-02", incomes: [...cfg.incomes, { name: "Manjak iz oktobra", day: 1, amount: -21754, month: "2026-11" }, { name: "Posao B, potrošeno ranije", day: 1, amount: -95000, month: "2026-11" }], skip: { "2026-11": { save: true, big: true } } };
  const N = planNumbers(c, "2026-11");
  assert.equal(N.life, 295000 - 21754 - 95000 - 61000);
  assert.equal(N.save, 0);
  const L = derive({ tx: [], receipts: [] });
  assert.equal(weekPlan(c, L, "2026-11-04").avail, Math.round((189000 * 12 / 365.25 + (45000 - 21754 - 95000) / 30) * 7));
  const m = monthPlan(c, L, [], "2026-12-05");
  assert.equal(m.bigLeft, 15000);                                                   // novembar preskočen
});

test("uplatnica za porez (račun trezora 840) ide u Porez za firmu, ostale uplatnice u račune", () => {
  const ips = (acc, purpose, total) => ({ id: acc + total, kind: "ips", qr_text: `K:PR|V:01|C:1|R:${acc}|N:Primalac|I:RSD${total},00|SF:253|S:${purpose}`, issued_at: "2026-11-14T12:00:00", merchant: "Primalac", store: "", total, payment: "racun", refund: false, items: [], cat: null });
  const L = derive({ tx: [], receipts: [ips("840000071444411111", "Porez i doprinosi", 22500), ips("160000000012345678", "Infostan za oktobar", 6000)] });
  assert.deepEqual(L.map(e => e.parts[0].cat).sort(), ["porez", "racuni"]);
});
