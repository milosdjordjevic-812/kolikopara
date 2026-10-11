import test from "node:test";
import assert from "node:assert/strict";
import { parseJournal, parseIps, extractJournal, num, latin } from "../src/shared/fiscal.js";

const CYR_TWO_LINE = `============ ФИСКАЛНИ РАЧУН ============
ПИБ:                           104052135
Предузеће:            MOL Serbia d.o.o.
Место продаје:      MOL SES Mirijevo
Адреса:              Mirijevski bulevar 1
Општина:                         Звездара
Касир:                              Ана
ЕСИР број:                       123/2.0
-------------ПРОМЕТ ПРОДАЈА-------------
Артикли
========================================
Назив   Цена         Кол.         Укупно
Marlboro Gold KS 20/ 1 (Ђ)
            580,00          2      1.160,00
Espresso (Ђ)
            170,00          1        170,00
EVRO DIZEL (Ђ)
            205,50     20,000      4.110,00
----------------------------------------
Укупан износ:                    5.440,00
Готовина:                        6.000,00
Повраћај:                          560,00
========================================
Ознака       Име      Стопа        Порез
Ђ           О-ПДВ   20,00%        906,67
----------------------------------------
Укупан износ пореза:               906,67
========================================
ПФР време:          11.10.2026. 12:34:56
ПФР број рачуна:   ABCD1234-ABCD1234-1234
Бројач рачуна:             1234/5678ПП
========================================
======== КРАЈ ФИСКАЛНОГ РАЧУНА =========`;

const LAT_ONE_LINE = `============ FISKALNI RAČUN ============
Preduzeće:            Kafe Bar Doo
Mesto prodaje:        Kafe-Kafe BGD
-------------PROMET PRODAJA-------------
Artikli
========================================
Naziv   Cena         Kol.         Ukupno
Kafa sa mlekom (Đ)  240,00  2  480,00
Kisela voda (Đ)  200,00  1  200,00
----------------------------------------
Ukupan iznos:                      680,00
Platna kartica:                    680,00
========================================
PFR vreme:          08.10.2026. 9:05:01
======== KRAJ FISKALNOG RAČUNA =========`;

test("num", () => {
  assert.equal(num("1.160,00"), 1160);
  assert.equal(num("20,000"), 20);
  assert.equal(num("-35,50"), -35.5);
});

test("cirilični račun sa dve linije po artiklu, gotovina sa kusurom", () => {
  const r = parseJournal(CYR_TWO_LINE);
  assert.equal(r.merchant, "MOL Serbia d.o.o.");
  assert.equal(r.store, "MOL SES Mirijevo");
  assert.equal(r.issuedAt, "2026-10-11T12:34:56");
  assert.equal(r.total, 5440);
  assert.equal(r.payment, "gotovina");
  assert.equal(r.payments.gotovina, 5440);
  assert.equal(r.sale, true);
  assert.equal(r.refund, false);
  assert.deepEqual(r.items.map(i => [i.name, i.qty, i.total]), [
    ["Marlboro Gold KS 20/ 1", 2, 1160],
    ["Espresso", 1, 170],
    ["EVRO DIZEL", 20, 4110],
  ]);
  const sum = r.items.reduce((s, i) => s + i.total, 0);
  assert.equal(sum, r.total);
});

test("latinični račun, artikal u jednoj liniji, kartica", () => {
  const r = parseJournal(LAT_ONE_LINE);
  assert.equal(r.payment, "kartica");
  assert.equal(r.issuedAt, "2026-10-08T09:05:01");
  assert.deepEqual(r.items.map(i => [i.name, i.total]), [["Kafa sa mlekom", 480], ["Kisela voda", 200]]);
});

test("izvlačenje računa iz HTML-a", () => {
  const html = `<html><body><div><pre style="x">${CYR_TWO_LINE.replace(/&/g,"&amp;")}</pre></div></body></html>`;
  const j = extractJournal(html);
  assert.ok(j.includes("Укупан износ"));
  assert.equal(parseJournal(j).total, 5440);
});

test("IPS uplatnica", () => {
  const q = "K:PR|V:01|C:1|R:840000000000123456|N:JKP INFOSTAN TEHNOLOGIJE\r\nBEOGRAD|I:RSD8423,17|P:MILOS DJORDJEVIC|SF:189|S:RACUN ZA SEPTEMBAR|RO:97123";
  const p = parseIps(q);
  assert.equal(p.amount, 8423.17);
  assert.equal(p.name, "JKP INFOSTAN TEHNOLOGIJE, BEOGRAD");
  assert.equal(p.purpose, "RACUN ZA SEPTEMBAR");
  assert.equal(parseIps("https://example.com"), null);
});

test("latinica", () => assert.equal(latin("Ђорђевић"), "Đorđević"));
