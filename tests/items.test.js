import test from "node:test";
import assert from "node:assert/strict";
import { itemGroup, basket, amountText } from "../src/items.js";
import { CATS, merchantCat, itemCat } from "../src/logic.js";

const rc = (d, store, items) => ({ d, name: store, receipt: { store, items } });

test("artikal ide u svoju grupu, ne u grupu radnje", () => {
  assert.equal(itemGroup("DAVIDOFF GOLD SLIMS /KOM").id, "cigarete");
  assert.equal(itemGroup("PIVO JELEN 0,5L LIM").id, "alkohol");
  assert.equal(itemGroup("ARIEL DETERDZENT 2,2KG").id, "hemija");
  assert.equal(itemGroup("TECNI SAPUN MED MLEKO").id, "higijena");
  assert.equal(itemGroup("MILKA COKOLADA 100G").id, "slatkisi");
  assert.equal(itemGroup("BANANE /KG").id, "voce");
  assert.equal(itemGroup("EVRO DIZEL").id, "gorivo");
  assert.equal(itemGroup("SRAF M6 INOX").id, "kucaauto");
  assert.equal(itemGroup("ROTOR 3000").id, "ostalo");
});

test("cigarete iz Maxija i Univerexporta se sabiraju zajedno", () => {
  const bk = basket([
    rc("2026-10-02", "Maxi", [{ name: "CIGARETE MARLBORO GOLD /KOM", qty: 2, total: 960 }, { name: "MLEKO 2,8% 1L", qty: 1, total: 149.99 }, { name: "BANANE /KG", qty: 1.236, total: 210.11 }]),
    rc("2026-10-05", "Univerexport", [{ name: "DAVIDOFF GOLD SLIMS", qty: 1, total: 520 }, { name: "PIVO JELEN 0,5L", qty: 3, total: 330 }]),
    { d: "2026-10-06", name: "Banka", receipt: null },
  ]);
  const cig = bk.find(g => g.id === "cigarete");
  assert.equal(cig.pieces, 3);
  assert.equal(cig.sum, 1480);
  assert.equal(amountText(cig), "3 paklice");
  assert.deepEqual(cig.items.map(i => i.stores), [["Maxi"], ["Univerexport"]]);
  assert.equal(amountText(bk.find(g => g.id === "voce")), "1,24 kg");
  assert.equal(amountText(bk.find(g => g.id === "alkohol")), "3 kom");
  assert.equal(bk[0].id, "cigarete");
});

test("isti artikal sa više računa se spaja po imenu", () => {
  const bk = basket([
    rc("2026-10-01", "Maxi", [{ name: "SNICKERS 50G /KOM", qty: 1, total: 99 }]),
    rc("2026-10-09", "Lidl", [{ name: "Snickers 50g", qty: 2, total: 190 }]),
  ]);
  const s = bk.find(g => g.id === "slatkisi");
  assert.equal(s.items.length, 1);
  assert.equal(s.items[0].pieces, 3);
  assert.equal(s.items[0].last, "2026-10-09");
  assert.deepEqual(s.items[0].stores, ["Maxi", "Lidl"]);
});

test("nove kategorije postoje i uradi sam radnja ide u njih", () => {
  assert.ok(CATS.some(c => c.id === "kucaauto"));
  assert.ok(CATS.some(c => c.id === "hemija"));
  assert.equal(merchantCat([], "URADI SAM DOO NIS", -2400).cat, "kucaauto");
  assert.equal(merchantCat([], "BAUHAUS BEOGRAD", -5100).cat, "kucaauto");
  assert.equal(itemCat([], "ARIEL DETERDZENT 2,2KG").cat, "hemija");
});

test("amountText: jedna paklica, pet paklica, 21 paklica, litri goriva", () => {
  const c = { id: "cigarete", unit: ["paklica", "paklice", "paklica"] };
  assert.equal(amountText({ ...c, pieces: 1, weight: 0 }), "1 paklica");
  assert.equal(amountText({ ...c, pieces: 5, weight: 0 }), "5 paklica");
  assert.equal(amountText({ ...c, pieces: 21, weight: 0 }), "21 paklica");
  assert.equal(amountText({ id: "gorivo", unit: ["litar", "litra", "litara"], pieces: 0, weight: 31.5 }), "31,5 litara");
});

test("uradi sam: materijal za kuću i auto, šifra artikla se skida, prodajno mesto kao šifra", () => {
  const items = ["426742 BATERIJA ZA SUDOPERU DOMI", "405020 CISTAC STAKLA 60cm", "425313 BRISAC STAKLA 20CM AB3260", "429534 KUKICE METALNE 3M CRNE T", "404691 RUKAVICE ZA DOMACINSTVO D", "DRZAC ZA TOALET PAPIR"];
  for (const n of items) assert.equal(itemGroup(n).id, "kucaauto", n);
  assert.equal(itemGroup("ROTOR 3000", [], "kucaauto").id, "kucaauto");
  const bk = basket([{ d: "2026-10-12", name: "P200", cat: "kucaauto", receipt: { store: "P200", merchant: "URADI SAM DOO", items: [{ name: "426742 BATERIJA ZA SUDOPERU DOMI", qty: 1, total: 5299 }, { name: "ROTOR 3000", qty: 1, total: 100 }] } }]);
  assert.equal(bk.length, 1);
  assert.equal(bk[0].id, "kucaauto");
  assert.equal(bk[0].items[0].name, "BATERIJA ZA SUDOPERU DOMI");
  assert.deepEqual(bk[0].items[0].stores, ["URADI SAM DOO"]);
});

test("pravilo za artikal određuje grupu", () => {
  const rules = [{ kind: "item", match: "ROTOR", cat: "kucaauto" }];
  assert.equal(itemGroup("ROTOR 3000", rules).id, "kucaauto");
});

test("artikli sa pravih računa: vino, pivo, toalet papir, piletina; kafić je izlazak", () => {
  assert.equal(itemGroup("Z.Bogdan 8 tamburasa 0.75l").id, "alkohol");
  assert.equal(itemGroup("Birra Morreti 0.5l CAN").id, "alkohol");
  assert.equal(itemGroup("T.papir Maxi 10 1 3sl").id, "higijena");
  assert.equal(itemGroup("Pil.grudi mini Neoplanta 330g").id, "meso");
  assert.equal(itemGroup("Aleksic Zuti Cvet 0,187", [], "izlasci").id, "izlasci");
  assert.equal(itemGroup("Madri 0.5", [], "izlasci").id, "izlasci");
  assert.equal(itemGroup("MARLBORO GOLD", [], "izlasci").id, "cigarete");
  assert.equal(itemGroup("BREF WC GEL").id, "hemija");
});
