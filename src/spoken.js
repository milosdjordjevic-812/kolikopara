// Izgovoren ili napisan unos u jednoj rečenici: "Akka studio uplata 100 000", "pijaca paradajz 230 krastavac 120".
// Bez DOM-a, da može da se testira. Vraća predlog koji korisnik proveri pre čuvanja.
import { merchantCat, upper } from "./logic.js";
import { itemGroup } from "./items.js";

const UNITS = { nula: 0, jedan: 1, jedna: 1, jedno: 1, dva: 2, dve: 2, dvije: 2, tri: 3, cetiri: 4, pet: 5, sest: 6, sedam: 7, osam: 8, devet: 9,
  deset: 10, jedanaest: 11, dvanaest: 12, trinaest: 13, cetrnaest: 14, petnaest: 15, sesnaest: 16, sedamnaest: 17, osamnaest: 18, devetnaest: 19,
  dvadeset: 20, trideset: 30, cetrdeset: 40, pedeset: 50, sezdeset: 60, sedamdeset: 70, osamdeset: 80, devedeset: 90,
  sto: 100, stotinu: 100, dvesta: 200, dvjesto: 200, dvesto: 200, trista: 300, tristo: 300, cetiristo: 400, petsto: 500, sesto: 600, sedamsto: 700, osamsto: 800, devetsto: 900 };
const BIG = { hiljada: 1000, hiljadu: 1000, hiljade: 1000, tisuca: 1000, tisucu: 1000, tisuce: 1000, hiljadarki: 1000, soma: 1000, milion: 1e6, miliona: 1e6, milijun: 1e6 };
const QTY = /^(kila|kile|kilo|kg|kilograma|kilogram|komada|komad|kom|kesa|kese|litra|litar|litre|l|paklice|paklica|pakle|pakla)$/;
const FILL = new Set(["prolazno", "prolazna", "prolazni", "dinara", "dinar", "din", "rsd", "dinare", "potrosio", "potrosila", "kupio", "kupila", "kupili", "platio", "platila", "dao", "dala", "sam", "smo", "je", "mi", "danas", "juce", "jucer", "prekjuce",
  "gotovinom", "gotovina", "kes", "kesom", "cash", "karticom", "kartica", "na", "ruke", "racun", "racuna", "uplata", "uplate", "uplatio", "uplatila", "uplatili", "priliv", "stiglo", "stigla", "stigao", "leglo", "legla", "legao",
  "dobio", "dobila", "od", "za", "u", "iznos", "ukupno", "to", "ovo", "evo", "i", "a", "plus", "pa"]);

// latinica bez kvačica, mala slova: "Čevapi" -> "cevapi"; ćirilica ide kroz upper()
const plain = s => upper(s).toLowerCase().replace(/č|ć/g, "c").replace(/š/g, "s").replace(/ž/g, "z").replace(/đ/g, "dj");

// "100 000" i "100.000" -> 100000, "1,5" -> 1.5, "sto hiljada" -> 100000, "dve i po hiljade" -> 2500
function numbers(t) {
  t = t.replace(/(\d)[.,](\d{3})(?!\d)/g, "$1$2").replace(/(\d)[.,](\d{3})(?!\d)/g, "$1$2");
  t = t.replace(/\b(\d{1,3})\s(\d{3})\b(?!\s*(kila|kile|kg|kom))/g, "$1$2");
  t = t.replace(/(\d),(\d)/g, "$1.$2");
  const toks = t.split(/\s+/), out = [];
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i];
    if (w in UNITS || w in BIG || (/^\d+(\.\d+)?$/.test(w) && BIG[toks[i + 1]])) {
      let total = 0, cur = 0, j = i, any = false;
      for (; j < toks.length; j++) {
        const x = toks[j];
        if (/^\d+(\.\d+)?$/.test(x) && !any) { cur += parseFloat(x); any = true; continue; }
        if (x in UNITS) { cur += UNITS[x]; any = true; continue; }
        if (x === "i" && toks[j + 1] === "po") { cur += 0.5; j++; continue; }
        if (x === "i" && (toks[j + 1] in UNITS) && any) continue;
        if (x in BIG) { total += (cur || 1) * BIG[x]; cur = 0; any = true; continue; }
        break;
      }
      out.push(String(total + cur)); i = j - 1; continue;
    }
    out.push(w);
  }
  return out.join(" ");
}

const cap = s => { s = String(s || "").replace(/_/g, " "); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };
const isNum = w => /^\d+(\.\d+)?$/.test(w);

export function parseSpoken(text, { incomeNames = [], rules = [] } = {}) {
  const raw = String(text || "").trim();
  const low = plain(raw).replace(/\buradi sam\b/g, "uradi_sam");
  const res = { text: raw, income: false, desc: "", amount: null, items: [], payment: null, dayOffset: 0, cat: null };
  if (!low) return res;

  res.pass = /\bprolazn/.test(low);
  if (/\bprekjuce\b/.test(low)) res.dayOffset = -2; else if (/\bjuce(r)?\b/.test(low)) res.dayOffset = -1;
  if (/\b(gotovin\w*|kes\w*|cash|na ruke)\b/.test(low)) res.payment = "gotovina";
  else if (/\bkartic\w*/.test(low)) res.payment = "kartica";
  res.income = /\b(uplat[ae]|priliv|honorar|plata|stigl[aoi]|legl[aoi]|stigao|legao)\b|\buplati(o|la|li) mi\b|\bmi je uplati(o|la|li)\b|\b(dobio|dobila) sam\b|\bvrati(o|la) mi\b/.test(low);
  if (res.income && res.payment === "kartica") res.payment = null;
  if (res.income && !res.payment && /\bna racun\b/.test(low)) res.payment = "racun";

  // reči i brojevi; zarez i tačka odvajaju delove ("pijaca, paradajz 230")
  const toks = numbers(low.replace(/[;:!?]/g, ",").replace(/\.(?!\d)/g, ",").replace(/,/g, " , ")).split(/\s+/).filter(Boolean);

  if (res.income) {
    const nums = toks.filter(isNum).map(Number);
    res.amount = nums.length ? Math.max(...nums) : null;
    const name = toks.filter(w => !isNum(w) && w !== "," && !FILL.has(w)).join(" ").trim();
    const hit = incomeNames.find(n => plain(n) === name) || incomeNames.find(n => name && (plain(n).startsWith(name) || name.startsWith(plain(n))));
    res.desc = hit || cap(name);
    return res;
  }

  // trošak: niz "naziv [količina jedinica] iznos"
  let words = [], place = "", qty = null, pendingQty = null;
  const items = [];
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i];
    if (w === ",") { if (!items.length && words.length && !place) { place = words.join(" "); words = []; } continue; }
    if (isNum(w)) {
      const next = toks[i + 1];
      if (next && QTY.test(next)) { pendingQty = { q: Number(w), u: next }; i++; continue; }
      if (next && isNum(next) && words.length) { pendingQty = { q: Number(w), u: "kom" }; continue; }
      const name = words.join(" ").trim();
      if (!name && items.length && pendingQty === null) { items[items.length - 1].total += Number(w); continue; }
      items.push({ name, total: Number(w), qty: pendingQty ? pendingQty.q : 1, kg: pendingQty ? /^(kil|kg)/.test(pendingQty.u) : false });
      words = []; pendingQty = null; continue;
    }
    if (FILL.has(w)) continue;
    words.push(w);
  }
  const tail = words.join(" ").trim();
  // "paradajz 230 pijaca" ili samo "pijaca" bez broja
  if (tail && !place) place = tail;

  // prva reč prvog artikla može biti mesto: "pijaca paradajz 230"
  if (!place && items.length) {
    const w = items[0].name.split(" ");
    if (w.length > 1 && isPlace(w[0], rules)) { place = w[0]; items[0].name = w.slice(1).join(" "); }
  }

  const named = items.filter(it => it.name);
  if (!place && named.length === 1 && items.length === 1) {
    res.desc = cap(named[0].name); res.amount = named[0].total;
    if (itemGroup(named[0].name).id !== "ostalo") res.items = [toItem(named[0])];
  } else {
    res.desc = cap(place || (named[0] ? named[0].name : ""));
    res.items = named.map(toItem);
    const sum = items.reduce((s, it) => s + it.total, 0);
    res.amount = sum ? Math.round(sum * 100) / 100 : null;
  }
  res.cat = guessCat(res, rules);
  return res;
}

const PLACES = /^(pijac[aiu]?|pekar[aiu]?|trafik[aiu]?|piljar\w*|mesar[aiu]?|market\w*|prodavnic\w*|kafic\w*|kiosk\w*|apotek\w*|pumpa|pumpi|frizer\w*|dragstor\w*|butik\w*|radnj\w*)$/;
const isPlace = (w, rules) => PLACES.test(w) || merchantCat(rules, w, -1).cat !== "nerazvrstano";

function toItem(it) {
  const name = cap(it.name) + (it.kg ? " /KG" : "");
  const qty = it.qty || 1;
  return { name, qty, price: Math.round(it.total / qty * 100) / 100, total: it.total };
}

const FOOD = new Set(["voce", "meso", "mlecni", "pekara", "namirnice", "pice", "slatkisi"]);
export function guessCat(r, rules = []) {
  if (r.income) return "priliv";
  const d = plain(r.desc);
  if (/^pijac/.test(d)) return "pijaca";
  if (/^pekar/.test(d)) return "pekara";
  if (/^(piljar|mesar)/.test(d)) return "market";
  if (/^trafik/.test(d)) return r.items.length && r.items.every(i => itemGroup(i.name).id === "cigarete") ? "cigarete" : "kupovina";
  if (/^(kafic|kafa)/.test(d)) return "izlasci";
  if (/^frizer/.test(d)) return "zasebe";
  const m = merchantCat(rules, r.desc, -1).cat;
  if (m !== "nerazvrstano") return m;
  if (r.items.length && r.items.every(i => FOOD.has(itemGroup(i.name).id))) return "market";
  const g = r.items.length <= 1 && r.desc ? itemGroup(r.desc).id : null;
  if (g === "cigarete" || g === "alkohol" || g === "gorivo" || g === "hemija") return g;
  if (g && FOOD.has(g)) return "market";
  return null;
}
