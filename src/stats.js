// Statistike i upozorenja za profil. Čiste funkcije nad listom stavki iz derive(), bez DOM-a.
import { CAT, totals, upper } from "./logic.js";

const r2 = n => Math.round(n * 100) / 100;
const DAY = 864e5;
export const dnum = d => Math.round(Date.parse(String(d).slice(0, 10) + "T00:00:00Z") / DAY);
export const dstr = n => new Date(n * DAY).toISOString().slice(0, 10);
const weekday = d => (new Date(dnum(d) * DAY).getUTCDay() + 6) % 7;        // 0 = ponedeljak
const monthOf = d => String(d).slice(0, 7);
const daysInMonth = ym => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const prevMonth = ym => { const [y, m] = ym.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; };

// Stvari bez kojih se može. Cigarete se broje i po paklicama.
export const NONESSENTIAL = ["cigarete", "alkohol", "izlasci", "dostava", "taksi", "pretplate"];

/*
 * Potrošnja po danima. Kartica i račun se broje na dan plaćanja. Gotovina se broji kad se pojavi
 * prvi put: na dan podizanja, ili na dan računa ako je račun plaćen gotovinom koja nije podignuta
 * sa računa (npr. gotovinska uplata). Zbir svih dana je isti kao potrošnja u pregledu.
 */
export function dailySpend(list) {
  const nonCash = {}, W = {}, C = {}, SV = {};
  for (const e of list) for (const p of e.parts) {
    const c = CAT[p.cat]; if (!c) continue;
    if (p.cat === "gotovina") { W[e.d] = (W[e.d] || 0) - p.amount; continue; }
    if (p.cat === "stednja") { if (p.amount < 0) SV[e.d] = (SV[e.d] || 0) - p.amount; continue; }
    if (c.kind !== "spend") continue;
    if (e.cash) C[e.d] = (C[e.d] || 0) - p.amount; else nonCash[e.d] = (nonCash[e.d] || 0) - p.amount;
  }
  const days = [...new Set([...Object.keys(nonCash), ...Object.keys(W), ...Object.keys(C), ...Object.keys(SV)])].sort();
  // gotovina se sabira u okviru meseca, kao u pregledu, pa se mesečni zbirovi slažu
  const out = {}; let cw = 0, cc = 0, cs = 0, counted = 0, mon = "";
  for (const d of days) {
    if (d.slice(0, 7) !== mon) { mon = d.slice(0, 7); cw = cc = cs = counted = 0; }
    cw += W[d] || 0; cc += C[d] || 0; cs += SV[d] || 0;
    // podignuta gotovina stavljena u kasicu nije potrošnja
    const now = Math.max(cw - cs, cc, 0), cash = now - counted; counted = now;
    out[d] = r2((nonCash[d] || 0) + cash);
  }
  return out;
}

const sumRange = (daily, from, to) => { let s = 0; for (let n = dnum(from); n <= dnum(to); n++) s += daily[dstr(n)] || 0; return r2(s); };

// Danas, nedelja, mesec, prošli mesec, prosek, tempo do kraja meseca
export function rhythm(list, today) {
  const daily = dailySpend(list);
  const t = dnum(today), wd = weekday(today), ym = monthOf(today), dom = +today.slice(8, 10);
  const pm = prevMonth(ym), pmDays = daysInMonth(pm);
  const first = Object.keys(daily).sort()[0] || today;
  const span30 = Math.min(30, Math.max(1, t - dnum(first) + 1));
  const avg30 = sumRange(daily, dstr(t - span30 + 1), today) / span30;
  const week = sumRange(daily, dstr(t - wd), today);
  const lastWeekSame = sumRange(daily, dstr(t - wd - 7), dstr(t - 7));
  const month = sumRange(daily, ym + "-01", today);
  const lastMonthSame = sumRange(daily, pm + "-01", `${pm}-${String(Math.min(dom, pmDays)).padStart(2, "0")}`);
  const lastMonth = sumRange(daily, pm + "-01", `${pm}-${String(pmDays).padStart(2, "0")}`);
  const hasLastMonth = dnum(first) <= dnum(pm + "-01") + 3;
  // do kraja meseca: ono što je već potrošeno, plus prosečan dan za preostale dane
  const projected = r2(month + avg30 * (daysInMonth(ym) - dom));
  return { daily, today: daily[today] || 0, avg30: r2(avg30), week, lastWeekSame, month, lastMonthSame, lastMonth, hasLastMonth, projected, dom, dim: daysInMonth(ym), first };
}

// Serije za grafikone
export function seriesDays(daily, today, n = 30) {
  const t = dnum(today); const out = [];
  for (let i = n - 1; i >= 0; i--) { const d = dstr(t - i); out.push({ key: d, v: daily[d] || 0 }); }
  return out;
}
export function seriesWeeks(daily, today, n = 10) {
  const t = dnum(today), mon = t - weekday(today); const out = [];
  for (let i = n - 1; i >= 0; i--) { const a = mon - i * 7; out.push({ key: dstr(a), v: sumRange(daily, dstr(a), dstr(Math.min(a + 6, t))), partial: i === 0 }); }
  return out;
}
export function seriesMonths(list, today, n = 6) {
  const out = []; let ym = monthOf(today);
  const months = [];
  for (let i = 0; i < n; i++) { months.unshift(ym); ym = prevMonth(ym); }
  for (const m of months) out.push({ key: m, v: totals(list.filter(e => e.d.startsWith(m))).spend, partial: m === monthOf(today) });
  return out;
}

// Kategorije: ovaj mesec do danas i ceo prošli mesec
export function categoryCompare(list, today) {
  const ym = monthOf(today), pm = prevMonth(ym);
  const a = totals(list.filter(e => e.d.startsWith(ym))).by, b = totals(list.filter(e => e.d.startsWith(pm))).by;
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  const rows = [];
  for (const id of ids) {
    const c = CAT[id]; if (!c || c.kind !== "spend") continue;
    const now = a[id] ? -a[id].sum : 0, before = b[id] ? -b[id].sum : 0;
    if (now < 1 && before < 1) continue;
    rows.push({ id, now: r2(now), before: r2(before) });
  }
  return rows.sort((x, y) => Math.max(y.now, y.before) - Math.max(x.now, x.before));
}

// Artikli sa računa, za cene i paklice
function itemRows(list) {
  const rows = [];
  for (const e of list) {
    const rc = e.receipt; if (!rc || !(rc.items || []).length) continue;
    const store = rc.store || rc.merchant || e.name;
    for (const p of e.parts) for (const it of p.items || []) {
      const qty = Math.abs(it.qty || 1), total = Math.abs(it.total || 0);
      if (!total) continue;
      rows.push({ d: e.d, store, name: it.name, key: upper(it.name).replace(/\s+/g, " ").replace(/\s*\/\s*(KOM|KG|L|KOMAD)\s*$/, "").trim(), unit: r2(it.price || total / qty), qty, total, cat: it.cat || p.cat });
    }
  }
  return rows;
}

const pct = (a, b) => Math.round((a / b - 1) * 100);
const money = n => new Intl.NumberFormat("sr-Latn-RS", { maximumFractionDigits: 0 }).format(Math.round(Math.abs(n)));

/*
 * Upozorenja i zapažanja. Svako: { level: "warn" | "info", icon, title, text }.
 * Pragovi su namerno umereni, da se ne javlja za sitnice.
 */
export function insights(list, today, bal) {
  const out = [];
  const ym = monthOf(today), R = rhythm(list, today);
  const month = list.filter(e => e.d.startsWith(ym));
  const T = totals(month);

  // 1. artikal skuplji nego ranije, ili jeftiniji u drugoj radnji
  const items = itemRows(list), byKey = {};
  for (const it of items) (byKey[it.key] ||= []).push(it);
  for (const arr of Object.values(byKey)) {
    if (arr.length < 2) continue;
    arr.sort((a, b) => a.d.localeCompare(b.d));
    const last = arr[arr.length - 1], before = arr.slice(0, -1);
    const minPrev = before.reduce((m, x) => (x.unit < m.unit ? x : m));
    if (dnum(today) - dnum(last.d) <= 45 && last.unit > minPrev.unit * 1.05 && last.unit - minPrev.unit >= 10)
      out.push({ level: "warn", icon: "racuni", title: `${last.name} je skuplji nego ranije`, text: `Poslednji put ${money(last.unit)} RSD (${last.store}, ${dShort(last.d)}), a ranije ${money(minPrev.unit)} RSD (${minPrev.store}, ${dShort(minPrev.d)}). Skuplje za ${pct(last.unit, minPrev.unit)}%.` });
  }

  // 2. kategorija iznad proseka: ovaj mesec do danas prema istom delu prethodnih meseci
  // (samo meseci koji su ceo u appu, da delimičan mesec ne pokvari prosek)
  const firstDay = Object.keys(R.daily).sort()[0] || today, prev = [];
  let m = prevMonth(ym);
  for (let i = 0; i < 3; i++) { if (dnum(firstDay) <= dnum(m + "-01") + 2) prev.push(m); m = prevMonth(m); }
  if (prev.length && R.dom >= 7) {
    const avg = {};
    for (const pm of prev) {
      const cut = `${pm}-${String(Math.min(R.dom, daysInMonth(pm))).padStart(2, "0")}`;
      const by = totals(list.filter(e => e.d.startsWith(pm) && e.d <= cut)).by;
      for (const [id, v] of Object.entries(by)) avg[id] = (avg[id] || 0) - v.sum / prev.length;
    }
    for (const [id, v] of Object.entries(T.by)) {
      const c = CAT[id]; if (!c || c.kind !== "spend" || ["nerazvrstano", "gotovina"].includes(id)) continue;
      const now = -v.sum, base = avg[id] || 0;
      if (base > 1000 && now > base * 1.3 && now - base > 2000)
        out.push({ level: "warn", icon: id, title: `${c.name}: ${pct(now, base)}% više nego obično`, text: `Do danas ovog meseca ${money(now)} RSD, a do istog dana ranijih meseci prosečno ${money(base)} RSD.` });
    }
  }

  // 3. moguće dvostruko naplaćeno: isti trgovac, isti iznos, isti dan, iz banke
  const seen = {};
  for (const e of list) {
    if (e.type !== "bank" || e.amount >= 0 || dnum(today) - dnum(e.d) > 45) continue;
    const k = e.d + "|" + e.name + "|" + e.amount;
    if (seen[k]) out.push({ level: "warn", icon: "provizije", title: "Moguće dvostruko naplaćeno", text: `${e.name}, ${money(e.amount)} RSD, dva puta ${dShort(e.d)}. Proveri u banci.` });
    seen[k] = true;
  }

  // 4. pretplate koje se ponavljaju
  const subs = {};
  for (const e of list) for (const p of e.parts) if (p.cat === "pretplate" && p.amount < 0 && dnum(today) - dnum(e.d) <= 62) (subs[e.name] ||= []).push(-p.amount);
  const subList = Object.entries(subs).map(([n, a]) => ({ n, v: a[a.length - 1] })).sort((a, b) => b.v - a.v);
  if (subList.length) {
    const sum = subList.reduce((s, x) => s + x.v, 0);
    out.push({ level: "info", icon: "pretplate", title: `Pretplate: oko ${money(sum)} RSD mesečno`, text: `${subList.slice(0, 5).map(x => x.n.toLowerCase() + " " + money(x.v)).join(", ")}. Godišnje oko ${money(sum * 12)} RSD. Proveri da li koristiš sve.` });
  }

  // 5. banci
  const fees = (T.by.provizije ? -T.by.provizije.sum : 0) + T.feeConv;
  if (fees >= 100) out.push({ level: "info", icon: "provizije", title: `Banci ovog meseca ${money(fees)} RSD`, text: "Provizije, održavanje računa i konverzija pri plaćanju u stranoj valuti." });

  // 6. gotovina bez računa
  if (T.unexplained >= 1000) out.push({ level: "info", icon: "gotovina", title: `${money(T.unexplained)} RSD gotovine bez računa`, text: "Ovog meseca podignuto više nego što je skenirano računa. Skeniraj račune plaćene gotovinom, pa ćeš znati gde je otišlo." });

  // 7. koliko traju pare, ovim tempom
  if (bal && R.avg30 > 0) {
    const days = Math.floor(bal.now / R.avg30);
    out.push({ level: days < 20 ? "warn" : "info", icon: "priliv", title: days > 0 ? `Ovim tempom pare traju još ${days} ${days % 10 === 1 && days % 100 !== 11 ? "dan" : "dana"}` : "Stanje je u minusu", text: days > 0 ? `Trošiš prosečno ${money(R.avg30)} RSD dnevno (poslednjih 30 dana). Bez novih uplata, otprilike do ${dShort(dstr(dnum(today) + days))}` : "Upiši uplate ili ispravi stanje." });
  }

  // 8. nerazvrstano
  const unc = month.filter(e => e.parts.some(p => p.cat === "nerazvrstano")).length;
  if (unc) out.push({ level: "info", icon: "nerazvrstano", title: `${unc} ${unc === 1 ? "stavka čeka" : "stavki čeka"} kategoriju`, text: "Dok nisu razvrstane, statistika po kategorijama nije potpuna." });

  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === "warn" ? -1 : 1));
}

// Ono bez čega se može, poslednjih 30 dana: iznos, udeo u potrošnji, godišnje tim tempom, paklice
export function nonEssential(list, today) {
  const from = dnum(today) - 29;
  const recent = list.filter(e => dnum(e.d) >= from && dnum(e.d) <= dnum(today));
  const T = totals(recent);
  const rows = NONESSENTIAL.map(id => ({ id, v: T.by[id] ? r2(-T.by[id].sum) : 0 })).filter(r => r.v > 0).sort((a, b) => b.v - a.v);
  const sum = r2(rows.reduce((s, r) => s + r.v, 0));
  const packs = itemRows(recent).filter(it => it.cat === "cigarete").reduce((s, it) => s + it.qty, 0);
  return { rows, sum, share: T.spend ? Math.round(sum / T.spend * 100) : 0, yearly: r2(sum / 30 * 365), packs, spend: T.spend };
}

// Navike: dan u nedelji, najčešći trgovac, prosečan račun, broj kupovina (poslednjih 60 dana)
export function habits(list, today) {
  const from = dnum(today) - 59;
  const recent = list.filter(e => dnum(e.d) >= from);
  const daily = dailySpend(recent), byWd = Array(7).fill(0), cnt = Array(7).fill(0);
  for (let n = from; n <= dnum(today); n++) { const d = dstr(n); byWd[weekday(d)] += daily[d] || 0; cnt[weekday(d)]++; }
  const avgWd = byWd.map((s, i) => (cnt[i] ? s / cnt[i] : 0));
  const topWd = avgWd.indexOf(Math.max(...avgWd));
  const freq = {};
  let buys = 0, buySum = 0;
  for (const e of recent) {
    if (e.amount >= 0 || e.parts.every(p => CAT[p.cat]?.kind !== "spend" || p.cat === "gotovina")) continue;
    buys++; buySum += -e.amount;
    const k = e.name; (freq[k] ||= { n: 0, v: 0 }); freq[k].n++; freq[k].v += -e.amount;
  }
  const top = Object.entries(freq).sort((a, b) => b[1].n - a[1].n)[0];
  return { topWd, avgWd: avgWd.map(r2), top: top ? { name: top[0], n: top[1].n, v: r2(top[1].v) } : null, buys, avgBuy: buys ? r2(buySum / buys) : 0 };
}

function dShort(d) { const [, m, dd] = String(d).slice(0, 10).split("-"); return `${+dd}.${+m}.`; }
