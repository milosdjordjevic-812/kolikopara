import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseOcrText, scoreParse, ocrNum } from "../src/shared/ocr-parse.js";

// tekst koji je Tesseract stvarno pročitao sa namerno loših slika izmišljenih računa (tests/ocr/*.txt)
const read = f => fs.readFileSync(new URL("./ocr/" + f, import.meta.url), "utf8");
const sum = r => Math.round(r.items.reduce((s, i) => s + i.total, 0) * 100) / 100;

test("ocrNum: zarez, tačka, hiljade, količina", () => {
  assert.equal(ocrNum("1.895,03").v, 1895.03);
  assert.equal(ocrNum("7.000.00").v, 7000);
  assert.equal(ocrNum("1,236").v, 1.236);
  assert.equal(ocrNum("30,300").v, 30.3);
  assert.equal(ocrNum("2").v, 2);
  assert.equal(ocrNum("abc"), null);
});

test("ćirilični račun sa nakrivljene, mutne slike", () => {
  const r = parseOcrText(read("ocr-cyr.txt"));
  assert.equal(r.merchant, "DELHAIZE SERBIA");
  assert.equal(r.store, "MAXI 451 Mirijevo");
  assert.equal(r.issuedAt, "2026-10-11T18:42:07");
  assert.equal(r.total, 1895.03);
  assert.equal(r.payment, "kartica");
  assert.equal(r.items.length, 6);
  assert.equal(sum(r), 1895.03);
  assert.deepEqual(r.items.find(i => /BANANE/.test(i.name)), { name: "BANANE /KG", price: 169.99, qty: 1.236, total: 210.11 });
  assert.ok(r.items.some(i => /CIGARETE MARLBORO/.test(i.name) && i.total === 960));
  assert.ok(scoreParse(r) >= 20);
});

test("izbledeo račun: Место продаје pročitano kao latinica, tačka između brojeva", () => {
  const r = parseOcrText(read("ocr-cyr-faded.txt"));
  assert.equal(r.store, "MAXI 451 Mirijevo");
  assert.equal(r.items.length, 6);
  assert.equal(sum(r), r.total);
});

test("latinični račun: gorivo na litar, gotovina, razbijen iznos 6.699, 40", () => {
  const r = parseOcrText(read("ocr-lat.txt"));
  assert.equal(r.total, 6699.4);
  assert.equal(r.payment, "gotovina");
  assert.deepEqual(r.items.map(i => [i.name, i.qty, i.total]), [["EVRO DIZEL", 30.3, 5999.4], ["Kafa espresso", 1, 180], ["Cigarete Davidoff Gold", 1, 520]]);
});

test("artikal se prihvata samo kad cena x količina = ukupno", () => {
  const r = parseOcrText(`Naziv Cena Kol. Ukupno
Hleb (E)
79,99 2 159,98
Telefon 0641234567 2026 1
Mleko (E)
149,99 1 149,99
Ukupan iznos: 309,97
Gotovina: 500,00`);
  assert.deepEqual(r.items.map(i => i.name), ["Hleb", "Mleko"]);
  assert.equal(r.total, 309.97);
  assert.equal(r.payment, "gotovina");
});

test("skoro tačan iznos artikla se označi za proveru", () => {
  const r = parseOcrText(`Naziv Cena Kol. Ukupno
Cigarete (Đ)
480,00 2 966,00
Ukupan iznos: 966,00`);
  assert.equal(r.items[0].check, true);
});
