// Čitanje izvoda iz e-bankinga (CSV ili Excel) u redove {d, t, a}.
import { stableId } from "./logic.js";

let xlsxReady = null;
function loadXlsx() {
  if (window.XLSX) return Promise.resolve();
  if (!xlsxReady) xlsxReady = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = () => res(); s.onerror = () => { xlsxReady = null; rej(new Error("xlsx")); };
    document.head.appendChild(s);
  });
  return xlsxReady;
}

export function parseCSV(text) {
  const first = text.split(/\r?\n/).find(l => l.trim()) || "";
  const delim = [";", "\t", ",", "|"].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (ch !== "\r") cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim()));
}

export function parseDate(v) {
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 864e5).toISOString().slice(0, 10);
  const s = String(v || "").trim();
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

export function parseAmt(v) {
  if (typeof v === "number") return v;
  let s = String(v || "").replace(/\s|RSD|din\.?/gi, "").replace(/−/g, "-");
  if (!s) return NaN;
  const neg = /^\(.*\)$/.test(s); s = s.replace(/[()]/g, "");
  const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
  if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (lc > -1) s = s.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  else if (ld > -1 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = parseFloat(s); return neg ? -n : n;
}

const guess = (headers, res) => headers.findIndex(h => res.some(r => r.test(String(h).toLowerCase())));

export async function readStatement(file) {
  let grid;
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    await loadXlsx();
    const wb = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
    grid = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
  } else {
    let text = await file.text();
    if (text.includes("�")) { try { text = new TextDecoder("windows-1250").decode(await file.arrayBuffer()); } catch (_) {} }
    grid = parseCSV(text);
  }
  let h = 0;
  for (let i = 0; i < Math.min(grid.length, 40); i++) if (grid[i].some(c => parseDate(c))) { h = Math.max(0, i - 1); break; }
  const headers = grid[h].map((c, i) => String(c).trim() || "Kolona " + (i + 1));
  const map = {
    date: guess(headers, [/datum/, /date/, /valuta/]),
    desc: guess(headers, [/opis/, /naziv/, /primalac/, /korisnik/, /description/, /trgovac/, /svrha/]),
    desc2: -1,
    amount: guess(headers, [/^iznos/, /amount/]),
    debit: guess(headers, [/isplat/, /duguje/, /zadu/, /debit/, /rashod/]),
    credit: guess(headers, [/uplat/, /potra/, /odobr/, /credit/, /prihod/]),
  };
  if (map.debit > -1 && map.credit > -1) map.amount = -1;
  return { name: file.name, headers, body: grid.slice(h + 1), map };
}

export function rowsFrom(imp) {
  const m = imp.map, out = [], occ = {};
  for (const r of imp.body) {
    const d = parseDate(r[m.date]); if (!d) continue;
    let t = String(r[m.desc] ?? "").trim();
    if (m.desc2 > -1) { const t2 = String(r[m.desc2] ?? "").trim(); if (t2) t = t ? t + " " + t2 : t2; }
    let a;
    if (m.amount > -1) a = parseAmt(r[m.amount]);
    else a = Math.abs(parseAmt(r[m.credit]) || 0) - Math.abs(parseAmt(r[m.debit]) || 0);
    if (!isFinite(a) || a === 0 || !t) continue;
    a = Math.round(a * 100) / 100;
    const k = `${d}|${t}|${a.toFixed(2)}`; occ[k] = (occ[k] || 0) + 1;
    out.push({ id: stableId(d, t, a, occ[k]), d, t, a });
  }
  return out;
}
