// Plan meseca: koliko stiže, šta je fiksno, šta ide u koverte i fond za veće stvari,
// i koliko ostaje za život, podeljeno po nedeljama. Bez DOM-a, da može da se testira.
//
// Nedelja je od ponedeljka do nedelje. Prekoračenje jedne nedelje smanjuje sledeću za toliko
// (i tako dalje, dok se ne izravna). Ono što ostane od nedelje ne prenosi se: to ide u kovertu.
import { CAT, totals } from "./logic.js";
import { dailySpend, dnum, dstr } from "./stats.js";

const r2 = n => Math.round(n * 100) / 100;
const fmt = n => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(Math.round(n));
const sum = (a, f = x => x.amount) => r2((a || []).reduce((s, x) => s + (Number(f(x)) || 0), 0));
const DAY = 864e5;
export const WEEKS_PER_MONTH = 365.25 / 12 / 7;
const nextYm = ym => { const [y, m] = ym.split("-").map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; };
/*
 * Mesec za štednju: poslednja dva dana u mesecu već pripadaju sledećem, jer tada stiže uplata
 * za sledeći mesec (poslednjeg dana, ili ranije uplaćena za 1.). Ti dani se računaju kao 1.
 */
export const cycleMonth = d => { const D = dim(d.slice(0, 7)); return +d.slice(8, 10) >= D - 1 ? nextYm(d.slice(0, 7)) : d.slice(0, 7); };
export const cycleDay = d => { const D = dim(d.slice(0, 7)); return +d.slice(8, 10) >= D - 1 ? 1 : +d.slice(8, 10); };
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
// stalna uplata se prepoznaje po imenu i danu
export const incomeKey = x => `${String(x.name || "").trim().toLowerCase()}|${Number(x.day) || 0}`;
// stalne uplate koje ovog meseca ne stižu: za taj mesec nema ni te uplate, ni štednje od nje, ni fonda
const missingOf = (cfg, ym) => new Set(skipOf(cfg, ym).missing || []);
export function planNumbers(cfg, ym = null) {
  const regs = (cfg.incomes || []).filter(x => !x.month), miss = missingOf(cfg, ym);
  const reg = sum(regs), regM = sum(regs.filter(x => !miss.has(incomeKey(x)))), fixed = sum(cfg.fixed);
  const save0 = sum(cfg.save), big0 = Number(cfg.big?.amount) || 0, sk = skipOf(cfg, ym);
  const extra = ym ? sum(extrasOf(cfg, ym)) : 0;
  // štednja za jedan mesec: bez štednje od uplata koje ne stižu (stari zapisi: saveAmt, save)
  const saveM = miss.size ? sum(incomeSaves(cfg).filter(x => !miss.has(incomeKey(x))), x => x.save) : save0;
  const save = sk.saveAmt != null ? Number(sk.saveAmt) : sk.save ? 0 : saveM, big = sk.big || miss.size ? 0 : big0;
  const base = r2(reg - fixed - save0 - big0), life = r2(regM + extra - fixed - save - big);
  return { inc: r2(regM + extra), reg, regM, extra, fixed, save, big, save0, big0, base, life, missing: [...miss], week: Math.round(base / WEEKS_PER_MONTH), day: Math.round(base * 12 / 365.25), monthWeek: ym ? Math.round(life / dim(ym) * 7) : Math.round(base / WEEKS_PER_MONTH) };
}
// koliko se sme jednog dana: stalni plan (isto svaki dan), plus ono što je ovog meseca drugačije
export function dayAllowance(cfg, d) {
  const ym = d.slice(0, 7), D = dim(ym), N = planNumbers(cfg, ym), dom = +d.slice(8, 10);
  let a = N.base * 12 / 365.25 + (N.regM - N.reg + N.save0 - N.save + N.big0 - N.big) / D;
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
  // po danima ove nedelje: potrošeno i koliko je plan davao za taj dan (prosek nedelje, bez prenosa)
  const days = [];
  for (let n = from; n <= wT + 6; n++) days.push({ d: dstr(n), spent: n <= t ? Math.max(0, spentIn(n, n)) : 0, allow: Math.round(dayAllowance(cfg, dstr(n))), future: n > t, today: n === t });
  return { ...N, from: dstr(from), to: dstr(wT + 6), avail, spent, left, carry, daysLeft, perDay, spentToday, todayLeft: r2(perDay - spentToday), last, cats, days };
}

// koverte iz kasice: uplate sa oznakom koverte (store), ukupno i ovog meseca
export function envelopes(cfg, receipts, today) {
  const ym = cycleMonth(today), rows = receipts.filter(r => r.cat === "stednja");
  const v = r => (r.refund ? -1 : 1) * Math.abs(Number(r.total) || 0);
  return (cfg.save || []).map(s => {
    // jedna koverta: sve uplate u kasicu su njene
    const mine = cfg.save.length === 1 ? rows : rows.filter(r => (r.store || "") === s.id);
    return { ...s, total: sum(mine, v), month: sum(mine.filter(r => !r.refund && cycleMonth(String(r.issued_at).slice(0, 10)) === ym), v) };
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
  for (let k = start; k <= ym; k = nextYm(k)) { months++; if (!skipOf(cfg, k).big && !missingOf(cfg, k).size) bigIn += N.big0; }
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

/* ---------- obaveze, limiti po kategorijama i upozorenja ---------- */

// rokovi: računi 1., porez 15.; terapija i pretplate bez roka
export const FIXED_DAYS = { porez: 15, racuni: 1 };
const domOf = d => +d.slice(8, 10);

// Fiksni troškovi ovog meseca: plaćeno, rok i da li kasni. Plaćeno je kad je plaćeno bar 90% iznosa.
export function fixedStatus(cfg, list, today) {
  const ym = today.slice(0, 7), D = dim(ym), dom = domOf(today);
  const T = totals(list.filter(e => e.d.startsWith(ym) && e.d <= today));
  return (cfg.fixed || []).map(f => {
    const paid = r2((f.cats || []).reduce((s, c) => s + (T.by[c] ? -T.by[c].sum : 0), 0));
    const day = f.day != null ? Number(f.day) : (FIXED_DAYS[(f.cats || [])[0]] || 0);
    const due = day ? Math.min(D, day) : 0;
    const done = paid >= f.amount * 0.9;
    // rok koji je prošao pre nego što je plan napravljen se ne broji kao kašnjenje
    const before = cfg.start && cfg.start.slice(0, 7) === ym && due && due < domOf(cfg.start);
    const status = done ? "paid" : !due ? "open" : before ? "before" : dom > due ? "late" : due - dom <= 2 ? "soon" : "open";
    return { name: f.name, amount: f.amount, paid, day: due, status, daysLate: status === "late" ? dom - due : 0, daysTo: due && !done ? due - dom : 0 };
  });
}

// kategorije za život (ono što ide iz nedeljnog iznosa) za koje ima smisla limit
export const LIMIT_CATS = ["market", "pijaca", "pekara", "dostava", "izlasci", "cigarete", "alkohol", "gorivo", "putarina", "taksi", "apoteka", "hemija", "zasebe", "teretana", "pozoriste", "kupovina"];

/*
 * Predlog mesečnih limita: prosečna potrošnja po kategoriji od kad se app koristi, preračunata na mesec,
 * zaokružena na 500. Ako je zbir veći od 90% novca za život, sve se srazmerno smanji.
 */
export function suggestLimits(cfg, list, today, since) {
  const days = Math.max(14, dnum(today) - dnum(since) + 1);
  const T = totals(list.filter(e => e.d >= since && e.d <= today), outsideCats(cfg));
  const k = 365.25 / 12 / days;
  let rows = LIMIT_CATS.map(id => ({ id, avg: T.by[id] ? -T.by[id].sum * k : 0 })).filter(r => r.avg >= 1500);
  const life = planNumbers(cfg).base, sumAvg = rows.reduce((s, r) => s + r.avg, 0);
  const f = sumAvg > life * 0.9 && sumAvg > 0 ? life * 0.9 / sumAvg : 1;
  return Object.fromEntries(rows.sort((a, b) => b.avg - a.avg).map(r => [r.id, Math.max(500, Math.round(r.avg * f / 500) * 500)]));
}

// Limiti za period: mesečni limit, ili njegov deo za nedelju (7 dana od dužine meseca)
export function categoryLimits(limits, list, from, to, cfg) {
  const ym = to.slice(0, 7), D = dim(ym), days = dnum(to) - dnum(from) + 1;
  const share = days >= D ? 1 : days / D;
  const rnd = v => (share < 1 ? Math.round(v / 100) * 100 : Math.round(v));
  const T = totals(list.filter(e => e.d >= from && e.d <= to), outsideCats(cfg));
  return Object.entries(limits || {}).map(([id, m]) => {
    const limit = rnd(m * share), spent = T.by[id] ? r2(-T.by[id].sum) : 0;
    return { id, monthly: m, limit, spent, left: r2(limit - spent) };
  });
}

/*
 * Da li novac koji imaš dobaci do kraja meseca po planu: stanje, plus uplate koje još stižu ovog meseca
 * (bez uplate poslednjeg dana, ona je za sledeći mesec), minus neplaćeno fiksno, štednja koja još nije
 * odvojena, fond za veće stvari i život do kraja meseca.
 */
export function monthForecast(cfg, list, receipts, today, balanceNow) {
  const ym = today.slice(0, 7), D = dim(ym), dom = domOf(today), N = planNumbers(cfg, ym);
  const missF = missingOf(cfg, ym);
  const incoming = r2((cfg.incomes || []).filter(x => (!x.month || x.month === ym) && !(!x.month && missF.has(incomeKey(x)))).filter(x => { const d = Number(x.day) || D; return d > dom && d < D; }).reduce((s, x) => s + Number(x.amount), 0));
  const unpaid = r2(fixedStatus(cfg, list, today).filter(f => f.status !== "before").reduce((s, f) => s + Math.max(0, f.amount - f.paid), 0));
  const env = envelopes(cfg, receipts, today), saved = env.reduce((s, e) => s + e.month, 0);
  const unsaved = Math.max(0, r2(N.save - saved));
  const fund = Math.max(0, monthPlan(cfg, list, receipts, today).bigLeft);
  const w = weekPlan(cfg, list, today);
  let lifeRest = Math.max(0, w.left);
  for (let n = dnum(w.to) + 1; n <= dnum(`${ym}-${String(D).padStart(2, "0")}`); n++) lifeRest += dayAllowance(cfg, dstr(n));
  lifeRest = Math.round(lifeRest);
  const gap = Math.round(balanceNow + incoming - unpaid - unsaved - fund - lifeRest);
  return { gap, balance: balanceNow, incoming, unpaid, unsaved, fund, lifeRest };
}

// Upozorenja za početni ekran: kašnjenja, rokovi, novac koji ne dobacuje, prekoračeni limiti i nedelja
export function planWarnings(cfg, list, receipts, today, balanceNow, limits) {
  const out = [], ym = today.slice(0, 7), D = dim(ym), dom = domOf(today);
  for (const f of fixedStatus(cfg, list, today)) {
    if (f.status === "late") out.push({ level: "warn", icon: "upozorenje", title: `${f.name}: kasni ${f.daysLate} ${f.daysLate === 1 ? "dan" : "dana"}`, text: `Rok je bio ${f.day}. u mesecu. Plaćeno ${fmt(f.paid)} od ${fmt(f.amount)}.` });
    else if (f.status === "soon") out.push({ level: "info", icon: "kalendar", title: `${f.name}: rok ${f.daysTo === 0 ? "je danas" : f.daysTo === 1 ? "je sutra" : `za ${f.daysTo} dana`}`, text: `Plaća se do ${f.day}. u mesecu, ${fmt(f.amount)} dinara.` });
  }
  // poslednja dva dana u mesecu računica za ovaj mesec više nema smisla, a za sledeći kreće 1.
  if (balanceNow != null && cycleMonth(today) === ym) {
    const F = monthForecast(cfg, list, receipts, today, balanceNow);
    if (F.gap < -500) out.push({ level: "warn", icon: "upozorenje", title: `Do kraja meseca fali ${fmt(-F.gap)}`, text: `Sa novcem koji imaš i uplatama koje još stižu ovog meseca, plan ne dobacuje do kraja meseca. Smanji trošenje ove nedelje, ili u planu upiši umanjenje samo za ovaj mesec.` });
  }
  const sv = savingsDue(cfg, receipts, today);
  if (sv.missing >= 500) out.push({ level: "warn", icon: "kasica", title: `Stavi ${fmt(sv.missing)} u štednju`, text: `Do danas je trebalo da odvojiš ${fmt(sv.due)} (od uplata: ${sv.from.join(", ")}), a odvojeno je ${fmt(sv.saved)}. Podigni gotovinu, stavi je u kovertu i upiši U štednju.` });
  const w = weekPlan(cfg, list, today);
  if (w.left < 0) out.push({ level: "warn", icon: "upozorenje", title: `Nedelja je prekoračena za ${fmt(-w.left)}`, text: `Toliko će sledeća nedelja biti manja.` });
  // limiti važe od prvog celog meseca plana
  const startedLate = cfg.start && cfg.start.slice(0, 7) === ym && domOf(cfg.start) > 3;
  for (const c of startedLate ? [] : categoryLimits(limits, list, `${ym}-01`, today, cfg)) {
    const m = c.monthly;
    if (c.spent > m) out.push({ level: "warn", icon: c.id, title: `${CAT[c.id]?.name || c.id}: preko limita za ${fmt(c.spent - m)}`, text: `Limit za mesec je ${fmt(m)}, potrošeno ${fmt(c.spent)}.` });
    else if (c.spent > m * 0.5 && c.spent > m * (dom / D) * 1.25) out.push({ level: "info", icon: c.id, title: `${CAT[c.id]?.name || c.id}: brže od plana`, text: `Potrošeno ${fmt(c.spent)} od ${fmt(m)}, a prošlo je ${fmt(dom / D * 100)}% meseca. Ovim tempom limit se probija pre kraja meseca.` });
  }
  return out;
}


/*
 * Koliko od svake stalne uplate ide u štednju. Ako nije upisano po uplati, ukupna štednja se deli:
 * po 5.000 zaokruženo na svaku, a ostatak na uplatu sa kraja meseca (ili poslednju).
 */
export function incomeSaves(cfg) {
  const reg = (cfg.incomes || []).filter(x => !x.month);
  if (reg.some(x => Number(x.save) > 0)) return reg.map(x => ({ ...x, save: Number(x.save) || 0 }));
  const total = sum(cfg.save), n = reg.length; if (!n) return [];
  const each = Math.floor(total / n / 5000) * 5000;
  const end = reg.findIndex(x => !Number(x.day)), k = end >= 0 ? end : n - 1;
  return reg.map((x, i) => ({ ...x, save: i === k ? total - each * (n - 1) : each }));
}

// Štednja do danas: koliko je trebalo da se odvoji od uplata koje su stigle (uplata sa kraja meseca
// i ona za 1. računaju se od početka meseca za štednju), koliko je odvojeno i koliko fali.
export function savingsDue(cfg, receipts, today) {
  const ym = cycleMonth(today), cd = cycleDay(today), N = planNumbers(cfg, ym);
  const miss = missingOf(cfg, ym);
  const rows = incomeSaves(cfg).filter(x => x.save > 0 && !miss.has(incomeKey(x))).map(x => ({ name: x.name, day: (Number(x.day) || 0) >= 28 ? 0 : Number(x.day) || 0, save: x.save }));  // 28. i kasnije je uplata sa kraja meseca
  // datum uplate u ovom mesecu za štednju (kraj meseca je poslednji dan prethodnog); od uplate koja je
  // stigla pre nego što je plan napravljen štednja se ne traži
  const prev = (() => { const [y, m] = ym.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; })();
  const payDate = x => (x.day ? `${ym}-${String(Math.min(x.day, dim(ym))).padStart(2, "0")}` : `${prev}-${String(dim(prev)).padStart(2, "0")}`);
  const okRows = rows.filter(x => !cfg.start || payDate(x) > cfg.start);
  const cum = okRows.filter(x => x.day <= cd).reduce((s, x) => s + x.save, 0);
  const due = Math.min(N.save, cum);
  const saved = envelopes(cfg, receipts, today).reduce((s, e) => s + e.month, 0);
  return { ym, due, saved, missing: Math.max(0, r2(due - saved)), target: N.save, from: okRows.filter(x => x.day <= cd).map(x => x.name + (x.day ? ` ${x.day}.` : ", kraj meseca")) };
}
