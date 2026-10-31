// Plan meseca: koliko stiže, šta je fiksno, šta ide u koverte i fond za veće stvari,
// i koliko ostaje za život, podeljeno po nedeljama. Bez DOM-a, da može da se testira.
//
// Nedelja je od ponedeljka do nedelje. Prekoračenje jedne nedelje smanjuje sledeću za toliko
// (i tako dalje, dok se ne izravna). Ono što ostane od nedelje ne prenosi se: to ide u kovertu.
import { CAT, totals } from "./logic.js";
import { dailySpend, dnum, dstr } from "./stats.js";

const r2 = n => Math.round(n * 100) / 100;
const sum = (a, f = x => x.amount) => r2((a || []).reduce((s, x) => s + (Number(f(x)) || 0), 0));
const DAY = 864e5;
export const WEEKS_PER_MONTH = 365.25 / 12 / 7;
const nextYm = ym => { const [y, m] = ym.split("-").map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; };
const monday = n => n - ((new Date(n * DAY).getUTCDay() + 6) % 7);

// fiksni troškovi i fond za veće stvari se plaćaju sa strane, ne iz nedeljnog iznosa
export const FIXED_DEFAULT = [
  { name: "Porez za firmu", cats: ["porez"] },
  { name: "Računi", cats: ["racuni"] },
  { name: "Terapija", cats: ["terapija"] },
  { name: "Pretplate", cats: ["pretplate"] },
];
// za sada jedna koverta (štednja); može ih biti više kasnije (npr. putovanja, crni dani)
export const ENVELOPES = [{ id: "stednja", name: "Štednja" }];
export const BIG_CATS = ["kucaauto", "lekar"];

/*
 * Stalne uplate važe svakog meseca. Uplate (i umanjenja) "samo ovog meseca" imaju month: "YYYY-MM"
 * i važe samo tada, od svog dana do kraja meseca. Za jedan mesec može da se preskoči štednja ili fond (skip).
 * Bez ym: brojevi stalnog plana. Sa ym: brojevi tog meseca.
 */
const dim = ym => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const extrasOf = (cfg, ym) => (cfg.incomes || []).filter(x => x.month && x.month === ym);
const skipOf = (cfg, ym) => (ym && cfg.skip && cfg.skip[ym]) || {};
export function planNumbers(cfg, ym = null) {
  const reg = sum((cfg.incomes || []).filter(x => !x.month)), fixed = sum(cfg.fixed);
  const save0 = sum(cfg.save), big0 = Number(cfg.big?.amount) || 0, sk = skipOf(cfg, ym);
  const extra = ym ? sum(extrasOf(cfg, ym)) : 0;
  const save = sk.save ? 0 : save0, big = sk.big ? 0 : big0;
  const base = r2(reg - fixed - save0 - big0), life = r2(reg + extra - fixed - save - big);
  return { inc: r2(reg + extra), reg, extra, fixed, save, big, save0, big0, base, life, week: Math.round(base / WEEKS_PER_MONTH), day: Math.round(base * 12 / 365.25), monthWeek: ym ? Math.round(life / dim(ym) * 7) : Math.round(base / WEEKS_PER_MONTH) };
}
// koliko se sme jednog dana: stalni plan (isto svaki dan), plus ono što je ovog meseca drugačije
export function dayAllowance(cfg, d) {
  const ym = d.slice(0, 7), D = dim(ym), N = planNumbers(cfg, ym), dom = +d.slice(8, 10);
  let a = N.base * 12 / 365.25 + (N.save0 - N.save + N.big0 - N.big) / D;
  for (const x of extrasOf(cfg, ym)) { const from = Math.min(D, Number(x.day) || D); if (dom >= from) a += Number(x.amount) / (D - from + 1); }
  return a;
}

// kategorije koje se ne broje u nedeljni iznos
export const outsideCats = cfg => new Set([...(cfg.fixed || []).flatMap(f => f.cats || []), ...(cfg.big?.cats || BIG_CATS)]);

/*
 * Nedelja u kojoj je danas: koliko je bilo na raspolaganju, koliko je potrošeno, koliko još ima
 * i koliko je to po danu do kraja nedelje. Prva nedelja plana se računa od dana kad je plan napravljen.
 */
// Gotovina stavljena u kovertu nije potrošena, ali samo ako je podignuta iste nedelje:
// inače bi uplata u kovertu (iz ranije podignutog novca) povećala nedeljni iznos.
export function weekPlan(cfg, list, today) {
  const N = planNumbers(cfg, today.slice(0, 7));
  const allow = (a, b) => { let x = 0; for (let n = a; n <= b; n++) x += dayAllowance(cfg, dstr(n)); return Math.round(x); };
  const noSave = list.map(e => (e.parts.some(p => p.cat === "stednja") ? { ...e, parts: e.parts.filter(p => p.cat !== "stednja") } : e));
  const daily = dailySpend(noSave, outsideCats(cfg));
  const dep = {}, wd = {};
  for (const e of list) for (const p of e.parts) {
    if (p.cat === "stednja" && p.amount < 0) dep[e.d] = (dep[e.d] || 0) - p.amount;
    if (p.cat === "gotovina" && p.amount < 0) wd[e.d] = (wd[e.d] || 0) - p.amount;
  }
  const spentIn = (a, b) => {
    let s = 0, D = 0, Wd = 0;
    for (let n = a; n <= b; n++) { const k = dstr(n); s += daily[k] || 0; D += dep[k] || 0; Wd += wd[k] || 0; }
    return r2(s - Math.min(D, Wd));
  };
  const t = dnum(today), s = Math.min(dnum(cfg.start || today), t), wT = monday(t);
  let carry = 0, last = null;
  for (let w = monday(s); w < wT; w += 7) {
    const from = Math.max(w, s), avail = r2(allow(from, w + 6) + carry), spent = spentIn(from, w + 6);
    last = { from: dstr(from), to: dstr(w + 6), avail, spent, left: r2(avail - spent) };
    carry = Math.min(0, last.left);
  }
  const from = Math.max(wT, s), avail = r2(allow(from, wT + 6) + carry), spent = spentIn(from, t);
  const spentToday = Math.max(0, spentIn(t, t)), daysLeft = wT + 6 - t + 1, left = r2(avail - spent);
  const perDay = r2((left + spentToday) / daysLeft);
  // na šta je otišlo ove nedelje
  const T = totals(list.filter(e => e.d >= dstr(from) && e.d <= today), outsideCats(cfg));
  const cats = Object.entries(T.by).filter(([id, v]) => CAT[id]?.kind === "spend" && v.sum < -0.004).map(([id, v]) => ({ id, sum: -v.sum, n: v.n })).sort((a, b) => b.sum - a.sum);
  return { ...N, from: dstr(from), to: dstr(wT + 6), avail, spent, left, carry, daysLeft, perDay, spentToday, todayLeft: r2(perDay - spentToday), last, cats };
}

// koverte iz kasice: uplate sa oznakom koverte (store), ukupno i ovog meseca
export function envelopes(cfg, receipts, today) {
  const ym = today.slice(0, 7), rows = receipts.filter(r => r.cat === "stednja");
  const v = r => (r.refund ? -1 : 1) * Math.abs(Number(r.total) || 0);
  return (cfg.save || []).map(s => {
    // jedna koverta: sve uplate u kasicu su njene
    const mine = cfg.save.length === 1 ? rows : rows.filter(r => (r.store || "") === s.id);
    return { ...s, total: sum(mine, v), month: sum(mine.filter(r => !r.refund && String(r.issued_at).startsWith(ym)), v) };
  });
}

/*
 * Mesec: koliko je od fiksnog plaćeno, koliko je u fondu za veće stvari (puni se svakog meseca
 * od početka plana, troši se na kuću, auto, lekara) i šta je izašlo van plana.
 */
export function monthPlan(cfg, list, receipts, today) {
  const ym = today.slice(0, 7), N = planNumbers(cfg, ym);
  const T = totals(list.filter(e => e.d.startsWith(ym) && e.d <= today));
  const paid = cats => r2(cats.reduce((s, c) => s + (T.by[c] ? -T.by[c].sum : 0), 0));
  const fixed = (cfg.fixed || []).map(f => ({ ...f, paid: paid(f.cats || []) }));
  const start = (cfg.start || today).slice(0, 7);
  // fond se puni svakog meseca od početka plana, osim meseci kad je preskočen
  let months = 0, bigIn = 0;
  for (let k = start; k <= ym; k = nextYm(k)) { months++; if (!skipOf(cfg, k).big) bigIn += N.big0; }
  const bigCats = cfg.big?.cats || BIG_CATS;
  const TB = totals(list.filter(e => e.d >= (cfg.start || today) && e.d <= today));
  const bigSpent = r2(bigCats.reduce((s, c) => s + (TB.by[c] ? -TB.by[c].sum : 0), 0));
  const bigLeft = r2(bigIn - bigSpent);
  const over = fixed.filter(f => f.paid > f.amount + 0.5).map(f => ({ name: f.name, over: r2(f.paid - f.amount) }));
  const env = envelopes(cfg, receipts, today).map(e => (N.save === 0 ? { ...e, amount: 0 } : e));
  return { ...N, fixed, bigSpent, bigLeft, months, over, extras: extrasOf(cfg, ym), envelopes: env };
}

/*
 * Predlog plana iz podataka: uplate iz poslednjih 35 dana (ime, dan u mesecu, iznos)
 * i fiksni troškovi iz poslednjih 30 dana po kategoriji. Korisnik sve proveri i ispravi.
 */
const r500 = n => Math.round(n / 500) * 500;
export function suggestPlan(list, today) {
  const t = dnum(today);
  // ručno upisane uplate uvek; uplate iz izvoda samo ako se isto ime ponovilo (stalna uplata, ne jednokratna)
  const nameOf = e => String(e.receipt?.merchant || e.name || "").trim().toLowerCase();
  const all = list.filter(e => e.amount >= 20000 && dnum(e.d) > t - 70 && e.parts.some(p => p.cat === "priliv"));
  const count = {}; for (const e of all) count[nameOf(e)] = (count[nameOf(e)] || 0) + 1;
  const incs = all.filter(e => dnum(e.d) > t - 35 && (e.receipt || count[nameOf(e)] >= 2));
  const seen = new Map();
  for (const e of incs.sort((a, b) => (a.d < b.d ? 1 : -1))) {
    const dom = +e.d.slice(8, 10), slot = dom <= 8 ? "a" : dom <= 22 ? "b" : "c";
    const name = String(e.receipt?.merchant || e.name || "").trim() || "Uplata", key = name.toLowerCase() + "|" + slot;
    if (!seen.has(key)) seen.set(key, { name, day: slot === "c" && dom >= 26 ? 0 : dom, amount: Math.round(e.amount) });
  }
  const recent = totals(list.filter(e => dnum(e.d) > t - 30 && e.d <= today));
  const fixed = FIXED_DEFAULT.map(f => ({ ...f, amount: r500(f.cats.reduce((s, c) => s + (recent.by[c] ? -recent.by[c].sum : 0), 0)) }));
  return {
    incomes: [...seen.values()].sort((a, b) => (a.day || 31) - (b.day || 31)),
    fixed,
    save: ENVELOPES.map(e => ({ ...e, amount: 30000 })),
    big: { amount: 15000, cats: BIG_CATS },
  };
}

export const dayName = d => (Number(d) === 0 ? "poslednjeg dana" : `${d}.`);
