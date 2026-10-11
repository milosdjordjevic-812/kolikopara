// Vercel funkcija: prima link iz QR koda fiskalnog računa, otvara stranu
// Poreske uprave i vraća pročitan račun (prodavac, datum, iznos, plaćanje, artikli).
import { extractJournal, parseJournal, isFiscalUrl, latin } from "../src/shared/fiscal.js";

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

async function trySpecifications(html, cookie) {
  // Strana provere uz račun ima i spisak artikala koji se učitava posebno.
  const inv = html.match(/InvoiceNumber\(\s*['"]([^'"]+)['"]/i) || html.match(/invoiceNumber["']?\s*[:=]\s*["']([^"']+)["']/i);
  const tok = html.match(/Token\(\s*['"]([^'"]+)['"]/i) || html.match(/token["']?\s*[:=]\s*["']([^"']+)["']/i);
  if (!inv || !tok) return null;
  try {
    const r = await fetch("https://suf.purs.gov.rs/specifications", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "user-agent": UA, "x-requested-with": "XMLHttpRequest", ...(cookie ? { cookie } : {}) },
      body: new URLSearchParams({ invoiceNumber: inv[1], token: tok[1] }).toString(),
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || !j.success || !Array.isArray(j.items)) return null;
    return j.items.map(it => ({
      name: latin(it.name || "").replace(/\s+/g, " ").trim(),
      price: Number(it.unitPrice), qty: Number(it.quantity), total: Number(it.total),
    })).filter(it => it.name && isFinite(it.total));
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Samo POST." });
  const url = String((req.body && req.body.url) || "").trim();
  if (!isFiscalUrl(url)) return res.status(400).json({ error: "Ovo nije link fiskalnog računa." });

  let html, cookie = "";
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, "accept-language": "sr-RS,sr;q=0.9" }, redirect: "follow" });
    if (!r.ok) return res.status(502).json({ error: `Poreska uprava je vratila grešku ${r.status}. Probaj ponovo za minut.` });
    cookie = (r.headers.get("set-cookie") || "").split(/,(?=[^ ;]+=)/).map(c => c.split(";")[0]).join("; ");
    html = await r.text();
  } catch {
    return res.status(502).json({ error: "Strana Poreske uprave se nije otvorila. Probaj ponovo za minut." });
  }

  const journal = extractJournal(html);
  if (!journal) return res.status(422).json({ error: "Račun je otvoren, ali tekst računa nije pronađen na strani." });

  const parsed = parseJournal(journal);
  const spec = await trySpecifications(html, cookie);
  if (spec && spec.length) {
    const sum = spec.reduce((s, i) => s + i.total, 0);
    // koristi strukturisan spisak kad se slaže sa ukupnim iznosom
    if (!parsed.items.length || Math.abs(sum - Math.abs(parsed.total)) < 0.05) {
      parsed.items = parsed.refund ? spec.map(i => ({ ...i, total: -Math.abs(i.total) })) : spec;
    }
  }
  if (!isFinite(parsed.total)) return res.status(422).json({ error: "Na računu nije pronađen ukupan iznos." });
  return res.status(200).json({ ...parsed, journal });
}
