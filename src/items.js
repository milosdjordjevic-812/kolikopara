// Korpa: šta je kupljeno, po vrstama artikala, sa svih računa. Bez DOM-a, da može da se testira.
// Vrsta artikla je odvojena od kategorije troška: voda kupljena na pumpi je i dalje "voda i sokovi",
// a trošak ostaje "na pumpi". Cigarete, alkohol, gorivo i hemija menjaju i kategoriju (vidi ITEM u logic.js).
import { upper, itemCat, storeName, ALCO_RE } from "./logic.js";

// redosled je važan: prvo ono što bi se pomešalo (tečni sapun "med mleko" je hemija, ne mleko)
export const GROUPS = [
  { id: "cigarete", name: "Cigarete", icon: "cigarete", unit: ["paklica", "paklice", "paklica"],
    re: /MARLBORO|ROTHMANS|WINSTON|\bLD\b|CAMEL|PALL MALL|DAVIDOFF|CHESTERFIELD|PARLIAMENT|\bVOGUE\b|\bKENT\b|DUNHILL|LUCKY STRIKE|\bWEST\b|MORAVA|\bDRINA\b|CIGARE|IQOS|HEETS|TEREA|NEO STIK|DUVAN|TOBACCO|RIZLE/ },
  { id: "gorivo", name: "Gorivo", icon: "gorivo", unit: ["litar", "litra", "litara"], weight: "l",
    re: /\bBMB\b|EVRO ?DIZEL|EURO ?DIESEL|\bDIZEL\b|DIESEL|G-DRIVE|BENZIN|\bTNG\b|AUTOGAS|AUTO GAS|\bLPG\b|MAXX ?MOTION|EVRO ?PREMIUM/ },
  { id: "kucaauto", name: "Kuća i auto, materijal", icon: "kucaauto",
    re: /DR[ŽZ]A[ČC]|NOSA[ČC]|KUKIC|\bKUKA\b|[ŠS]RAF|\bTIPL|EKSER|VIJAK|SIJALIC|LED ?SIJ|SILIKON|BATERIJA ZA (SUDOP|TU[ŠS]|LAVAB|KAD)|SLAVIN|SIFON|BRISA[ČC]|METLIC[EA] BRIS|[ČC]ISTA[ČC] STAKLA \d|RUKAVICE|PRODU[ŽZ]N|\bKABL|UTI[ČC]NIC|PREKIDA[ČC]|LEPAK|LEPLJIV|IZOLIR|\bTRAKA\b|FARBA|BOJA ZA (ZID|DRVO|METAL)|VALJAK|[ČC]ETKA ZA|[ŠS]MIRGL|ODVIJA[ČC]|KLE[ŠS]TA|[ČC]EKI[ĆC]|BURGIJ|MERDEVIN|OTIRA[ČC]|\bKANTA|\bCREVO|ANTIFRIZ|MOTORNO ULJE|ULJE ZA MOTOR|TE[ČC]NOST ZA (STAKLA|BRISA)|OSIGURA[ČC]|\bALAT|KATANAC|\bBRAVA|CILINDAR|ZAPTIV|ŠARKA|SARKA/ },
  { id: "hemija", name: "Deterdžent i kućna hemija", icon: "hemija",
    re: /DETERD[ŽZ]|\bDET\.|\bARIEL\b|PERSIL|\bBONUX\b|OMEKSIVA[CČ]|\bLENOR\b|\bDUEL\b|\bFAIRY\b|PRONTO|DOMESTOS|\bSAVO\b|\bARF\b|\bCIF\b|\bBREF\b|TOALET (GEL|SREDSTVO|BLOK|OSVE)|WC (GEL|SREDSTVO|BLOK|OSVE)|UBRUS|SUN[ĐD]ER|SUNDJER|\bKRPA|KESE ZA SME|SREDSTVO ZA/ },
  { id: "higijena", name: "Higijena i kozmetika", icon: "apoteka",
    re: /\bT\.? ?PAPIR|TOAL\.? ?PAP|TOALET ?PAP|PAPIRNE? MARAM|SALVET|MARAMIC|MARAMIČ|VLA[ŽZ]\.? ?MAR|SAPUN|[ŠS]AMPON|GEL ZA TU[ŠS]|PASTA ZA ZUBE|COLGATE|[ČC]ETKICA|DEZODOR|\bDEO\b|NIVEA|BRIJA[ČC]|GILLETTE|PELENE|ULO[ŠS]CI|ULO[ŠS]AK|TAMPON|\bVATA\b|KREMA ZA|LOSION/ },
  { id: "alkohol", name: "Pivo, vino i žestina", icon: "alkohol",
    re: ALCO_RE },
  { id: "slatkisi", name: "Slatkiši i grickalice", icon: "slatkis",
    re: /[ČC]OKOL|CHOCO|MILKA|KINDER|NUTELLA|SNICKERS|\bMARS\b|TWIX|BOUNTY|KIT ?KAT|BANANICA|NAPOLITANK|KEKS|BISKVIT|PLAZMA|JAFFA|SMOKI|[ČC]IPS|CHIPS|PRINGLES|FLIPS|KIKIRIKI|BOMBON|[ŽZ]VAK|ORBIT|SLADOLED|TORTA|KOLA[ČC]|VAFL|WAFFL|GUMENE|LIZALICA|RONDO|MENTOS|TIC ?TAC|STARK|SWISSLION|PRALIN/ },
  { id: "pice", name: "Voda, sokovi i kafa", icon: "pice",
    re: /VODA|\bROSA\b|KNJAZ|MINERAL|\bSOK\b|NEKTAR|COCA|\bCOLA\b|PEPSI|FANTA|SPRITE|SCHWEPPES|ENERGET|RED ?BULL|MONSTER|GUARANA|NESTEA|LEDENI [ČC]AJ|\bKAFA\b|COFFEE|ESPRESSO|NESCAFE|CAPPUCC|\b[ČC]AJ\b|LIMUNADA/ },
  { id: "meso", name: "Meso, riba i delikates", icon: "meso",
    re: /\bPIL\.|GRUDI|NEOPLANTA|CARNEX|YUHOR|MATIJEVI[ĆC]|ZLATIBORAC|PERUTNINA|\bMESO|ME[ŠS]ANO|MLEVEN|\bPILE|PILE[ĆC]|PILET|[ĆC]URE|SVINJ|JUNE[ĆCT]|TELE[ĆCT]|KOBAS|SALAM|[ŠS]UNK|PR[ŠS]UT|SLANIN|PE[ČC]ENIC|HRENOV|PA[ŠS]TET|\bRIBA|TUNJ|LOSOS|[ŠS]KUS|DELIKATES|[ĆC]EVAP|PLJESKAV|KARABATAK|BATAK|FILE\b/ },
  { id: "mlecni", name: "Mleko, sir i jaja", icon: "mlecni",
    re: /MLEKO|MLE[ČC]N|JOGURT|KISELO|PAVLAK|\bSIR\b|MOCAREL|MOZZAREL|KAJMAK|MASLAC|PUTER|\bJAJA\b|KEFIR|GAUDA|TRAPIST|EDAMER|FETA|GR[ČC]KI|SKYR|PUDING/ },
  { id: "voce", name: "Voće i povrće", icon: "voce",
    re: /BANAN|JABUK|KRU[ŠS]K|NARAND|MANDARIN|LIMUN|GRO[ŽZ][ĐD]|JAGOD|LUBEN|DINJ|BRESK|KAJSIJ|[ŠS]LJIV|\bKIVI\b|ANANAS|AVOKAD|PARADAJZ|KRASTAV|PAPRIK|\bLUK\b|KROMPIR|[ŠS]ARGAREP|KUPUS|SALATA|ICEBERG|SPANA[ĆC]|TIKVIC|PATLID[ŽZ]|PE[ČC]URK|BROKOL|KARFIOL|RUKOL|PER[ŠS]UN|MIRO[ĐD]|CVEKL|[ĐD]UMBIR|BOROVNIC|MALIN/ },
  { id: "pekara", name: "Hleb i pecivo", icon: "pekara",
    re: /HLEB|BAGET|PECIVO|KIFL|KROASAN|CROISSANT|BUREK|\bPITA\b|LEPINJ|\bTOST\b|ZEMI[ČC]K|PERE[CČ]|GIBANIC|SENDVI[ČC]|KORE ZA|KORA ZA/ },
  { id: "namirnice", name: "Ostale namirnice", icon: "market",
    re: /TESTENIN|\bPASTA\b|[ŠS]PAGET|PIRINA[ČC]|\bRI[ŽZ]A\b|BRA[ŠS]NO|\bULJE\b|[ŠS]E[ĆC]ER|\bSO\b|ZA[ČC]IN|VEGETA|KE[ČC]AP|MAJONEZ|SENF|PELAT|KONZERV|PASULJ|GRA[ŠS]AK|KUKURUZ|MUSLI|OVSEN|PAHULJ|\bMED\b|D[ŽZ]EM|MARMELAD|SMRZNUT|PIZZA|\bSUPA\b|[ČC]ORBA|MARGARIN|KVASAC|ORAS|BADEM|LE[ŠS]NIK|SEMENK|KREM SIR|NAMAZ/ },
  { id: "kese", name: "Kese", icon: "kesa", re: /\bKESA\b|\bKESE\b/ },
];
export const GROUP = Object.fromEntries(GROUPS.map(g => [g.id, g]));
const OTHER = { id: "ostalo", name: "Ostalo sa računa", icon: "ostalo" };
// sve sa računa iz kafića (piće, hrana) je izlazak, osim cigareta
const CAFE = { id: "izlasci", name: "Kafić i izlazak", icon: "izlasci" };

// korisnikovo pravilo za artikal ima prednost, pa reči iz naziva; artikal koji se ne prepozna
// a kupljen je u radnji za kuću i auto ide u tu grupu
const BY_CAT = { cigarete: "cigarete", alkohol: "alkohol", gorivo: "gorivo", hemija: "hemija", kucaauto: "kucaauto" };
export function itemGroup(name, rules = [], baseCat = "") {
  const u = upper(name);
  const r = rules.length ? itemCat(rules, name) : null;
  if (r && r.rule && BY_CAT[r.cat]) return GROUP[BY_CAT[r.cat]];
  const g = GROUPS.find(x => x.re.test(u));
  if (baseCat === "kucaauto" && (!g || g.id === "hemija" || g.id === "higijena")) return GROUP.kucaauto;
  if (baseCat === "izlasci" && (!g || g.id !== "cigarete")) return CAFE;
  return g || OTHER;
}

// artikal na meru (kg ili litar) ili na komad
const isWeight = (name, g) => g.weight === "l" || /\/\s*KG\b|\bKG\b|\/\s*L\b/.test(upper(name));
// bez šifre artikla na početku ("426742 BATERIJA ZA SUDOPERU") i bez jedinice na kraju
const short = name => String(name).replace(/^\s*\d{4,8}\s+(?=\D)/, "").replace(/\s*\/\s*(KOM|KG|L|KOMAD)\s*$/i, "").replace(/\s+/g, " ").trim();

/*
 * Svi artikli iz liste stavki (izvedene stavke sa računima). Vraća grupe sa zbirom komada, kilograma
 * i dinara, i artikle u svakoj grupi spojene po imenu.
 */
export function basket(list, rules = []) {
  const groups = {};
  for (const e of list) {
    const rc = e.receipt; if (!rc || !(rc.items || []).length) continue;
    const store = storeName(rc) || e.name;
    const base = rc.cat || e.cat || "";
    for (const it of rc.items) {
      const total = Math.abs(it.total || 0); if (!total) continue;
      const g = itemGroup(it.name, rules, base), w = isWeight(it.name, g), qty = Math.abs(it.qty || 1);
      const G = (groups[g.id] ||= { ...g, items: {}, pieces: 0, weight: 0, sum: 0, buys: 0 });
      const key = upper(short(it.name));
      const I = (G.items[key] ||= { name: short(it.name), pieces: 0, weight: 0, sum: 0, stores: new Set(), last: "", w });
      if (w) { G.weight += qty; I.weight += qty; } else { G.pieces += qty; I.pieces += qty; }
      G.sum += total; I.sum += total; G.buys++;
      I.stores.add(store); if (e.d > I.last) I.last = e.d;
    }
  }
  return Object.values(groups).map(G => ({
    ...G, sum: Math.round(G.sum * 100) / 100,
    items: Object.values(G.items).map(I => ({ ...I, stores: [...I.stores], sum: Math.round(I.sum * 100) / 100 })).sort((a, b) => b.sum - a.sum),
  })).sort((a, b) => (a.id === "ostalo") - (b.id === "ostalo") || b.sum - a.sum);
}

// "5 paklica", "2,3 kg i 4 kom", "31,5 litara"
export function amountText(g) {
  const n = v => String(Math.round(v * 100) / 100).replace(".", ",");
  const plural = (v, [one, few, many]) => { if (Math.round(v * 100) % 100) return many; const i = Math.round(v); const d = i % 10, h = i % 100; return d === 1 && h !== 11 ? one : d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many; };
  const parts = [];
  if (g.pieces) parts.push(g.unit && !g.weight ? `${n(g.pieces)} ${plural(g.pieces, g.unit)}` : `${n(g.pieces)} kom`);
  if (g.weight) parts.push(g.unit && g.id === "gorivo" ? `${n(g.weight)} ${plural(g.weight, g.unit)}` : `${n(g.weight)} kg`);
  return parts.join(" i ");
}
