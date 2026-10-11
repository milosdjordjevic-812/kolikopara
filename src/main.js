import "./style.css";
import { sb, configured, loadAll, saveOverride, deleteOverride, saveRule, deleteRule, insertReceipt, updateReceipt, deleteReceipt, replaceBankRange, importBackup, exportBackup } from "./db.js";
import { CATS, CAT, catName, derive, totals, merchantKey, groupKey, merchantCat, itemCat, upper } from "./logic.js";
import { parseIps, isFiscalUrl } from "./shared/fiscal.js";
import { startCamera, decodeFile } from "./scan.js";
import { readStatement, rowsFrom, parseAmt } from "./importer.js";

/* ---------- pomoćne ---------- */
const nf0 = new Intl.NumberFormat("sr-Latn-RS", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("sr-Latn-RS", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n, dec) => (dec ? nf2 : nf0).format(Math.abs(n || 0));
const signed = (n) => (n > 0 ? "+" : "-") + money(n, true);
const MONFULL = ["januar","februar","mart","april","maj","jun","jul","avgust","septembar","oktobar","novembar","decembar"];
const DOW = ["ned","pon","uto","sre","čet","pet","sub"];
const dParts = s => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return { y, m, d }; };
const dShort = s => { const p = dParts(s); return String(p.d).padStart(2, "0") + "." + String(p.m).padStart(2, "0") + "."; };
const dDay = s => { const p = dParts(s); return DOW[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()] + " " + dShort(s) + p.y; };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const stavki = n => { const d = n % 10, h = n % 100; return n + " " + (d === 1 && h !== 11 ? "stavka" : (d >= 2 && d <= 4 && (h < 12 || h > 14)) ? "stavke" : "stavki"); };
const puta = n => n + " " + (n % 10 === 1 && n % 100 !== 11 ? "put" : "puta");
const PAYNAME = { gotovina: "Gotovina", kartica: "Kartica", racun: "Sa računa" };
const ICON_SCAN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 8V4h4M17 4h4v4M21 16v4h-4M7 20H3v-4"/><path d="M8 12h8"/></svg>`;

const S = {
  session: null, ready: false, loadError: null,
  data: { tx: [], overrides: {}, rules: [], receipts: [] },
  view: "pregled", period: null, cat: null, q: "",
  sheet: null, scan: null, imp: null, busy: false,
};
const app = document.getElementById("app");
const layer = document.getElementById("layer");

let toastTimer;
function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3400);
}
async function guard(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r ?? true; }
  catch (e) { console.error(e); toast(e && e.code === "23505" ? "Ovo je već sačuvano." : "Nije sačuvano. Proveri internet i probaj ponovo."); return false; }
}

/* ---------- prijava ---------- */
function renderAuth(mode = "in", err = "") {
  app.innerHTML = `
  <div class="auth">
    <div class="logo">[koliko para]</div>
    <h2>${mode === "in" ? "Prijava" : "Novi nalog"}</h2>
    <form id="auth" class="map" style="grid-template-columns:1fr">
      <label class="field"><span class="meta dim">Email</span><input id="a-email" type="email" autocomplete="email" required></label>
      <label class="field"><span class="meta dim">Lozinka</span><input id="a-pass" type="password" autocomplete="${mode === "in" ? "current-password" : "new-password"}" minlength="8" required></label>
      ${err ? `<p class="err">${esc(err)}</p>` : ""}
      <div class="row-btns"><button class="btn" type="submit">${mode === "in" ? "Prijavi se" : "Napravi nalog"}</button>
      <button class="btn ghost" type="button" id="a-switch">${mode === "in" ? "Prvi put? Napravi nalog" : "Već imam nalog"}</button></div>
    </form>
  </div>`;
  document.getElementById("a-switch").onclick = () => renderAuth(mode === "in" ? "up" : "in");
  document.getElementById("auth").onsubmit = async ev => {
    ev.preventDefault();
    const email = document.getElementById("a-email").value.trim(), password = document.getElementById("a-pass").value;
    const { error } = mode === "in" ? await sb.auth.signInWithPassword({ email, password }) : await sb.auth.signUp({ email, password });
    if (error) renderAuth(mode, mode === "in" ? "Email ili lozinka nisu tačni." : (error.message.includes("not allowed") || error.message.includes("disabled") ? "Pravljenje novih naloga je isključeno." : "Nalog nije napravljen: " + error.message));
  };
}

/* ---------- podaci ---------- */
async function load() {
  try { S.data = await loadAll(); S.ready = true; S.loadError = null; }
  catch (e) { console.error(e); S.loadError = "Podaci se nisu učitali. Proveri internet."; }
  if (!S.period) { const ks = periods(); const cur = today().slice(0, 7); S.period = ks.includes(cur) ? cur : (ks[ks.length - 1] || "sve"); }
  render();
}
let cache = null;
function list() { if (!cache) cache = derive(S.data); return cache; }
function changed() { cache = null; render(); }
function periods() { return [...new Set(list().map(e => e.d.slice(0, 7)))].sort(); }
const inPeriod = e => S.period === "sve" || e.d.startsWith(S.period);
const lastBank = () => S.data.tx.reduce((m, r) => (r.d > m ? r.d : m), "");

/* ---------- okvir ---------- */
function render() {
  if (!configured) { app.innerHTML = `<div class="auth"><div class="logo">[koliko para]</div><h2>Fale podešavanja</h2><p class="lead">Nedostaju adresa i ključ Supabase baze. Dodaj ih u Vercel podešavanjima kao VITE_SUPABASE_URL i VITE_SUPABASE_ANON_KEY, pa ponovo objavi.</p></div>`; return; }
  if (!S.session) { renderAuth(); tabbar(false); return; }
  tabbar(true);
  if (!S.ready) { app.innerHTML = `<div class="top"><div class="logo">[koliko para]</div></div><div class="empty" style="margin-top:40px"><span class="meta dim">${esc(S.loadError || "Učitavam")}</span></div>`; return; }
  const v = { pregled: renderOverview, stavke: renderList, prolazno: renderPass, vise: renderMore }[S.view];
  v();
}
function header() {
  return `<div class="top"><div class="logo">[koliko para]</div><span class="meta dim">${S.view === "pregled" ? "" : esc(({ stavke: "Stavke", prolazno: "Prolazno", vise: "Više" })[S.view])}</span></div>${installHint()}`;
}
function tabbar(show) {
  let bar = document.querySelector(".tabbar");
  if (!show) { if (bar) bar.remove(); return; }
  if (!bar) {
    bar = document.createElement("nav"); bar.className = "tabbar"; bar.setAttribute("aria-label", "Delovi");
    document.body.appendChild(bar);
    bar.addEventListener("click", ev => {
      const t = ev.target.closest("[data-view]"); if (t) { S.view = t.dataset.view; if (S.view !== "stavke") S.cat = null; render(); window.scrollTo(0, 0); return; }
      if (ev.target.closest("[data-scan]")) openScan();
    });
  }
  const tab = (id, label) => `<button class="tab" data-view="${id}" ${S.view === id ? 'aria-current="page"' : ""}><span>${label}</span></button>`;
  bar.innerHTML = `<div class="tabbar-in">${tab("pregled", "Pregled")}${tab("stavke", "Stavke")}<button class="scanbtn" data-scan>${ICON_SCAN}Skeniraj</button>${tab("prolazno", "Prolazno")}${tab("vise", "Više")}</div>`;
}
function installHint() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  let dismissed = false; try { dismissed = localStorage.getItem("kp-install") === "1"; } catch (_) {}
  if (standalone || dismissed || !/iPhone|iPad|Android/i.test(navigator.userAgent)) return "";
  return `<div class="install"><span>Dodaj app na početni ekran: dugme <b>Podeli</b> u Safariju, pa <b>Dodaj na početni ekran</b>.</span><button class="chip" data-dismiss-install aria-label="Zatvori">×</button></div>`;
}
function periodChips() {
  const ks = periods(); if (!ks.length) return "";
  const chip = (id, label) => `<button class="chip" data-period="${id}" aria-pressed="${S.period === id}">${esc(label)}</button>`;
  return `<div class="periods">${ks.map(k => { const [y, m] = k.split("-"); return chip(k, MONFULL[+m - 1] + " " + y); }).join("")}${chip("sve", "Sve")}</div>`;
}

/* ---------- pregled ---------- */
function renderOverview() {
  const all = list();
  if (!all.length) {
    app.innerHTML = `${header()}<div class="empty" style="margin-top:40px"><span class="eyebrow">[prazno]</span><h2>Još nema stavki</h2><p class="lead">Skeniraj prvi račun dugmetom dole, ili u delu Više ubaci izvod iz e-bankinga ili rezervnu kopiju.</p></div>`;
    return;
  }
  const L = all.filter(inPeriod), T = totals(L);
  const ds = L.map(e => e.d).sort(), from = ds[0], to = ds[ds.length - 1];
  const span = from ? Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1 : 1;
  const cats = CATS.filter(c => c.kind === "spend" && T.by[c.id] && -T.by[c.id].sum > 0.004).map(c => ({ c, sum: -T.by[c.id].sum, n: T.by[c.id].n })).sort((a, b) => b.sum - a.sum);
  const max = cats.length ? cats[0].sum : 1;
  const unc = L.filter(e => e.parts.some(p => p.cat === "nerazvrstano")).length;
  const prov = T.by.provizije ? -T.by.provizije.sum : 0;
  const mer = {};
  for (const e of L) for (const p of e.parts) {
    const c = CAT[p.cat]; if (!c || c.kind !== "spend" || p.amount >= 0 || p.cat === "gotovina" || p.cat === "provizije") continue;
    const k = groupKey(e.t); (mer[k] ||= { name: e.name, sum: 0, n: new Set() }); mer[k].sum += -p.amount; mer[k].n.add(e.id);
  }
  const top = Object.values(mer).sort((a, b) => b.sum - a.sum).slice(0, 8);
  const lb = lastBank(), stale = lb && (Date.parse(today()) - Date.parse(lb)) / 864e5 > 10;
  const pending = L.filter(e => e.type === "receipt" && e.pending).length;

  app.innerHTML = `${header()}
  ${periodChips()}
  <div class="hero">
    <div><span class="eyebrow">[${from ? esc(dShort(from) + " do " + dShort(to) + to.slice(0, 4)) : ""}]</span></div>
    <span class="meta">Potrošeno</span>
    <h1 class="num">${money(T.spend)}<span class="rsd">RSD</span></h1>
    <p class="lead">Za ${span} ${span % 10 === 1 && span !== 11 ? "dan" : "dana"}, prosečno ${money(T.spend / span)} dinara dnevno. Prolazni novac i prebacivanje između tvojih računa nisu uračunati.</p>
  </div>
  <div class="strip">
    <div><span class="meta dim">Gotovina bez računa</span><span class="v num">${money(T.unexplained)}</span></div>
    <div><span class="meta dim">Ušlo na račun</span><span class="v num">${money(T.inc)}</span></div>
    <div><span class="meta dim">Banci, provizije</span><span class="v num">${money(prov + T.feeConv)}</span></div>
    <div><span class="meta dim">Čeka kategoriju</span><span class="v num">${stavki(unc)}</span></div>
  </div>
  ${unc ? `<p class="note"><button class="chip" aria-pressed="true" data-cat="nerazvrstano">Razvrstaj ${stavki(unc)}</button></p>` : ""}

  <section>
    <div class="sec-h"><h2>Na šta</h2><span class="meta dim">Dodirni red za stavke</span></div>
    <div class="rows">${cats.map(x => `
      <button class="crow" data-cat="${x.c.id}">
        <span class="name">${esc(x.c.name)}</span>
        <span class="amt num">${money(x.sum)}</span>
        <span class="bar"><i class="${x.c.id === "nerazvrstano" || x.c.id === "gotovina" ? "muted" : ""}" style="width:${(x.sum / max * 100).toFixed(1)}%"></i></span>
        <span class="meta dim num">${stavki(x.n)}, ${T.spend ? Math.round(x.sum / T.spend * 100) : 0}% potrošnje</span>
      </button>`).join("")}</div>
  </section>

  ${T.withdrawn > 0 ? `<section>
    <div class="sec-h"><h2>Gotovina</h2></div>
    <div class="strip" style="margin-top:0">
      <div><span class="meta dim">Podignuto</span><span class="v num">${money(T.withdrawn)}</span></div>
      <div><span class="meta dim">Objašnjeno računima</span><span class="v num">${money(T.cashReceipts)}</span></div>
      <div><span class="meta dim">Bez računa</span><span class="v num">${money(T.unexplained)}</span></div>
    </div>
    <p class="note">Kad platiš gotovinom, skeniraj račun. Iznos prelazi iz gotovine bez računa u pravu kategoriju.</p>
  </section>` : ""}

  <section>
    <div class="sec-h"><h2>Gde najviše</h2><span class="meta dim">Bez gotovine i provizija</span></div>
    <div class="rows">${top.map((m, i) => `
      <div class="mrow"><span class="nchip">${String(i + 1).padStart(2, "0")}</span><span class="name">${esc(m.name)}</span><span class="amt num">${money(m.sum)}</span><span class="meta dim">${puta(m.n.size)}</span></div>`).join("")}</div>
  </section>

  <section>
    <p class="note">${lb ? `Izvod iz banke je ubačen do ${dShort(lb)}${lb.slice(0, 4)}. ` : "Izvod iz banke još nije ubačen. "}${pending ? `${stavki(pending)} sa računa čeka izvod da bi se uparile. ` : ""}${stale || !lb ? `<button class="chip" aria-pressed="true" data-go="vise">Ubaci izvod</button>` : ""}</p>
  </section>`;
}

/* ---------- stavke ---------- */
function rowHtml(e) {
  const tags = e.parts.map(p => {
    const cls = p.cat === "prolazno" ? "pass" : p.cat === "nerazvrstano" ? "wait" : e.manual ? "man" : "";
    const extra = p.cat === "prolazno" && p.person ? " " + p.person : "";
    const part = e.parts.length > 1 ? " " + money(p.amount) : "";
    return `<span class="tag ${cls}">${esc(catName(p.cat) + extra + part)}</span>`;
  }).join("");
  const doc = e.receipt ? `<span class="tag doc">${e.receipt.kind === "ips" ? "Uplatnica" : e.receipt.kind === "manual" ? "Ručno" : "Račun"}${e.cash ? ", gotovina" : ""}</span>` : "";
  const info = [e.label, e.fee ? "uključena konverzija " + money(-e.fee, true) : "", e.pending ? "čeka izvod" : "", e.rule && !e.manual ? "pravilo: " + e.rule.toLowerCase() : ""].filter(Boolean).join(", ");
  return `<button class="trow" data-edit="${esc(e.id)}">
    <span class="name">${esc(e.name)}</span>
    <span class="amt num ${e.amount > 0 ? "plus" : ""}">${signed(e.amount)}</span>
    <span class="sub">${doc}${tags}${info ? `<span class="meta dim">${esc(info)}</span>` : ""}</span>
  </button>`;
}
function renderList() {
  const q = upper(S.q.trim());
  const L = list().filter(inPeriod).filter(e => (!S.cat || e.parts.some(p => p.cat === S.cat)) &&
    (!q || upper(e.t).includes(q) || upper(e.person || "").includes(q) || (e.receipt?.items || []).some(i => upper(i.name).includes(q))));
  const days = {}; for (const e of L) (days[e.d] ||= []).push(e);
  const sum = L.reduce((s, e) => s + (S.cat ? e.parts.filter(p => p.cat === S.cat).reduce((a, p) => a + p.amount, 0) : e.amount), 0);
  app.innerHTML = `${header()}
  ${periodChips()}
  <div style="margin-top:22px"><input class="search" id="q" type="search" placeholder="Traži trgovca, artikal ili osobu" value="${esc(S.q)}" aria-label="Pretraga"></div>
  <div class="filter-on">
    ${S.cat ? `<span class="meta">Kategorija</span><button class="chip" aria-pressed="true" data-clear>${esc(catName(S.cat))} ×</button>` : ""}
    <span class="meta dim num">${stavki(L.length)}, ukupno ${signed(sum)}</span>
  </div>
  ${Object.keys(days).map(d => `<div class="day"><div class="meta dim">${esc(dDay(d))}</div>${days[d].map(rowHtml).join("")}</div>`).join("") || `<div class="empty"><span class="meta dim">Nema stavki za ovaj izbor</span></div>`}`;
  const qi = document.getElementById("q");
  qi.addEventListener("input", () => { S.q = qi.value; const pos = qi.selectionStart; renderList(); const n = document.getElementById("q"); n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) {} });
}

/* ---------- prolazno ---------- */
function renderPass() {
  const people = {};
  for (const e of list().filter(inPeriod)) for (const p of e.parts) {
    if (p.cat !== "prolazno") continue;
    const k = p.person || "Bez imena"; (people[k] ||= { in: 0, out: 0, items: [] });
    if (p.amount > 0) people[k].in += p.amount; else people[k].out += -p.amount;
    people[k].items.push(e);
  }
  const names = Object.keys(people).sort((a, b) => Math.abs(people[b].in - people[b].out) - Math.abs(people[a].in - people[a].out));
  app.innerHTML = `${header()}
  ${periodChips()}
  <div class="hero"><div><span class="eyebrow">[tuđ novac preko tvog računa]</span></div><h1>Prolazno</h1>
  <p class="lead">Novac koji je ušao za nekog drugog i otišao njemu. Ne računa se ni u tvoju potrošnju ni u priliv. Saldo pokazuje da li se ulaz i izlaz poklapaju.</p></div>
  <section style="margin-top:36px">${names.length ? names.map(n => { const P = people[n], s = Math.round((P.in - P.out) * 100) / 100; return `
    <div class="prow"><h2>${esc(n)}</h2>
      <div class="pnums">
        <div><span class="meta dim">Ušlo za njega</span><div class="v num">${money(P.in, true)}</div></div>
        <div><span class="meta dim">Dao si</span><div class="v num">${money(P.out, true)}</div></div>
        <div><span class="meta dim">Saldo</span><div class="v num ${s < 0 ? "neg" : ""}">${s < 0 ? "-" : s > 0 ? "+" : ""}${money(s, true)}</div></div>
      </div>
      <p class="note">${Math.abs(s) < 0.5 ? "Poklapa se." : s > 0 ? "Kod tebe je još ovoliko njegovog novca." : P.in === 0 ? "Nijedna uplata za ovu osobu još nije označena. Kad nađeš uplate koje su bile za nju, označi ih kao prolazne sa istim imenom." : "Dao si više nego što je označeno da je stiglo. Ili fali neka uplata, ili je ovo razlika koju si platio iz svog."}</p>
      <div style="margin-top:8px">${P.items.map(rowHtml).join("")}</div>
    </div>`; }).join("") : `<div class="empty"><span class="meta dim">Nema prolaznih stavki u ovom periodu</span><p class="note">Otvori stavku i izaberi Prolazno.</p></div>`}</section>`;
}

/* ---------- više: uvoz, kopija, pravila, odjava ---------- */
function renderMore() {
  const I = S.imp;
  const opt = (sel, none) => `${none ? `<option value="-1" ${sel === -1 ? "selected" : ""}>Nema</option>` : ""}${(I?.headers || []).map((h, i) => `<option value="${i}" ${sel === i ? "selected" : ""}>${esc(h)}</option>`).join("")}`;
  const rows = I?.body ? rowsFrom(I) : [];
  const months = [...new Set(rows.map(r => r.d.slice(0, 7)))].sort();
  const mr = S.data.rules.filter(r => r.kind === "merchant").sort((a, b) => a.match.localeCompare(b.match));
  const ir = S.data.rules.filter(r => r.kind === "item").sort((a, b) => a.match.localeCompare(b.match));
  app.innerHTML = `${header()}
  <div class="hero"><div><span class="eyebrow">[jednom mesečno]</span></div><h1>Izvod</h1>
  <p class="lead">Na kompjuteru otvori Raiffeisen web e-banking, izvezi promet tekućeg računa za prošli mesec kao Excel ili CSV i ubaci ga ovde. Stavke u istom periodu se zamenjuju izvodom, a tvoja pravila i skenirani računi ostaju.</p></div>
  <section style="margin-top:28px">
    <div class="step"><span class="meta">1. Fajl</span>
      <label class="filebtn"><input type="file" id="imp-file" accept=".csv,.txt,.xlsx,.xls"><span class="b">Izaberi izvod</span><span class="meta dim">${I ? esc(I.name) : "CSV ili Excel"}</span></label>
      ${I?.error ? `<p class="err">${esc(I.error)}</p>` : ""}</div>
    ${I?.headers ? `
    <div class="step"><span class="meta">2. Koja kolona je šta</span>
      <div class="map">
        <label class="field"><span class="meta dim">Datum</span><select data-map="date">${opt(I.map.date)}</select></label>
        <label class="field"><span class="meta dim">Opis ili trgovac</span><select data-map="desc">${opt(I.map.desc)}</select></label>
        <label class="field"><span class="meta dim">Dodatni opis</span><select data-map="desc2">${opt(I.map.desc2, true)}</select></label>
        <label class="field"><span class="meta dim">Iznos sa znakom</span><select data-map="amount">${opt(I.map.amount, true)}</select></label>
        <label class="field"><span class="meta dim">Ili: isplata</span><select data-map="debit">${opt(I.map.debit, true)}</select></label>
        <label class="field"><span class="meta dim">Ili: uplata</span><select data-map="credit">${opt(I.map.credit, true)}</select></label>
      </div>
      <p class="note" style="margin:0">Ako izvod ima jednu kolonu za iznos sa minusom, izaberi nju. Ako ima dve, isplate i uplate, ostavi iznos na Nema.</p></div>
    <div class="step"><span class="meta">3. Pregled</span>
      ${rows.length ? `<div class="prev"><table><thead><tr><th>Datum</th><th>Opis</th><th style="text-align:right">Iznos</th></tr></thead><tbody>
        ${rows.slice(0, 6).map(r => `<tr><td class="num">${esc(dShort(r.d) + r.d.slice(0, 4))}</td><td>${esc(r.t)}</td><td class="num" style="text-align:right">${signed(r.a)}</td></tr>`).join("")}</tbody></table></div>
        <p class="note" style="margin:0">${stavki(rows.length)}, ${months.map(k => { const [y, m] = k.split("-"); return MONFULL[+m - 1] + " " + y; }).join(" i ")}.</p>
        <div><button class="btn" data-doimport ${S.busy ? "disabled" : ""}>${S.busy ? "Uvozim" : "Uvezi " + stavki(rows.length)}</button></div>`
      : `<p class="note" style="margin:0">Nijedan red nema i datum i iznos. Proveri izbor kolona.</p>`}</div>` : ""}
  </section>

  <section>
    <div class="sec-h"><h2>Pravila</h2><span class="meta dim">${mr.length + ir.length} ukupno</span></div>
    <div class="rows">${[...mr, ...ir].map(r => `<div class="mrow" style="grid-template-columns:minmax(0,1fr) auto">
      <span class="name">${esc(r.match)}</span><button class="chip" data-delrule="${esc(r.kind + "|" + r.match)}" aria-label="Obriši pravilo">Obriši</button>
      <span class="meta dim" style="grid-column:1/-1">${r.kind === "item" ? "Artikal" : "Trgovac"}: ${esc(catName(r.cat))}${r.person ? ", " + esc(r.person) : ""}</span></div>`).join("") || `<div class="empty"><span class="meta dim">Nema pravila. Pravi se kad na stavci čekiraš "primeni na sve".</span></div>`}</div>
  </section>

  <section>
    <div class="sec-h"><h2>Kopija</h2></div>
    <p class="lead">Rezervna kopija svih podataka u jednom fajlu. Isti fajl služi i za prenos podataka iz prve verzije.</p>
    <div class="row-btns" style="margin-top:14px">
      <button class="btn sage" data-export>Sačuvaj kopiju</button>
      <label class="filebtn"><input type="file" id="bk-file" accept=".json,application/json"><span class="b" style="background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1px var(--line)">Uvezi kopiju</span></label>
    </div>
  </section>

  <section>
    <div class="row-btns"><button class="btn ghost" data-logout>Odjavi se</button></div>
    <p class="note">${esc(S.session?.user?.email || "")}</p>
  </section>`;

  document.getElementById("imp-file").onchange = async ev => {
    const f = ev.target.files[0]; if (!f) return;
    try { S.imp = await readStatement(f); } catch (e) { S.imp = { name: f.name, error: "Fajl nije mogao da se pročita. Probaj CSV ili Excel izvoz iz web e-bankinga." }; }
    renderMore();
  };
  app.querySelectorAll("[data-map]").forEach(s => s.onchange = () => { S.imp.map[s.dataset.map] = +s.value; renderMore(); });
  const b = app.querySelector("[data-doimport]"); if (b) b.onclick = () => doImport(rows);
  document.getElementById("bk-file").onchange = async ev => {
    const f = ev.target.files[0]; if (!f) return;
    let data; try { data = JSON.parse(await f.text()); } catch (_) { toast("Fajl nije ispravna kopija."); return; }
    if (!data || !Array.isArray(data.transactions)) { toast("Fajl nije kopija iz ove aplikacije."); return; }
    const okk = await guard(() => importBackup(data), "Kopija je uvezena: " + stavki(data.transactions.length));
    if (okk) { cache = null; await load(); }
  };
}
async function doImport(rows) {
  if (!rows.length || S.busy) return;
  S.busy = true; renderMore();
  const ds = rows.map(r => r.d).sort();
  const okk = await guard(() => replaceBankRange(ds[0], ds[ds.length - 1], rows), "Uvezeno: " + stavki(rows.length));
  S.busy = false;
  if (okk) {
    S.data.tx = S.data.tx.filter(r => r.d < ds[0] || r.d > ds[ds.length - 1]).concat(rows);
    S.imp = null; S.period = ds[ds.length - 1].slice(0, 7); S.view = "pregled"; changed();
  } else renderMore();
}

/* ---------- izmena stavke ---------- */
function personsList() {
  const s = new Set();
  for (const r of S.data.rules) if (r.person) s.add(r.person);
  for (const v of Object.values(S.data.overrides)) if (v.person) s.add(v.person);
  for (const r of S.data.receipts) if (r.person) s.add(r.person);
  return [...s].sort();
}
function openEdit(id) {
  const e = list().find(x => x.id === id); if (!e) return;
  const rc = e.receipt;
  if (e.type === "bank") {
    const ov = S.data.overrides[id];
    S.sheet = { kind: "edit", id, e, cat: ov ? ov.cat : e.cat, person: ov ? ov.person || "" : e.person || "", pass: ov?.pass || "", applyAll: false, key: merchantKey(e.t) };
  } else {
    S.sheet = { kind: "edit", id, e, cat: rc.cat || e.cat, person: rc.person || "", pass: "", applyAll: false, key: upper(rc.store || rc.merchant || "").trim(), payment: rc.payment };
  }
  drawSheet();
}
function itemsHtml(rc) {
  const items = rc?.items || []; if (!items.length) return "";
  return `<div class="field"><span class="meta">Artikli sa računa</span><div class="items">${items.map((it, i) => {
    const ic = itemCat(S.data.rules, it.name);
    return `<button class="irow" data-item="${i}"><span class="n">${esc(it.name)}${it.qty && it.qty !== 1 ? ` <span class="dim">x ${String(it.qty).replace(".", ",")}</span>` : ""}</span><span class="a num">${money(it.total, true)}</span><span class="meta dim">${ic ? esc(catName(ic.cat)) : "kao ceo račun"}</span></button>`;
  }).join("")}</div><p class="note" style="margin:0">Dodirni artikal da mu zadaš kategoriju, npr. cigarete.</p></div>`;
}
function drawSheet() {
  const st = S.sheet;
  if (!st) { layer.innerHTML = ""; document.body.style.overflow = ""; return; }
  document.body.style.overflow = "hidden";
  if (st.kind === "item") return drawItemSheet();
  if (st.kind === "result") return drawResult();
  if (st.kind === "manual") return drawManual();
  const e = st.e, rc = e.receipt, isPass = st.cat === "prolazno", isRec = e.type === "receipt";
  layer.innerHTML = `<div class="scrim" data-close></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh-t"><div class="sheet-in">
    <div class="meta dim">${esc(dDay(e.d))}</div>
    <h3 id="sh-t">${esc(e.name)}</h3>
    <div class="num" style="font-size:22px;font-weight:500">${signed(e.amount)} RSD</div>
    <div class="meta dim" style="letter-spacing:.04em;text-transform:none">${esc(e.type === "bank" ? e.t : [rc.merchant, rc.store].filter(Boolean).join(", "))}${e.fee ? ", uključena konverzija " + money(-e.fee, true) : ""}${rc && e.type === "bank" ? ", uparen sa računom" : ""}</div>
    ${isRec ? `<div class="field"><span class="meta">Plaćeno</span><div class="catgrid">${["gotovina", "kartica", "racun"].map(p => `<button class="chip" data-pay="${p}" aria-pressed="${st.payment === p}">${PAYNAME[p]}</button>`).join("")}</div></div>` : ""}
    <div class="field"><span class="meta">Kategorija</span><div class="catgrid">${CATS.filter(c => c.id !== "gotovina" || !isRec).map(c => `<button class="chip" data-setcat="${c.id}" aria-pressed="${st.cat === c.id}">${esc(c.name)}</button>`).join("")}</div></div>
    ${isPass ? `<div class="map">
      <label class="field"><span class="meta">Za koga</span><input id="sh-person" list="sh-people" value="${esc(st.person)}" placeholder="Ime osobe" autocomplete="off"><datalist id="sh-people">${personsList().map(p => `<option value="${esc(p)}">`).join("")}</datalist></label>
      ${isRec ? "" : `<label class="field"><span class="meta">Koliko je prolazno</span><input id="sh-pass" inputmode="decimal" value="${esc(st.pass)}" placeholder="Ceo iznos ${money(e.amount, true)}"></label>`}
    </div>${isRec ? "" : `<p class="note" style="margin:0">Ostavi prazno ako je ceo iznos tuđ. Ako upišeš manji iznos, ostatak ostaje kao tvoja potrošnja.</p>`}` : ""}
    <label class="check"><input type="checkbox" id="sh-all" ${st.applyAll ? "checked" : ""}> Primeni na sve od ovog trgovca</label>
    ${st.applyAll ? `<label class="field"><span class="meta dim">Važi za sve stavke koje sadrže</span><input id="sh-key" class="search" value="${esc(st.key)}"></label>` : ""}
    ${itemsHtml(rc)}
    <div class="row-btns">
      <button class="btn" data-save>Sačuvaj</button>
      <button class="btn ghost" data-close>Otkaži</button>
      ${e.type === "bank" && S.data.overrides[e.id] ? `<button class="btn ghost" data-reset>Vrati na automatski</button>` : ""}
      ${rc ? `<button class="btn ghost" data-delreceipt>${st.confirmDel ? "Sigurno obriši " + (rc.kind === "ips" ? "uplatnicu" : "račun") : "Obriši " + (rc.kind === "ips" ? "uplatnicu" : rc.kind === "manual" ? "unos" : "račun")}</button>` : ""}
    </div>
  </div></div>`;
  document.getElementById("sh-all").onchange = ev => { readInputs(); st.applyAll = ev.target.checked; drawSheet(); };
}
function readInputs() {
  const st = S.sheet; if (!st) return;
  const p = document.getElementById("sh-person"), a = document.getElementById("sh-pass"), k = document.getElementById("sh-key");
  if (p) st.person = p.value.trim(); if (a) st.pass = a.value.trim(); if (k) st.key = upper(k.value.trim());
}
async function saveEdit() {
  readInputs();
  const st = S.sheet, e = st.e;
  if (st.cat === "prolazno" && !st.person) { toast("Upiši za koga je ovaj novac"); return; }
  let pass = null;
  if (st.cat === "prolazno" && st.pass) { pass = Math.abs(parseAmt(st.pass)); if (!isFinite(pass) || pass <= 0) { toast("Iznos nije ispravan, na primer 40000"); return; } }
  if (st.applyAll && (!st.key || st.key.length < 3)) { toast("Tekst za pravilo mora imati bar 3 slova"); return; }
  const person = st.cat === "prolazno" ? st.person : "";
  if (e.type === "receipt") {
    const rc = e.receipt;
    const patch = { cat: st.applyAll ? null : st.cat, person, payment: st.payment };
    if (!await guard(() => updateReceipt(rc.id, patch))) return;
    Object.assign(rc, patch);
  } else if (!st.applyAll || pass) {
    const o = { cat: st.cat, person, ...(pass ? { pass } : {}) };
    if (!await guard(() => saveOverride(e.id, o))) return;
    S.data.overrides[e.id] = o;
  } else if (S.data.overrides[e.id]) {
    if (!await guard(() => deleteOverride(e.id))) return;
    delete S.data.overrides[e.id];
  }
  if (st.applyAll) {
    const r = { kind: "merchant", match: st.key, cat: st.cat, person };
    if (!await guard(() => saveRule(r))) return;
    S.data.rules = S.data.rules.filter(x => !(x.kind === "merchant" && x.match === r.match)).concat(r);
    toast("Pravilo sačuvano za sve: " + st.key.toLowerCase());
  } else toast("Sačuvano");
  S.sheet = null; drawSheet(); changed();
}
async function resetEdit() {
  const id = S.sheet.e.id;
  if (!await guard(() => deleteOverride(id), "Vraćeno na automatsku kategoriju")) return;
  delete S.data.overrides[id]; S.sheet = null; drawSheet(); changed();
}
async function delReceipt() {
  const st = S.sheet, rc = st.e.receipt;
  if (!st.confirmDel) { st.confirmDel = true; drawSheet(); return; }
  if (!await guard(() => deleteReceipt(rc.id), "Obrisano")) return;
  S.data.receipts = S.data.receipts.filter(r => r.id !== rc.id); S.sheet = null; drawSheet(); changed();
}

/* artikal */
function openItem(i) {
  const st = S.sheet, rc = st.kind === "result" ? st.rc : st.e.receipt, it = rc.items[i];
  const ic = itemCat(S.data.rules, it.name);
  const key = upper(it.name).replace(/\s+\d.*$/, "").trim() || upper(it.name);
  S.sheet = { kind: "item", back: st, it, cat: ic ? ic.cat : null, key };
  drawSheet();
}
function drawItemSheet() {
  const st = S.sheet;
  layer.innerHTML = `<div class="scrim" data-back></div>
  <div class="sheet" role="dialog" aria-modal="true"><div class="sheet-in">
    <span class="meta dim">Artikal</span>
    <h3>${esc(st.it.name)}</h3>
    <div class="num" style="font-size:20px;font-weight:500">${money(st.it.total, true)} RSD</div>
    <div class="field"><span class="meta">Kategorija</span><div class="catgrid">${CATS.filter(c => c.kind === "spend" && c.id !== "gotovina").map(c => `<button class="chip" data-icat="${c.id}" aria-pressed="${st.cat === c.id}">${esc(c.name)}</button>`).join("")}</div></div>
    <label class="field"><span class="meta">Važi za sve artikle koji sadrže</span><input id="it-key" class="search" value="${esc(st.key)}"></label>
    <div class="row-btns"><button class="btn" data-isave>Sačuvaj</button><button class="btn ghost" data-back>Nazad</button></div>
  </div></div>`;
}
async function saveItem() {
  const st = S.sheet; st.key = upper(document.getElementById("it-key").value.trim());
  if (!st.cat) { toast("Izaberi kategoriju"); return; }
  if (st.key.length < 3) { toast("Tekst mora imati bar 3 slova"); return; }
  const r = { kind: "item", match: st.key, cat: st.cat, person: "" };
  if (!await guard(() => saveRule(r), "Sačuvano za sve: " + st.key.toLowerCase())) return;
  S.data.rules = S.data.rules.filter(x => !(x.kind === "item" && x.match === r.match)).concat(r);
  cache = null; S.sheet = st.back;
  if (S.sheet.kind === "edit") { const e = list().find(x => x.id === S.sheet.id); if (e) S.sheet.e = e; }
  drawSheet(); render();
}

/* ---------- skeniranje ---------- */
let stopCam = null;
function openScan() {
  closeCam();
  const cam = document.createElement("div"); cam.className = "cam"; cam.id = "cam";
  cam.innerHTML = `<video autoplay playsinline muted></video><div class="frame"></div><div class="hint" id="cam-hint">Uperi kameru u QR kod sa računa ili uplatnice</div>
  <div class="bottom">
    <label class="filebtn"><input type="file" id="cam-file" accept="image/*"><span class="b">Iz slike</span></label>
    <button class="btn ghost" data-manual>Unesi ručno</button>
    <button class="btn ghost" data-camclose>Zatvori</button>
  </div>`;
  document.body.appendChild(cam);
  const hint = cam.querySelector("#cam-hint");
  stopCam = startCamera(cam.querySelector("video"), text => handleQr(text), () => { hint.textContent = "Kamera nije dostupna. Dozvoli kameru u podešavanjima ili izaberi sliku računa."; });
  cam.querySelector("#cam-file").onchange = async ev => {
    const f = ev.target.files[0]; if (!f) return;
    hint.textContent = "Čitam sliku";
    const t = await decodeFile(f);
    if (t) handleQr(t); else hint.textContent = "Na slici nije pronađen QR kod. Probaj oštriju sliku, bliže kodu.";
  };
  cam.addEventListener("click", ev => {
    if (ev.target.closest("[data-camclose]")) closeCam();
    if (ev.target.closest("[data-manual]")) { closeCam(); openManual(); }
  });
}
function closeCam() { if (stopCam) { stopCam(); stopCam = null; } const c = document.getElementById("cam"); if (c) c.remove(); }

async function handleQr(text) {
  const hint = document.getElementById("cam-hint");
  if (isFiscalUrl(text)) {
    if (S.data.receipts.some(r => r.source_url === text.trim())) { closeCam(); toast("Ovaj račun je već sačuvan."); return; }
    if (hint) hint.textContent = "Čitam račun kod Poreske uprave";
    try {
      const r = await fetch("/api/receipt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: text.trim() }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Račun nije pročitan.");
      closeCam();
      const rc = { kind: "fiscal", source_url: text.trim(), issued_at: j.issuedAt || today() + "T12:00:00", merchant: j.merchant || "", store: j.store || "", total: Math.abs(j.total), payment: j.payment || "kartica", refund: !!j.refund, items: j.items || [], journal: j.journal || null, cat: null, person: "" };
      S.sheet = { kind: "result", rc, warn: j.sale === false ? "Ovo nije račun o kupovini (predračun, kopija ili obuka). Ne čuvam ga." : "" };
      drawSheet();
    } catch (e) {
      if (hint) hint.textContent = e.message + " Skeniraj ponovo ili zatvori.";
      setTimeout(() => { if (document.getElementById("cam")) { const v = document.querySelector("#cam video"); stopCam = startCamera(v, handleQr, () => {}); } }, 1500);
    }
    return;
  }
  const ips = parseIps(text);
  if (ips) {
    closeCam();
    const rc = { kind: "ips", qr_text: text, issued_at: today() + "T12:00:00", merchant: ips.name, store: "", total: Math.abs(ips.amount || 0), payment: "racun", refund: false, items: [], cat: null, person: "", _ips: ips };
    S.sheet = { kind: "result", rc };
    drawSheet();
    return;
  }
  if (hint) hint.textContent = "Ovaj QR kod nije ni fiskalni račun ni uplatnica.";
  setTimeout(() => { if (document.getElementById("cam")) { const v = document.querySelector("#cam video"); stopCam = startCamera(v, handleQr, () => {}); } }, 1800);
}

function drawResult() {
  const st = S.sheet, rc = st.rc, ips = rc._ips;
  const base = rc.cat || (ips ? (merchantCat(S.data.rules, rc.merchant, -1).cat === "nerazvrstano" ? "racuni" : merchantCat(S.data.rules, rc.merchant, -1).cat) : merchantCat(S.data.rules, rc.merchant + " " + rc.store, -1).cat);
  layer.innerHTML = `<div class="scrim" data-close></div>
  <div class="sheet" role="dialog" aria-modal="true"><div class="sheet-in">
    <span class="meta dim">${ips ? "Uplatnica" : rc.refund ? "Račun, povraćaj" : "Fiskalni račun"}</span>
    <h3>${esc(ips ? rc.merchant || "Primalac" : rc.store || rc.merchant || "Račun")}</h3>
    <div class="num" style="font-size:24px;font-weight:500">${money(rc.total, true)} RSD</div>
    ${ips ? `<div class="meta dim" style="text-transform:none;letter-spacing:.04em">${esc([ips.purpose, ips.account].filter(Boolean).join(", "))}</div>
      <label class="field"><span class="meta">Datum plaćanja</span><input id="r-date" type="date" value="${esc(rc.issued_at.slice(0, 10))}"></label>`
      : `<div class="meta dim">${esc(dDay(rc.issued_at))}${rc.merchant && rc.store ? ", " + esc(rc.merchant) : ""}</div>`}
    ${st.warn ? `<p class="err">${esc(st.warn)}</p>` : ""}
    <div class="field"><span class="meta">Plaćeno</span><div class="catgrid">${["gotovina", "kartica", "racun"].map(p => `<button class="chip" data-rpay="${p}" aria-pressed="${rc.payment === p}">${PAYNAME[p]}</button>`).join("")}</div></div>
    <div class="field"><span class="meta">Kategorija</span><div class="catgrid">${CATS.filter(c => c.id !== "gotovina").map(c => `<button class="chip" data-rcat="${c.id}" aria-pressed="${base === c.id}">${esc(c.name)}</button>`).join("")}</div></div>
    ${base === "prolazno" ? `<label class="field"><span class="meta">Za koga</span><input id="r-person" list="r-people" value="${esc(rc.person)}" autocomplete="off"><datalist id="r-people">${personsList().map(p => `<option value="${esc(p)}">`).join("")}</datalist></label>` : ""}
    ${itemsHtml(rc)}
    <div class="row-btns"><button class="btn" data-rsave ${st.warn ? "disabled" : ""}>Sačuvaj</button><button class="btn ghost" data-close>Odbaci</button></div>
  </div></div>`;
}
async function saveResult() {
  const st = S.sheet, rc = st.rc;
  const dt = document.getElementById("r-date"); if (dt && dt.value) rc.issued_at = dt.value + "T12:00:00";
  const pp = document.getElementById("r-person"); if (pp) rc.person = pp.value.trim();
  if (rc.cat === "prolazno" && !rc.person) { toast("Upiši za koga je ovaj novac"); return; }
  if (!(rc.total > 0)) { toast("Iznos nije pročitan"); return; }
  const { _ips, ...row } = rc;
  const saved = await guard(() => insertReceipt(row));
  if (!saved) return;
  S.data.receipts.push(saved);
  S.sheet = null; drawSheet();
  cache = null;
  const e = list().find(x => x.receipt && x.receipt.id === saved.id);
  toast(e && e.type === "bank" ? "Sačuvano i upareno sa stavkom iz banke" : rc.payment === "gotovina" ? "Sačuvano kao trošak gotovinom" : "Sačuvano, upariće se kad ubaciš izvod");
  S.period = String(saved.issued_at).slice(0, 7); render();
}

function openManual() { S.sheet = { kind: "manual", cat: "nerazvrstano", payment: "gotovina", desc: "", amount: "", date: today(), person: "" }; drawSheet(); }
function drawManual() {
  const st = S.sheet;
  layer.innerHTML = `<div class="scrim" data-close></div>
  <div class="sheet" role="dialog" aria-modal="true"><div class="sheet-in">
    <span class="meta dim">Ručni unos</span><h3>Trošak bez računa</h3>
    <div class="map">
      <label class="field"><span class="meta">Na šta</span><input id="m-desc" value="${esc(st.desc)}" placeholder="npr. pijaca, frizer"></label>
      <label class="field"><span class="meta">Iznos</span><input id="m-amt" inputmode="decimal" value="${esc(st.amount)}" placeholder="0"></label>
      <label class="field"><span class="meta">Datum</span><input id="m-date" type="date" value="${esc(st.date)}"></label>
    </div>
    <div class="field"><span class="meta">Plaćeno</span><div class="catgrid">${["gotovina", "kartica", "racun"].map(p => `<button class="chip" data-mpay="${p}" aria-pressed="${st.payment === p}">${PAYNAME[p]}</button>`).join("")}</div></div>
    <div class="field"><span class="meta">Kategorija</span><div class="catgrid">${CATS.filter(c => c.kind === "spend" && c.id !== "gotovina" || c.id === "prolazno").map(c => `<button class="chip" data-mcat="${c.id}" aria-pressed="${st.cat === c.id}">${esc(c.name)}</button>`).join("")}</div></div>
    ${st.cat === "prolazno" ? `<label class="field"><span class="meta">Za koga</span><input id="m-person" list="m-people" value="${esc(st.person)}" autocomplete="off"><datalist id="m-people">${personsList().map(p => `<option value="${esc(p)}">`).join("")}</datalist></label>` : ""}
    <p class="note" style="margin:0">Gotovina se odbija od podignutog novca. Kartica i sa računa se uparuju sa izvodom, pa se ne računaju dva puta.</p>
    <div class="row-btns"><button class="btn" data-msave>Sačuvaj</button><button class="btn ghost" data-close>Otkaži</button></div>
  </div></div>`;
}
function readManual() {
  const st = S.sheet;
  const g = id => document.getElementById(id);
  if (g("m-desc")) st.desc = g("m-desc").value; if (g("m-amt")) st.amount = g("m-amt").value; if (g("m-date")) st.date = g("m-date").value; if (g("m-person")) st.person = g("m-person").value.trim();
}
async function saveManual() {
  readManual();
  const st = S.sheet, amt = Math.abs(parseAmt(st.amount));
  if (!isFinite(amt) || amt <= 0) { toast("Upiši iznos"); return; }
  if (!st.desc.trim()) { toast("Upiši na šta je potrošeno"); return; }
  if (st.cat === "prolazno" && !st.person) { toast("Upiši za koga je ovaj novac"); return; }
  const row = { kind: "manual", issued_at: (st.date || today()) + "T12:00:00", merchant: st.desc.trim(), store: "", total: amt, payment: st.payment, refund: false, items: [], cat: st.cat, person: st.cat === "prolazno" ? st.person : "" };
  const saved = await guard(() => insertReceipt(row), "Sačuvano");
  if (!saved) return;
  S.data.receipts.push(saved); S.sheet = null; drawSheet(); changed();
}

/* ---------- događaji ---------- */
app.addEventListener("click", async ev => {
  const t = ev.target;
  const p = t.closest("[data-period]"); if (p) { S.period = p.dataset.period; render(); return; }
  const c = t.closest("[data-cat]"); if (c) { S.cat = c.dataset.cat; S.q = ""; S.view = "stavke"; render(); window.scrollTo(0, 0); return; }
  if (t.closest("[data-clear]")) { S.cat = null; render(); return; }
  const e = t.closest("[data-edit]"); if (e) { openEdit(e.dataset.edit); return; }
  const g = t.closest("[data-go]"); if (g) { S.view = g.dataset.go; render(); window.scrollTo(0, 0); return; }
  if (t.closest("[data-dismiss-install]")) { try { localStorage.setItem("kp-install", "1"); } catch (_) {} render(); return; }
  const dr = t.closest("[data-delrule]");
  if (dr) {
    const [kind, ...rest] = dr.dataset.delrule.split("|"); const r = { kind, match: rest.join("|") };
    if (await guard(() => deleteRule(r), "Pravilo obrisano")) { S.data.rules = S.data.rules.filter(x => !(x.kind === r.kind && x.match === r.match)); changed(); }
    return;
  }
  if (t.closest("[data-export]")) {
    const blob = new Blob([JSON.stringify(exportBackup(S.data), null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `koliko-para-kopija-${today()}.json`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    return;
  }
  if (t.closest("[data-logout]")) { await sb.auth.signOut(); return; }
});
layer.addEventListener("click", ev => {
  const t = ev.target, st = S.sheet; if (!st) return;
  if (t.closest("[data-close]")) { S.sheet = null; drawSheet(); return; }
  if (t.closest("[data-back]")) { S.sheet = st.back; drawSheet(); return; }
  const sc = t.closest("[data-setcat]"); if (sc) { readInputs(); st.cat = sc.dataset.setcat; drawSheet(); return; }
  const pay = t.closest("[data-pay]"); if (pay) { readInputs(); st.payment = pay.dataset.pay; drawSheet(); return; }
  const it = t.closest("[data-item]"); if (it) { if (st.kind === "edit") readInputs(); openItem(+it.dataset.item); return; }
  const ic = t.closest("[data-icat]"); if (ic) { st.key = upper(document.getElementById("it-key").value.trim()); st.cat = ic.dataset.icat; drawSheet(); return; }
  if (t.closest("[data-isave]")) { saveItem(); return; }
  if (t.closest("[data-save]")) { saveEdit(); return; }
  if (t.closest("[data-reset]")) { resetEdit(); return; }
  if (t.closest("[data-delreceipt]")) { delReceipt(); return; }
  const rp = t.closest("[data-rpay]"); if (rp) { const pp = document.getElementById("r-person"); if (pp) st.rc.person = pp.value.trim(); st.rc.payment = rp.dataset.rpay; drawSheet(); return; }
  const rcat = t.closest("[data-rcat]"); if (rcat) { const pp = document.getElementById("r-person"); if (pp) st.rc.person = pp.value.trim(); st.rc.cat = rcat.dataset.rcat; drawSheet(); return; }
  if (t.closest("[data-rsave]")) { saveResult(); return; }
  const mp = t.closest("[data-mpay]"); if (mp) { readManual(); st.payment = mp.dataset.mpay; drawSheet(); return; }
  const mc = t.closest("[data-mcat]"); if (mc) { readManual(); st.cat = mc.dataset.mcat; drawSheet(); return; }
  if (t.closest("[data-msave]")) { saveManual(); return; }
});
document.addEventListener("keydown", ev => { if (ev.key === "Escape") { if (document.getElementById("cam")) closeCam(); else if (S.sheet) { S.sheet = null; drawSheet(); } } });

/* ---------- start ---------- */
if (configured) {
  sb.auth.getSession().then(({ data }) => { S.session = data.session; render(); if (S.session) load(); });
  sb.auth.onAuthStateChange((evt, session) => {
    const was = !!S.session; S.session = session;
    if (session && !was) { S.ready = false; render(); load(); }
    if (!session) { S.ready = false; S.data = { tx: [], overrides: {}, rules: [], receipts: [] }; cache = null; render(); }
  });
} else render();

if ("serviceWorker" in navigator && import.meta.env.PROD) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
