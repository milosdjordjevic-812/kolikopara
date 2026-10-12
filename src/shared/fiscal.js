// Čitanje fiskalnih računa (SUF, Poreska uprava Srbije) i IPS uplatnica.
// Čiste funkcije, koriste ih i server (api/receipt.js) i app.

const CYR = {А:"A",Б:"B",В:"V",Г:"G",Д:"D",Ђ:"Đ",Е:"E",Ж:"Ž",З:"Z",И:"I",Ј:"J",К:"K",Л:"L",Љ:"Lj",М:"M",Н:"N",Њ:"Nj",О:"O",П:"P",Р:"R",С:"S",Т:"T",Ћ:"Ć",У:"U",Ф:"F",Х:"H",Ц:"C",Ч:"Č",Џ:"Dž",Ш:"Š",
  а:"a",б:"b",в:"v",г:"g",д:"d",ђ:"đ",е:"e",ж:"ž",з:"z",и:"i",ј:"j",к:"k",л:"l",љ:"lj",м:"m",н:"n",њ:"nj",о:"o",п:"p",р:"r",с:"s",т:"t",ћ:"ć",у:"u",ф:"f",х:"h",ц:"c",ч:"č",џ:"dž",ш:"š"};
export const latin = s => String(s ?? "").replace(/[Ѐ-ӿ]/g, c => CYR[c] ?? c);

// "1.160,00" -> 1160, "-35,50" -> -35.5, "1,000" (kol.) -> 1
export function num(s) {
  let t = String(s ?? "").trim().replace(/\s/g, "");
  if (!t) return NaN;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  return parseFloat(t);
}

const decodeEntities = s => s
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d));

// Iz HTML stranice provere izvlači tekst samog računa (žurnal).
export function extractJournal(html) {
  const pres = [...String(html).matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/gi)].map(m => decodeEntities(m[1].replace(/<(?!br)[^>]+>/gi, "")));
  const hit = pres.find(p => /ФИСКАЛНИ|FISKALNI|=====/.test(p));
  if (hit) return hit;
  const text = decodeEntities(String(html).replace(/<(?!br)[^>]+>/gi, ""));
  const a = text.search(/=+\s*(ФИСКАЛНИ|FISKALNI)/);
  if (a < 0) return null;
  const b = text.search(/(КРАЈ ФИСКАЛНОГ РАЧУНА|KRAJ FISKALNOG RAČUNA)/);
  return text.slice(a, b > a ? b + 30 : a + 8000);
}

const PAY = [
  [/^GOTOVINA/, "gotovina"],
  [/^PLATNA KARTICA/, "kartica"],
  [/^PRENOS NA RA[ČC]UN/, "racun"],
  [/^INSTANT PLA[ĆC]ANJE/, "racun"],
  [/^VAU[ČC]ER/, "kartica"],
  [/^[ČC]EK/, "racun"],
  [/^DRUGO BEZGOTOVINSKO/, "kartica"],
];

const ROW3 = /(-?[\d.]+,\d{2})\s+(-?[\d.]+(?:,\d+)?)\s+(-?[\d.]+,\d{2})\s*$/;

function cleanName(s) {
  return latin(s)
    .replace(/\s*\((?:[A-ZА-Ш]|[ĐŽĆČŠ])\)\s*$/u, "")      // oznaka poreske stope, npr. (Đ)
    .replace(/\s+/g, " ").trim();
}

// Tekst računa -> struktura.
export function parseJournal(journal) {
  const lines = String(journal).replace(/\r/g, "").split("\n");
  const L = lines.map(l => latin(l).toUpperCase());
  const val = re => { const i = L.findIndex(l => re.test(l)); return i < 0 ? "" : latin(lines[i].split(":").slice(1).join(":")).trim(); };

  const out = { merchant: "", store: "", issuedAt: null, total: NaN, payment: null, payments: {}, refund: false, sale: true, items: [] };
  out.merchant = val(/^\s*PREDUZE[ĆC]E\s*:/);
  out.store = val(/^\s*MESTO PRODAJE\s*:/);
  // pravi računi često nemaju oznake: posle naslova idu PIB, preduzeće, prodajno mesto, adresa, grad
  if (!out.merchant && !out.store) {
    const h = L.findIndex(l => /FISKALNI RA[ČC]UN/.test(l));
    const end = L.findIndex((l, i) => i > h && (/:/.test(l) || /^-{4,}/.test(l.trim())));
    const head = lines.slice(h + 1, end > h ? end : h + 6).map(l => latin(l).trim()).filter(Boolean).filter(l => !/^\d{8,9}$/.test(l));
    if (h >= 0 && head.length) {
      out.merchant = head[0] || "";
      out.store = (head[1] || "").replace(/^[\d-]+\s*-\s*/, "").trim();
    }
  }

  const t = L.find(l => /PFR VREME\s*:/.test(l)) || L.find(l => /\d{2}\.\d{2}\.\d{4}\.?\s+\d{1,2}:\d{2}/.test(l));
  if (t) {
    const m = t.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\.?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) out.issuedAt = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T${m[4].padStart(2, "0")}:${m[5]}:${m[6] || "00"}`;
  }

  const kind = L.find(l => /PROMET|PREDRA[ČC]UN|KOPIJA|OBUKA/.test(l)) || "";
  out.refund = /REFUNDACIJA/.test(kind);
  out.sale = !/PREDRA[ČC]UN|KOPIJA|OBUKA/.test(kind);

  const ti = L.findIndex(l => /UKUPAN IZNOS\s*:/.test(l));
  if (ti >= 0) {
    out.total = num(L[ti].split(":").pop());
    for (let i = ti + 1; i < L.length && !/^=+$/.test(L[i].trim()); i++) {
      const [label, amount] = [L[i].split(":")[0].trim(), L[i].split(":").slice(1).join(":")];
      const hit = PAY.find(([re]) => re.test(label));
      if (hit) out.payments[hit[1]] = (out.payments[hit[1]] || 0) + num(amount);
      if (/^POVRA[ĆC]AJ/.test(label) && out.payments.gotovina) out.payments.gotovina -= num(amount);
    }
    const best = Object.entries(out.payments).sort((a, b) => b[1] - a[1])[0];
    out.payment = best ? best[0] : null;
  }

  // artikli: od zaglavlja "Naziv ... Ukupno" do linije sa crticama ispred ukupnog iznosa
  const hi = L.findIndex(l => /NAZIV/.test(l) && /UKUPNO/.test(l));
  if (hi >= 0) {
    let name = [];
    for (let i = hi + 1; i < lines.length; i++) {
      const raw = lines[i], up = L[i];
      if (/^-{6,}|^={6,}/.test(up.trim()) || /UKUPAN IZNOS/.test(up)) break;
      const m = raw.match(ROW3);
      if (m) {
        const before = raw.slice(0, m.index).trim();
        if (before) name.push(before);
        const item = { name: cleanName(name.join(" ")), price: num(m[1]), qty: num(m[2]), total: num(m[3]) };
        if (item.name && isFinite(item.total)) out.items.push(item);
        name = [];
      } else if (raw.trim()) name.push(raw.trim());
    }
  }
  if (out.refund) { out.items.forEach(it => { it.total = -Math.abs(it.total) }); }
  return out;
}

// IPS QR (NBS standard): K:PR|V:01|C:1|R:...|N:...|I:RSD1234,56|SF:...|S:...|RO:...
export function parseIps(text) {
  const s = String(text || "").trim();
  if (!/^K:(PR|PT|PK|EK)\|/.test(s)) return null;
  const f = {};
  for (const part of s.split("|")) { const i = part.indexOf(":"); if (i > 0) f[part.slice(0, i)] = part.slice(i + 1); }
  const amount = f.I ? num(f.I.replace(/^[A-Z]{3}/, "")) : NaN;
  return {
    type: f.K, account: f.R || "", name: (f.N || "").replace(/\r?\n/g, ", ").trim(),
    amount, currency: f.I ? f.I.slice(0, 3) : "RSD",
    purpose: f.S || "", code: f.SF || "", reference: f.RO || "", payer: (f.P || "").replace(/\r?\n/g, ", ").trim()
  };
}

// Link fiskalnog računa iz QR koda, u jednom obliku. Prihvata i link bez https, sa velikim slovima
// u adresi i sa nevidljivim znakovima oko teksta. Parametar vl (potpisan sadržaj računa) ostaje netaknut.
export function fiscalUrl(s) {
  const t = String(s || "").replace(/[\u0000-\u001f\u007f\u200b\ufeff]/g, "").trim();
  const m = t.match(/suf\.purs\.gov\.rs\/v\/?\?(?:[^#\s]*?&)?vl=([A-Za-z0-9%+/=_\-]{40,})/i);
  return m ? "https://suf.purs.gov.rs/v/?vl=" + m[1] : null;
}
export const isFiscalUrl = s => !!fiscalUrl(s);
