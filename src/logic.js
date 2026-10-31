// Kategorije, pravila i računanje pregleda. Bez DOM-a, da može da se testira.
import { latin } from "./shared/fiscal.js";

export const CATS = [
  { id: "market",       name: "Market i namirnice",  kind: "spend" },
  { id: "pijaca",       name: "Pijaca",              kind: "spend" },
  { id: "pekara",       name: "Pekara",              kind: "spend" },
  { id: "dostava",      name: "Dostava hrane",       kind: "spend" },
  { id: "izlasci",      name: "Kafići i izlasci",    kind: "spend" },
  { id: "cigarete",     name: "Cigarete",            kind: "spend" },
  { id: "alkohol",      name: "Alkohol",             kind: "spend" },
  { id: "gorivo",       name: "Gorivo",              kind: "spend" },
  { id: "pumpa",        name: "Na pumpi, ostalo",    kind: "spend" },
  { id: "putarina",     name: "Putarina",            kind: "spend" },
  { id: "taksi",        name: "Taksi",               kind: "spend" },
  { id: "pretplate",    name: "Pretplate i alati",   kind: "spend" },
  { id: "racuni",       name: "Telefon i računi",    kind: "spend" },
  { id: "porez",        name: "Porez za firmu",      kind: "spend" },
  { id: "apoteka",      name: "Apoteka i drogerija", kind: "spend" },
  { id: "terapija",     name: "Terapija",            kind: "spend" },
  { id: "lekar",        name: "Lekar i pregledi",    kind: "spend" },
  { id: "teretana",     name: "Teretana",            kind: "spend" },
  { id: "pozoriste",    name: "Pozorište i kultura", kind: "spend" },
  { id: "zasebe",       name: "Za sebe, garderoba",  kind: "spend" },
  { id: "kupovina",     name: "Kupovina i stvari",   kind: "spend" },
  { id: "kucaauto",     name: "Kuća, auto, uradi sam", kind: "spend" },
  { id: "hemija",       name: "Kućna hemija i higijena", kind: "spend" },
  { id: "gotovina",     name: "Gotovina, bez računa",kind: "spend" },
  { id: "provizije",    name: "Banka i provizije",   kind: "spend" },
  { id: "ostalo",       name: "Ostalo",              kind: "spend" },
  { id: "nezabelezeno", name: "Nezabeleženo",        kind: "spend" },
  { id: "nerazvrstano", name: "Nerazvrstano",        kind: "spend" },
  { id: "interno",      name: "Između mojih računa", kind: "neutral" },
  { id: "priliv",       name: "Priliv",              kind: "income" },
  { id: "prolazno",     name: "Prolazno",            kind: "pass" },
  { id: "stednja",      name: "Štednja",             kind: "save" },
];
// zapisi u tabeli računa koji nisu stavke: stanje (koliko imaš na neki dan) i profil (ime i slika)
// "cilj" je cilj štednje (naziv i iznos); uplate u kasicu su stavke sa kategorijom "stednja"
// "plan" je datum do kog novac treba da potraje (za Koliko smeš dnevno)
// "budzet" je plan meseca (uplate, fiksno, koverte, fond za veće stvari), sačuvan u items[0]
export const META_CATS = new Set(["stanje", "profil", "cilj", "plan", "budzet"]);
export const CAT = Object.fromEntries(CATS.map(c => [c.id, c]));
export const catName = id => (CAT[id] || CAT.nerazvrstano).name;

// alkohol: reči i marke koje se viđaju na računima (pivo, vino, žestina)
export const ALCO_RE = /\bPIVO\b|\bBEER\b|\bBIRR?A\b|\bVINO\b|\bWINE\b|RAKIJA|VOTKA|VODKA|VISKI|WHISK|JAGERMEISTER|J[ÄA]GER|\bGIN\b|\bRUM\b|\bJELEN\b|ZAJE[ČC]ARSKO|HEINEKEN|TUBORG|CARLSBERG|STELLA ARTOIS|NIKSI[ČC]KO|\bLAV\b|AMSTEL|BUDWEISER|CORONA|PERONI|MORR?ETT?I|MADR[IÌ]\b|STAROPRAMEN|PILSNER|KOZEL|KRU[ŠS]OVICE|LA[ŠS]KO|\bUNION\b|ERDINGER|PAULANER|BECK'?S|GRIMBERGEN|LEFFE|HOEGAARDEN|KRONENBOURG|SOMERSBY|APEROL|PELINKOVAC|VERMUT|LIKER|SPRITZ|TAMBURA[ŠS]|BOGDAN|ALEKSI[ĆC]|RADOVANOVI[ĆC]|KOVA[ČC]EVI[ĆC]|TIKVE[ŠS]|VRANAC|PLANTA[ŽZ]E|\bRUBIN\b|CHARDONN?AY|MERLOT|CABERNET|SAUVIGNON|RIZLING|RIESLING|[ŽZ]ILAVKA|PROKUPAC|TAMJANIKA|ROSE\b|ROZE\b|PROSECCO|ŠAMPANJ|SAMPANJ|SPUMANTE|[ŽZ]UTI CVET/;

const MERCHANT = [
  ["interno",   /MILO[SŠ] [ĐD]?J?OR[ĐD]?J?EVI[CĆ] PR|MILO[SŠ] \?OR\?EVIC PR|MENJA[CČ]NICA|SMART ATM - UPLATA|TRAJNI N/],
  ["provizije", /PROVIZIJ|UPIT STANJA|NAPLATA DOSPELIH|PREMIJE OSIGURANJA|OSIGURANJE - PAKET/],
  ["dostava",   /WOLT|GLOVO/],
  ["taksi",     /YANDEX ?GO|CAR:GO|NAXI|PINK TAXI/],
  ["pretplate", /ADOBE|APPLE\.COM|OPENAI|MIDJOURNEY|GOOGLE|FORMIA|SPOTIFY|NETFLIX|FIGMA|NOTION|DROPBOX|POLAR\*|PADDLE|LEMON ?SQUEEZY|DETAILS[ -.]SO/],
  ["porez",     /PORESK[AE] UPRAV|\bPOREZ\b|POREZ NA|JAVNI(H)? PRIHOD|DOPRINOS|PAU[ŠS]ALN/],
  ["racuni",    /YETTEL|A1 SRBIJA|TELEKOM|\bMTS\b|\bSBB\b|\bEPS\b|ELEKTROPRIVREDA|INFOSTAN|BEOGRADSKE ELEKTRANE|VODOVOD/],
  ["market",    /UNIVEREXPORT|MAXI|C MARKET|LIDL|SVEZE VOCE|SVEŽE VOĆE|THE PIJAC|AMAN DOO|\bIDEA\b|TEMPO|RODA|PERSPEKTIVA|DELHAIZE|MERCATOR/],
  ["pekara",    /PEKAR|BAKERY|HLEB I KIFLE|MLINAR|KIFLICA|PECIVA|BUREKD[ŽZ]IJ|BURE[ĆC]ARA|[ŠS]TRUDLA/],
  ["pijaca",    /\bPIJAC[AEIU]?\b|ZELENI VENAC|KALENI[ĆC]|BAJLONI|PILJAR/],
  ["izlasci",   /ZABAC|ŽABAC|BAR ZA|PIZZ|KAFE|CAFFE|KESTEN|ARGUMENT|HVALA TIP|RESTORAN/],
  ["kucaauto",  /BAUHAUS|MERKUR|MR ?BRICOLAGE|PEVEX|URADI SAM|\bOBI\b|JYSK|AUTO ?DELOVI|AUTODELOVI|AUTO ?CENTAR|VULKANIZ|AUTO ?SERVIS|TEHNI[CČ]KI PREGLED|AUTO ?PERIONICA|PERIONICA|GVO[ŽZ][ĐD]AR|BOJE I LAKOVI|ELEKTRO ?MATERIJAL/],
  ["pumpa",     /MOL SERBIA|\bMOL\b|\bOMV\b|LUKOIL|EKO SERBIA|GASPETROL|BENZINSK|\bNIS (A\.?D|PETROL|GAZPROM)|GAZPROM|PETROL/],
  ["putarina",  /JP PUTEVI|PUTEVI SRBIJE|PUTARIN|NAPLATN[AIO] STANIC|\bTOLL\b/],
  ["lekar",     /POLIKLINIK|ORDINACIJ|DOM ZDRAVLJA|KLINIK|LABORATORIJ|BEO-?LAB|MEDIGROUP|BEL MEDIC|ACIBADEM|EUROMEDIK|HIPOKRAT|STOMATOLO|\bZUBAR|DENTAL|\bMEDICAL\b|MEDIKAL|ZDRAVSTVEN[AIO] USTANOV/],
  ["pozoriste", /POZORI[ŠS]T|TEATAR|THEATRE|THEATER|ATELJE 212|JUGOSLOVENSKO DRAMSKO|BITEF|MADLENIANUM|BOJAN STUPICA|BIOSKOP|CINEPLEXX|CINEPLEX|\bCINEMA\b|EVENTIM|EFECTURA|GIGSTIX|TICKETVISION|\bMUZEJ|KONCERT|SAVA CENTAR|KOLARAC|FILHARMONIJ|OPERA\b/],
  ["teretana",  /TERETAN|\bGYM\b|FITNES|FITNESS|CROSSFIT|PILATES|FIT ?PASS/],
  ["zasebe",    /OPTIK|OPTIC|NAO[ČC]AR|\bZARA\b|\bH ?& ?M\b|HENNES|RESERVED|PULL ?& ?BEAR|BERSHKA|STRADIVARIUS|MASSIMO DUTTI|\bC ?& ?A\b|NEW YORKER|SPORT ?VISION|\bBUZZ\b|\bN ?SPORT\b|OFFICE SHOES|DEICHMANN|LC WAIKIKI|DEFACTO|KOTON|INTERSPORT|DECATHLON|\bMANGO\b|TALLY WEIJL|GARDEROB|OBU[ĆC]A|ODE[ĆC]A|FRIZER|BERBER|BARBER/],
  ["apoteka",   /APOTEK|BENU|DM DROGERIE|\bDM\b|AGAPE ZU|LILLY/],
  ["kupovina",  /GIGATRON|ROBNA KUCA|ROBNA KUĆA|PANDA 888|TEHNOMANIJA|IKEA/],
];

const ITEM = [
  ["cigarete", /MARLBORO|ROTHMANS|WINSTON|\bLD\b|CAMEL|PALL MALL|DAVIDOFF|CHESTERFIELD|PARLIAMENT|\bVOGUE\b|\bKENT\b|DUNHILL|LUCKY STRIKE|\bWEST\b|MORAVA|\bDRINA\b|CIGARE|IQOS|HEETS|TEREA|\bGLO\b|NEO STIK|DUVAN|TOBACCO|ELF ?BAR|VAPE|E-CIG|FILTER CIG|RIZLE/],
  ["gorivo",   /\bBMB\b|EVRO ?DIZEL|EURO ?DIESEL|\bDIZEL\b|DIESEL|G-DRIVE|BENZIN|\bTNG\b|AUTOGAS|AUTO GAS|\bLPG\b|MAXX ?MOTION|ADBLUE|EN ?590|\bEVRO ?PREMIUM\b/],
  ["kucaauto", /DR[ŽZ]A[ČC] ZA|[ŠS]RAF|\bTIPL|EKSER|SIJALIC|SILIKON|BATERIJA ZA (SUDOP|TU[ŠS]|LAVAB|KAD)|SLAVIN|BRISA[ČC] STAKLA|ANTIFRIZ|MOTORNO ULJE|TE[ČC]NOST ZA BRISA/],
  ["hemija",   /\bT\.? ?PAPIR|TOAL\.? ?PAP|DETERD[ŽZ]|\bDET\.|\bARIEL\b|PERSIL|\bBONUX\b|OMEKSIVA[CČ]|\bLENOR\b|\bDUEL\b|\bFAIRY\b|PRONTO|DOMESTOS|\bSAVO\b|\bARF\b|\bCIF\b|\bBREF\b|TOALET|\bWC\b|UBRUS|MARAMIC|MARAMIČ|SUN[ĐD]ER|SUNDJER|\bKRPA|VLA[ŽZ]\.? ?MAR|SAPUN|[ŠS]AMPON|GEL ZA TU[ŠS]|PASTA ZA ZUBE|COLGATE|[ČC]ETKICA|DEZODOR|\bDEO\b|NIVEA|BRIJA[ČC]|GILLETTE|PELENE|ULO[ŠS]CI|ULO[ŠS]AK|TAMPON|\bVATA\b|KESE ZA SME|SREDSTVO ZA/],
  ["alkohol",  ALCO_RE],
];

export const upper = s => latin(s).toUpperCase();
// prodajno mesto je ponekad samo šifra ("P200"), tada je ime firme korisnije
export const storeName = rc => { const st = String(rc.store || "").trim(); return st && !/^[A-Z]{0,3}[-\s]?\d{1,6}$/i.test(st) ? st : (rc.merchant || st); };
const r2 = n => Math.round(n * 100) / 100;

export function merchantKey(desc) {
  let s = upper(desc).replace(/\s+/g, " ").trim();
  s = s.replace(/^\d+\s*-\s*/, "");
  if (/^(PAYSPOT DOO|ALTA\s+GROUP)\*/.test(s)) s = s.replace(/^[^*]+\*/, "");
  else s = s.replace(/\s*\*.*$/, "");
  s = s.split(/ SRB\b| USA\b| IRL\b| CAN\b/)[0];
  s = s.replace(/ ZIRO RACUN.*$/, "").trim();
  return s || upper(desc);
}
export const groupKey = s => merchantKey(s).replace(/[\s.\-]/g, "");

function bestRule(rules, kind, textU) {
  let best = null;
  for (const r of rules) if (r.kind === kind && r.match && textU.includes(r.match) && (!best || r.match.length > best.match.length)) best = r;
  return best;
}

export function merchantCat(rules, text, amount) {
  const u = upper(text);
  if (/^BANKOMAT/.test(u)) return Math.abs(amount) % 1000 === 0 ? { cat: "gotovina", cash: true } : { cat: "provizije", label: "Provizija bankomata" };
  const r = bestRule(rules, "merchant", u);
  if (r) return { cat: r.cat, person: r.person || "", rule: r.match };
  for (const [c, re] of MERCHANT) if (re.test(u)) return { cat: c };
  return { cat: amount > 0 ? "priliv" : "nerazvrstano" };
}

export function itemCat(rules, name) {
  const u = upper(name);
  const r = bestRule(rules, "item", u);
  if (r) return { cat: r.cat, rule: r.match };
  for (const [c, re] of ITEM) if (re.test(u)) return { cat: c };
  return null;
}

const dayNum = d => Math.round(Date.parse(String(d).slice(0, 10) + "T00:00:00Z") / 864e5);

/*
 * state: { tx:[{id,d,t,a}], overrides:{id:{cat,person,pass}}, rules:[...], receipts:[...] }
 * Vraća listu stavki za prikaz. Svaka ima parts: [{cat, amount, person, items?}].
 */
export function derive(state) {
  const { tx = [], overrides = {}, rules = [], receipts = [] } = state;
  const rows = [...tx].sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));

  // 1. provizija za konverziju stranih plaćanja ide uz samu kupovinu
  const groups = {};
  for (const r of rows) if (r.a < 0 && !/^BANKOMAT/i.test(r.t)) (groups[r.d + "|" + upper(r.t)] ||= []).push(r);
  const merged = new Set(), feeOf = {};
  for (const g of Object.values(groups)) {
    if (g.length < 2) continue;
    const big = g.reduce((a, b) => (Math.abs(b.a) > Math.abs(a.a) ? b : a));
    for (const r of g) if (r !== big && Math.abs(r.a) < 200 && Math.abs(r.a) <= Math.abs(big.a) * 0.013) { merged.add(r.id); feeOf[big.id] = (feeOf[big.id] || 0) + r.a; }
  }

  // 2. bankovne stavke
  const bank = [];
  for (const r of rows) {
    if (merged.has(r.id)) continue;
    const fee = feeOf[r.id] || 0, amount = r2(r.a + fee);
    const auto = merchantCat(rules, r.t, r.a), ov = overrides[r.id];
    bank.push({
      type: "bank", id: r.id, d: r.d, t: r.t, name: merchantKey(r.t), amount, raw: r.a, fee,
      auto, ov, cat: ov ? ov.cat : auto.cat, person: ov ? ov.person || "" : auto.person || "",
      manual: !!ov, rule: auto.rule || null, label: auto.label || "", receipt: null,
    });
  }

  // 3. uparivanje računa i uplatnica koji nisu plaćeni gotovinom sa stavkom iz banke
  // "stanje" je zapis koliko imaš na neki dan, nije stavka
  const recs = receipts.filter(r => !META_CATS.has(r.cat)).sort((a, b) => (a.issued_at < b.issued_at ? -1 : 1));
  const taken = new Set();
  for (const rc of recs) {
    if (rc.payment === "gotovina" || rc.cat === "stednja") continue;
    const target = rc.refund ? Math.abs(rc.total) : -Math.abs(rc.total);
    const rd = dayNum(rc.issued_at);
    let best = null, bestGap = 99;
    for (const b of bank) {
      if (taken.has(b.id) || b.auto.cash) continue;
      if (Math.abs(b.raw - target) > 0.01 && Math.abs(b.amount - target) > 0.01) continue;
      const gap = dayNum(b.d) - rd;
      // uplata upisana ručno može da legne na račun i nekoliko dana kasnije
      if (rc.refund ? gap < -5 || gap > 10 : gap < -1 || gap > 4) continue;
      if (Math.abs(gap) < bestGap) { best = b; bestGap = Math.abs(gap); }
    }
    if (best) { taken.add(best.id); best.receipt = rc; rc._matched = best.id; } else rc._matched = null;
  }

  const out = [];
  for (const e of bank) {
    e.parts = bankParts(e, rules);
    out.push(e);
  }

  // 4. računi bez para u banci: gotovina, ili kartica čiji izvod još nije ubačen
  for (const rc of recs) {
    if (rc._matched) continue;
    const d = String(rc.issued_at).slice(0, 10);
    const sign = rc.refund ? 1 : -1;
    const amount = sign * Math.abs(rc.total);
    const title = rc.kind === "ips" ? (rc.merchant || "Uplatnica") : rc.kind === "manual" ? (rc.merchant || "Ručni unos") : (storeName(rc) || "Račun");
    const base = rc.cat || receiptBaseCat(rules, rc);
    const e = {
      type: "receipt", id: "r:" + rc.id, d, t: title, name: upper(title), amount, receipt: rc,
      cash: rc.payment === "gotovina", pending: rc.payment !== "gotovina",
      cat: base, person: rc.person || "", manual: !!rc.cat,
    };
    if (base === "stednja") { e.cash = true; e.pending = false; e.t = e.name = rc.refund ? "Iz kasice" : "U kasicu"; }
    e.parts = base === "prolazno" || base === "stednja"
      ? [{ cat: base, amount, person: rc.person || "" }]
      : itemParts(rules, rc.items || [], amount, base, sign);
    out.push(e);
  }
  out.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));
  return out;
}

function receiptBaseCat(rules, rc) {
  const name = [rc.merchant, rc.store].filter(Boolean).join(" ");
  const m = merchantCat(rules, name, -1);
  if (m.cat !== "nerazvrstano") return m.cat;
  if (rc.kind === "ips") return "racuni";
  return "nerazvrstano";
}

function bankParts(e, rules) {
  const ov = e.ov;
  if (e.cat === "prolazno") {
    const pass = ov && ov.pass ? Math.min(Math.abs(ov.pass), Math.abs(e.amount)) : null;
    if (pass !== null && pass < Math.abs(e.amount) - 0.005) {
      const sign = Math.sign(e.amount) || -1;
      const rest = e.auto.cat === "prolazno" ? (e.amount > 0 ? "priliv" : "nerazvrstano") : e.auto.cat;
      return [{ cat: "prolazno", amount: sign * pass, person: e.person }, { cat: rest, amount: r2(e.amount - sign * pass) }];
    }
    return [{ cat: "prolazno", amount: e.amount, person: e.person }];
  }
  if (e.receipt && e.receipt.kind === "fiscal" && (e.receipt.items || []).length) {
    return itemParts(rules, e.receipt.items, e.amount, e.cat, e.amount < 0 ? -1 : 1);
  }
  // ručni unos sa artiklima (npr. pijaca) uparen sa karticom
  if (e.receipt && e.receipt.kind === "manual" && (e.receipt.items || []).length && !e.ov) {
    return itemParts(rules, e.receipt.items, e.amount, e.receipt.cat || e.cat, e.amount < 0 ? -1 : 1);
  }
  if (e.receipt && e.receipt.cat && !e.ov) return [{ cat: e.receipt.cat, amount: e.amount, person: e.receipt.person || "" }];
  return [{ cat: e.cat, amount: e.amount, person: e.person }];
}

const STRONG = new Set(["cigarete", "alkohol", "gorivo"]);
// raspodela iznosa po artiklima; artikli bez posebne kategorije idu u osnovnu
function itemParts(rules, items, amount, base, sign) {
  if (!items.length) return [{ cat: base, amount }];
  const by = new Map();
  let covered = 0;
  for (const it of items) {
    const ic = itemCat(rules, it.name);
    // u radnji za kuću i auto sve je kuća i auto (držač za toalet papir nije kućna hemija),
    // osim cigareta, alkohola i goriva, i osim tvog pravila za artikal
    // u kafiću je i piće iz kafića izlazak (osim cigareta)
    const keep = ic && !ic.rule && ((base === "kucaauto" && !STRONG.has(ic.cat)) || (base === "izlasci" && ic.cat !== "cigarete"));
    const cat = ic && !keep ? ic.cat : base;
    const val = sign * Math.abs(it.total);
    covered += val;
    if (!by.has(cat)) by.set(cat, { cat, amount: 0, items: [] });
    const p = by.get(cat); p.amount = r2(p.amount + val); p.items.push({ ...it, cat, rule: ic && ic.rule });
  }
  const rest = r2(amount - covered);
  if (Math.abs(rest) >= 0.01) {
    if (!by.has(base)) by.set(base, { cat: base, amount: 0, items: [] });
    by.get(base).amount = r2(by.get(base).amount + rest);
  }
  return [...by.values()].filter(p => Math.abs(p.amount) >= 0.005 || p.items.length);
}

/* Zbirovi za period. Gotovina se umanjuje za račune plaćene gotovinom. */
// stalni mesečni troškovi: računi (i porez) i pretplate; mogu da se izostave iz prosečne potrošnje
export const FIXED = new Set(["racuni", "pretplate", "porez"]);
// skip: kategorije koje se ne računaju u potrošnju (gotovina plaćena za njih i dalje objašnjava podignut novac)
export function totals(list, skip = null) {
  const by = {}; let bankSpend = 0, inc = 0, W = 0, C = 0, Ck = 0, feeConv = 0, Sdep = 0, Snet = 0;
  const add = (cat, v) => { (by[cat] ||= { sum: 0, n: 0 }); by[cat].sum = r2(by[cat].sum + v); by[cat].n++; };
  for (const e of list) {
    if (e.fee) feeConv += -e.fee;
    for (const p of e.parts) {
      const c = CAT[p.cat] || CAT.nerazvrstano;
      if (p.cat === "gotovina") { W += -p.amount; continue; }
      // gotovina stavljena u kasicu nije potrošena; uzeta iz kasice vraća se u ono što imaš
      if (p.cat === "stednja") { Snet += -p.amount; if (p.amount < 0) Sdep += -p.amount; continue; }
      if (skip && c.kind === "spend" && skip.has(c.id)) { if (e.cash) Ck += -p.amount; continue; }
      add(c.id, p.amount);
      if (c.kind === "spend") { if (e.cash) C += -p.amount; else bankSpend += -p.amount; }
      if (p.amount > 0 && (e.type === "bank" ? c.kind !== "pass" : c.kind === "income")) inc += p.amount;
    }
  }
  const nWithdrawals = list.filter(e => e.parts.some(p => p.cat === "gotovina")).length;
  const unexplained = Math.max(0, r2(W - C - Ck - Sdep));
  if (unexplained > 0) { by.gotovina = { sum: -unexplained, n: nWithdrawals }; }
  const spend = r2(bankSpend + C + unexplained);
  return { by, spend, inc: r2(inc), withdrawn: r2(W), cashReceipts: r2(C), unexplained, feeConv: r2(feeConv), saved: r2(Snet) };
}

/*
 * Koliko imaš: poslednje upisano stanje, plus uplate i minus potrošnja posle tog trenutka.
 * Prolazni novac i prenosi između tvojih računa ne menjaju stanje. Podignuta gotovina se računa
 * kao potrošena, isto kao u pregledu potrošnje.
 */
export function balance(receipts, list) {
  const st = receipts.filter(r => r.cat === "stanje").sort((a, b) => String(a.issued_at).localeCompare(String(b.issued_at)) || String(a.created_at || "").localeCompare(String(b.created_at || ""))).pop();
  if (!st) return null;
  const d0 = String(st.issued_at).slice(0, 10), at = String(st.created_at || st.issued_at);
  // posle dana stanja; istog dana samo ono što je upisano posle stanja
  // (i račun koji je kasnije uparen sa izvodom istog dana: vreme upisa se gleda na računu)
  const after = list.filter(e => e.d > d0 || (e.d === d0 && e.receipt && String(e.receipt.created_at || "") > at));
  const T = totals(after);
  return { start: Number(st.total), d0, row: st, inc: T.inc, spend: T.spend, saved: T.saved, now: r2(Number(st.total) + T.inc - T.spend - T.saved), n: after.length };
}

export function stableId(d, t, a, occ) {
  let h = 5381; const s = `${d}|${t}|${Number(a).toFixed(2)}|${occ}`;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return d.replace(/-/g, "") + h.toString(36);
}

/* Kasica: koliko je ušteđeno ukupno, cilj i istorija (najnovije prvo). */
export function savings(receipts) {
  const rows = receipts.filter(r => r.cat === "stednja").sort((a, b) => String(b.issued_at).localeCompare(String(a.issued_at)) || String(b.created_at || "").localeCompare(String(a.created_at || "")));
  const total = r2(rows.reduce((s, r) => s + (r.refund ? -1 : 1) * Math.abs(Number(r.total) || 0), 0));
  const g = receipts.filter(r => r.cat === "cilj").sort((a, b) => String(a.created_at || a.issued_at).localeCompare(String(b.created_at || b.issued_at))).pop();
  const goal = g && Number(g.total) > 0 ? { name: g.merchant || "", amount: Number(g.total), row: g } : null;
  return { total, rows, goal, left: goal ? Math.max(0, r2(goal.amount - total)) : 0, pct: goal ? Math.min(100, Math.round(total / goal.amount * 100)) : 0 };
}

/*
 * Razlika u stanju: kad upišeš novo stanje, app uporedi koliko je očekivao (prethodno stanje,
 * plus uplate, minus potrošnja između dva upisa) sa onim što si upisao. Ako imaš manje nego što je
 * očekivao, razlika je potrošnja koju nisi zabeležio; ako imaš više, priliv koji nisi zabeležio.
 * Računa se svaki put iznova, pa se smanji sama kad kasnije ubaciš izvod ili upišeš stavke.
 */
const fmt0 = n => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(n);
export function stanjeGaps(receipts, list) {
  const at = r => String(r.created_at || r.issued_at || "");
  const st = receipts.filter(r => r.cat === "stanje").sort((a, b) => String(a.issued_at).localeCompare(String(b.issued_at)) || at(a).localeCompare(at(b)));
  const out = [];
  for (let i = 1; i < st.length; i++) {
    const a = st[i - 1], b = st[i];
    const da = String(a.issued_at).slice(0, 10), db = String(b.issued_at).slice(0, 10), ta = at(a), tb = at(b);
    const between = list.filter(e => {
      const t = e.receipt ? String(e.receipt.created_at || "") : "";
      const afterA = e.d > da || (e.d === da && !!e.receipt && t > ta);
      const beforeB = e.d < db || (e.d === db && (!e.receipt || t < tb));
      return afterA && beforeB;
    });
    // ispravka greške u kucanju istog dana, bez ičega između: nije razlika
    if (!between.length && da === db) continue;
    const T = totals(between);
    const expected = r2(Number(a.total) + T.inc - T.spend - T.saved);
    const gap = r2(expected - Number(b.total));
    if (Math.abs(gap) < 1) continue;
    const cat = gap > 0 ? "nezabelezeno" : "priliv";
    out.push({
      type: "gap", id: "gap:" + b.id, d: db, t: "RAZLIKA U STANJU", name: gap > 0 ? "Nezabeležena potrošnja" : "Nezabeležen priliv",
      amount: -gap, receipt: null, cash: false, manual: false, cat, person: "",
      label: `razlika u stanju: app je očekivao ${fmt0(expected)}, upisao si ${fmt0(Number(b.total))}`,
      parts: [{ cat, amount: -gap }],
    });
  }
  return out;
}
