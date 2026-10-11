// Čitanje fiskalnog računa iz teksta koji je prepoznala kamera (OCR).
// Tekst sa slike ima greške: slova umesto cifara, zarez umesto tačke, latinica pročitana kao ćirilica,
// spojeni ili razbijeni redovi. Zato se artikal prihvata samo kad se cena, količina i ukupno slažu
// (cena x količina = ukupno), oznake kao "Ukupan iznos" se traže približno, a sve ostalo
// korisnik proveri i ispravi pre čuvanja.
import { latin } from "./fiscal.js";

const strip = s => s.toUpperCase().replace(/[ČĆ]/g, "C").replace(/Š/g, "S").replace(/Ž/g, "Z").replace(/Đ/g, "D");
// velika latinica bez kvačica
const fold = s => strip(latin(s));
// ćirilica koja liči na latinicu (kad je latinični račun pročitan kao ćirilica): Ргедигесе -> PreguzeCe
const LOOK = { А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", Х: "X", У: "Y", Ј: "J", І: "I", Ѕ: "S",
  а: "a", в: "v", г: "r", д: "d", е: "e", и: "u", к: "k", м: "m", н: "n", о: "o", п: "n", р: "p", с: "c", т: "t", у: "y", х: "x", ј: "j", ь: "b", ѕ: "s" };
const looks = s => strip(latin(String(s).replace(/[А-яЈјІіЅѕ]/g, c => LOOK[c] ?? c)));

// i obrnuto: ćirilica pročitana kao latinica (Место продаје -> "MecTo nponaje")
const BACK = { c: "с", n: "п", p: "р", u: "и", y: "у", H: "Н", B: "В", "3": "З", "6": "б", m: "т", r: "г", e: "е", a: "а", o: "о", x: "х", k: "к", M: "М", K: "К", T: "Т", C: "С", P: "Р", A: "А", E: "Е", O: "О", X: "Х" };
const back = s => strip(latin(String(s).replace(/[A-Za-z36]/g, c => BACK[c] ?? c)));

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 4) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
// da li je oznaka reda (deo pre dvotačke) približno jedna od ključnih reči
function label(line) {
  const head = line.includes(":") ? line.slice(0, line.indexOf(":")) : line;
  return [fold(head), looks(head), back(head)].map(s => s.replace(/[^A-Z ]/g, "").replace(/\s+/g, " ").trim());
}
function isLabel(line, key, tol = Math.floor(key.length / 4)) {
  const k = key.replace(/\s+/g, "");
  return label(line).some(v => {
    const c = v.replace(/\s+/g, "");
    if (!c) return false;
    if (c.startsWith(k)) return true;
    return lev(c.slice(0, k.length + 1), k) <= tol || lev(c.slice(0, k.length), k) <= tol;
  });
}

// ćirilična i latinična slova koja OCR pročita umesto cifara
const DIGITISH = { O: "0", o: "0", О: "0", о: "0", D: "0", I: "1", l: "1", "|": "1", І: "1", З: "3", Б: "6", б: "6", B: "8", В: "8", S: "5", s: "5", Z: "2" };
function fixToken(t) {
  if (!/\d/.test(t)) return t;
  const digits = (t.match(/\d/g) || []).length;
  if (digits < Math.max(1, t.replace(/[.,\-]/g, "").length - 2)) return t;   // pretežno slova, nije broj
  return t.replace(/[^\d.,\-]/g, c => DIGITISH[c] ?? "");
}

// "1.160,00" "160.00" "16000" "1,236" -> broj, sa brojem decimala
export function ocrNum(t) {
  let s = String(t).replace(/\s/g, "");
  const neg = /^-/.test(s); s = s.replace(/^-/, "").replace(/[.,]+$/, "");
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const m = s.match(/^(.*?)([.,])(\d{1,3})$/);
  let v, dec = 0;
  // dve decimale su iznos; tri decimale su količina (30,300 l), osim "1.160" sa tačkom što su hiljade
  if (m && (m[3].length === 2 || (m[3].length === 3 && !/[.,]/.test(m[1]) && m[1].length <= 3 && (m[2] === "," || /^\d$/.test(m[1]))))) {
    v = parseFloat((m[1].replace(/[.,]/g, "") || "0") + "." + m[3]); dec = m[3].length;
  } else v = parseFloat(s.replace(/[.,]/g, ""));
  if (!isFinite(v)) return null;
  return { v: neg ? -v : v, dec };
}

const junk = t => /^[^\p{L}\d]+$/u.test(t) || /^\p{L}$/u.test(t);
// brojevi sa kraja reda (cena, količina, ukupno); smeće na kraju reda se preskače
function tailNumbers(line) {
  const fixed = line.replace(/(\d)([.,])\s+(\d{2})(?!\d)/g, "$1$2$3");      // "6.699, 40" -> "6.699,40"
  const toks = fixed.trim().split(/\s+/).map(fixToken);
  while (toks.length && junk(toks[toks.length - 1]) && !/\d/.test(toks[toks.length - 1])) toks.pop();
  const out = [];
  let i = toks.length - 1;
  while (i >= 0 && out.length < 4) {
    if (/^[^\p{L}\d]+$/u.test(toks[i])) { i--; continue; }      // tačka ili crtica između brojeva
    const n = ocrNum(toks[i]);
    if (!n) break;
    out.unshift(n); i--;
  }
  return { nums: out, text: toks.slice(0, i + 1).join(" ") };
}

const close = (a, b) => Math.abs(a - b) <= Math.max(0.06, Math.abs(b) * 0.004);
const near = (a, b) => Math.abs(a - b) <= Math.max(0.06, Math.abs(b) * 0.015);
// mogući iznosi: OCR ponekad izgubi decimalni zarez (45000 umesto 450,00)
const amountReads = n => n.dec === 2 ? [n.v] : [n.v / 100, n.v];
const qtyReads = n => n.dec ? [n.v] : [n.v, n.v / 1000];

function asItem(nums) {
  if (nums.length >= 3) {
    const [p, q, t] = nums.slice(-3);
    for (const pv of amountReads(p)) for (const qv of qtyReads(q)) for (const tv of amountReads(t))
      if (qv > 0 && tv !== 0 && close(pv * qv, tv)) return { price: pv, qty: qv, total: tv };
    // skoro se slaže: verovatno je jedna cifra pogrešno pročitana, artikal se označi za proveru
    for (const pv of amountReads(p)) for (const qv of qtyReads(q)) for (const tv of amountReads(t))
      if (qv > 0 && tv !== 0 && near(pv * qv, tv)) return { price: pv, qty: qv, total: tv, check: true };
  }
  if (nums.length >= 2) {
    // cena i ukupno isti, a količina 1 nije pročitana
    const [p, t] = nums.slice(-2);
    if (p.dec === 2 && t.dec === 2 && close(p.v, t.v)) return { price: p.v, qty: 1, total: t.v };
  }
  return null;
}

const SEP = /^[\s\-=_.,:*~—–|]{5,}$/;

function cleanName(s) {
  const toks = latin(s).replace(/[|]/g, " ").trim().split(/\s+/);
  // sa kraja skini oznaku poreske stope "(Ђ)" i sitno smeće
  while (toks.length > 1 && (junk(toks[toks.length - 1]) || /^[([{].{0,2}[)\]}]?$/.test(toks[toks.length - 1]))) toks.pop();
  while (toks.length > 1 && junk(toks[0])) toks.shift();
  return toks.join(" ").replace(/\s+/g, " ").trim();
}

const PAYS = [
  ["GOTOVINA", "gotovina"], ["PLATNA KARTICA", "kartica"], ["PRENOS NA RACUN", "racun"],
  ["INSTANT PLACANJE", "racun"], ["VAUCER", "kartica"], ["DRUGO BEZGOTOVINSKO", "kartica"],
];

export function parseOcrText(raw) {
  const lines = String(raw || "").replace(/\r/g, "").split("\n").map(l => l.replace(/[|¦]/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
  const F = lines.map(fold);
  const after = i => latin(lines[i].split(":").slice(1).join(":")).replace(/^[^\p{L}\d]+|[^\p{L}\d.)]+$/gu, "").trim();
  const find = (key, tol) => lines.findIndex(l => isLabel(l, key, tol));

  const out = { merchant: "", store: "", issuedAt: null, total: NaN, totalFound: false, payment: null, refund: false, sale: true, items: [], pfr: "" };
  let k = find("PREDUZECE"); if (k >= 0) out.merchant = after(k);
  k = find("MESTO PRODAJE"); if (k >= 0) out.store = after(k);

  // datum i vreme, prvo iz reda "PFR vreme"
  const dre = /(\d{1,2})[.,](\d{1,2})[.,]\s?(\d{4})\.?\s*(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?/;
  const okDate = l => { const m = l.replace(/[OОoо]/g, "0").match(dre); return m && +m[1] >= 1 && +m[1] <= 31 && +m[2] >= 1 && +m[2] <= 12 && +m[4] < 24 && +m[3] > 2020 ? m : null; };
  k = find("PFR VREME");
  const dm = (k >= 0 && okDate(lines[k])) || lines.map(okDate).find(Boolean);
  if (dm) out.issuedAt = `${dm[3]}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}T${dm[4].padStart(2, "0")}:${dm[5]}:${dm[6] || "00"}`;
  k = find("PFR BROJ RACUNA", 4); if (k >= 0) out.pfr = after(k).replace(/\s/g, "");

  const kind = F.find(l => /PROMET|PREDRA|KOPIJA|OBUKA|REFUND/.test(l)) || "";
  out.refund = /REFUND/.test(kind);
  out.sale = !/PREDRA|KOPIJA|OBUKA/.test(kind);

  // ukupan iznos (ne "Ukupan iznos poreza")
  const totIdx = lines.findIndex(l => isLabel(l, "UKUPAN IZNOS", 3) && !/POREZ|PDV/.test(fold(l)) && !/POREZ/.test(looks(l)));
  if (totIdx >= 0) {
    for (const j of [totIdx, totIdx + 1]) {
      const n = lines[j] && tailNumbers(lines[j]).nums.pop();
      if (n) { out.total = Math.abs(n.dec === 2 ? n.v : n.dec ? n.v : n.v / 100); out.totalFound = true; break; }
    }
    const pays = {};
    for (let j = totIdx + 1; j < Math.min(lines.length, totIdx + 8); j++) {
      if (isLabel(lines[j], "POVRACAJ") || isLabel(lines[j], "OZNAKA")) break;
      const hit = PAYS.find(([key]) => isLabel(lines[j], key, 3));
      if (!hit) continue;
      const n = tailNumbers(lines[j]).nums.pop();
      pays[hit[1]] = (pays[hit[1]] || 0) + (n ? Math.abs(n.v) : 0.01);
    }
    const best = Object.entries(pays).sort((a, b) => b[1] - a[1])[0];
    out.payment = best ? best[0] : null;
  }

  // artikli: posle zaglavlja "Naziv Cena Kol. Ukupno" (ili "Artikli"), do ukupnog iznosa
  const HEAD = ["NAZIV", "CENA", "KOL", "UKUPNO"];
  let start = lines.findIndex((l, i) => (totIdx < 0 || i < totIdx) && HEAD.filter(w => fold(l).includes(w) || looks(l).includes(w)).length >= 2);
  if (start < 0) start = lines.findIndex(l => isLabel(l, "ARTIKLI", 2));
  const end = totIdx > start ? totIdx : lines.length;
  let name = [];
  for (let i = start + 1; i < end; i++) {
    const line = lines[i];
    if (SEP.test(line)) { name = []; continue; }
    const { nums, text } = tailNumbers(line);
    const it = asItem(nums);
    if (it) {
      const nm = cleanName([...name, text].filter(Boolean).join(" "));
      out.items.push({ name: nm || "Artikal", price: it.price, qty: it.qty, total: out.refund ? -Math.abs(it.total) : it.total, ...(it.check ? { check: true } : {}) });
      name = [];
    } else if (start >= 0 || !line.includes(":")) {
      // red bez ispravnih brojeva: naziv sledećeg artikla (najviše dva reda)
      if (nums.length >= 2 || (nums.length && !/\p{L}{2}/u.test(text))) { name = []; continue; }   // brojevi koji nisu artikal
      name.push(line); if (name.length > 2) name.shift();
    }
  }
  const sum = out.items.reduce((s, i) => s + Math.abs(i.total), 0);
  if (!out.totalFound && sum > 0) out.total = Math.round(sum * 100) / 100;
  return out;
}

// koliko je čitanje dobro: zbir artikala se slaže sa ukupnim iznosom, ima artikala, datuma, iznosa
export function scoreParse(r) {
  const sum = r.items.reduce((s, i) => s + Math.abs(i.total), 0);
  let sc = r.items.length;
  if (r.totalFound) sc += 3;
  if (r.totalFound && r.items.length && close(sum, r.total)) sc += 20;
  if (r.issuedAt) sc += 2;
  if (r.merchant || r.store) sc += 1;
  if (r.payment) sc += 1;
  return sc;
}
