import test from "node:test";
import assert from "node:assert/strict";
import { parseSpoken } from "../src/spoken.js";

test("uplata: ime, iznos sa razmakom, poznato ime", () => {
  const r = parseSpoken("Akka studio uplata 100 000", { incomeNames: ["Akka Studio", "Hristijan"] });
  assert.equal(r.income, true);
  assert.equal(r.desc, "Akka Studio");
  assert.equal(r.amount, 100000);
  const h = parseSpoken("Hristijan mi je uplatio sto hiljada dinara");
  assert.equal(h.income, true);
  assert.equal(h.desc, "Hristijan");
  assert.equal(h.amount, 100000);
  assert.equal(parseSpoken("stigla plata 150.000 na račun").amount, 150000);
});

test("pijaca sa artiklima, sa zarezima i bez", () => {
  for (const t of ["Pijaca, paradajz 230 dinara, krastavac 120, jaja 300.", "pijaca paradajz 230 krastavac 120 i jaja 300"]) {
    const r = parseSpoken(t);
    assert.equal(r.income, false, t);
    assert.equal(r.desc, "Pijaca", t);
    assert.deepEqual(r.items.map(i => [i.name, i.total]), [["Paradajz", 230], ["Krastavac", 120], ["Jaja", 300]], t);
    assert.equal(r.amount, 650, t);
    assert.equal(r.cat, "pijaca", t);
  }
});

test("količina na kilo i komad, rečima izgovoren broj", () => {
  const r = parseSpoken("pijaca paradajz 2 kila 360, jaja 10 komada dvesta pedeset");
  assert.deepEqual(r.items.map(i => [i.name, i.qty, i.total]), [["Paradajz /KG", 2, 360], ["Jaja", 10, 250]]);
  assert.equal(r.amount, 610);
});

test("jedan trošak bez mesta, gotovina, juče", () => {
  const r = parseSpoken("frizer 1500 gotovinom juče");
  assert.equal(r.desc, "Frizer");
  assert.equal(r.amount, 1500);
  assert.equal(r.items.length, 0);
  assert.equal(r.payment, "gotovina");
  assert.equal(r.dayOffset, -1);
  const k = parseSpoken("cigarete 520");
  assert.equal(k.cat, "cigarete");
  assert.equal(k.items.length, 1);
});

test("hiljade i decimale", () => {
  assert.equal(parseSpoken("uradi sam 2.400").amount, 2400);
  assert.equal(parseSpoken("uradi sam dve i po hiljade").amount, 2500);
  assert.equal(parseSpoken("uradi sam 2.400").cat, "kucaauto");
});
