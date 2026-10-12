import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { derive, totals, stableId } from "../src/logic.js";

// Lični podaci nisu u repou; ovi testovi rade samo lokalno kad fajl postoji.
const FIX = new URL("./fixtures/months.json", import.meta.url);
const have = existsSync(FIX);
const months = have ? JSON.parse(readFileSync(FIX)) : {};
const tx = Object.values(months).flatMap(m => m.rows);
const overrides = { "20261006nev7xo": { cat: "prolazno", person: "Dejan Arsić" }, "2026100619tb6sr": { cat: "prolazno", person: "Dejan Arsić" } };
const rules = [{ kind: "merchant", match: "MARKO ANDJELKOVIC", cat: "prolazno", person: "Marko Anđelković" }];

const t = have ? test : test.skip;
t("isti zbirovi kao prva verzija", () => {
  const T = totals(derive({ tx, overrides, rules, receipts: [] }));
  assert.equal(T.spend, 456919.51);
  assert.equal(T.withdrawn, 242000);
  assert.equal(T.inc, 462263.64);
});

test("stabilni id isti kao u prvoj verziji", () => {
  assert.equal(stableId("2026-10-06", "Dejan Arsić", -185000, 1), "20261006nev7xo");
});

t("račun karticom se upari sa stavkom iz banke i razbije po artiklima", () => {
  const rc = { id: "a", kind: "fiscal", issued_at: "2026-10-05T10:00:00", merchant: "MOL Serbia", total: 1049.99, payment: "kartica",
    items: [{ name: "Marlboro Gold", total: 580 }, { name: "Espresso", total: 469.99 }] };
  const list = derive({ tx, overrides, rules, receipts: [rc] });
  const e = list.find(x => x.receipt === rc);
  assert.equal(e.type, "bank");
  assert.deepEqual(e.parts.map(p => [p.cat, p.amount]), [["cigarete", -580], ["pumpa", -469.99]]);
  const T = totals(list);
  assert.equal(T.spend, 456919.51); // ukupno se ne menja, samo raspodela
  assert.equal(T.by.cigarete.sum, -580);
});

t("račun gotovinom smanjuje neobjašnjenu gotovinu, ukupno isto", () => {
  const rc = { id: "b", kind: "fiscal", issued_at: "2026-10-05T10:00:00", merchant: "Trafika", total: 600, payment: "gotovina", items: [{ name: "LD Blue", total: 600 }] };
  const T = totals(derive({ tx, overrides, rules, receipts: [rc] }));
  assert.equal(T.cashReceipts, 600);
  assert.equal(T.unexplained, 241400);
  assert.equal(T.spend, 456919.51);
});

test("koliko imaš: stanje + uplata - potrošnja, uplata se ne broji dvaput kad stigne izvod", async () => {
  const { derive, balance } = await import("../src/logic.js");
  const stanje = { id: "s", kind: "manual", cat: "stanje", total: 85000, issued_at: "2026-10-12T12:00:00", created_at: "2026-10-12T09:00:00Z", payment: "racun", items: [] };
  const uplata = { id: "u", kind: "manual", cat: "priliv", refund: true, merchant: "Hristijan", total: 100000, issued_at: "2026-10-12T12:00:00", created_at: "2026-10-12T09:05:00Z", payment: "racun", items: [] };
  const trosak = { id: "t", kind: "manual", cat: "market", total: 1500, issued_at: "2026-10-13T12:00:00", created_at: "2026-10-13T09:00:00Z", payment: "gotovina", items: [] };
  let st = { tx: [], receipts: [stanje, uplata, trosak] };
  assert.equal(balance(st.receipts, derive(st)).now, 183500);
  // izvod stigne dva dana kasnije, sa istom uplatom: i dalje 183.500
  st = { tx: [{ id: "b1", d: "2026-10-14", t: "UPLATA HRISTIJAN AKKA STUDIO", a: 100000 }], receipts: [stanje, uplata, trosak] };
  const L = derive(st);
  assert.equal(L.filter(e => e.amount > 0).length, 1);
  assert.equal(balance(st.receipts, L).now, 183500);
});

test("prolazni novac: primljen i poslat dalje ne menja Koliko imaš", async () => {
  const { derive, balance } = await import("../src/logic.js");
  const m = (id, cat, total, extra = {}) => ({ id, kind: "manual", cat, total, issued_at: "2026-10-12T12:00:00", created_at: "2026-10-12T10:0" + id + ":00Z", payment: "racun", items: [], person: "", ...extra });
  const stanje = { ...m("0", "stanje", 50000), created_at: "2026-10-12T09:00:00Z" };
  const akka = m("1", "priliv", 99297, { refund: true, merchant: "Akka Studio" });
  const ulaz = m("2", "prolazno", 12900, { refund: true, merchant: "TR Ogistea", person: "Hristijan" });
  const izlaz = m("3", "prolazno", 12900, { merchant: "Aleksa", person: "Hristijan" });
  const st = { tx: [], receipts: [stanje, akka, ulaz, izlaz] };
  assert.equal(balance(st.receipts, derive(st)).now, 149297);
  // ista uplata upisana kao priliv, a slanje kao prenos između mojih računa: stanje bude veće za 12.900
  const pogresno = { tx: [], receipts: [stanje, akka, { ...ulaz, cat: "priliv" }, { ...izlaz, cat: "interno" }] };
  assert.equal(balance(pogresno.receipts, derive(pogresno)).now, 149297 + 12900);
});
