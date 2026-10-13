import "./style.css";
import { sb, configured, loadAll, saveOverride, deleteOverride, saveRule, deleteRule, insertReceipt, updateReceipt, deleteReceipt, replaceBankRange, importBackup, exportBackup } from "./db.js";
import { CATS, CAT, catName, derive, totals, balance, savings, FIXED, META_CATS, merchantKey, groupKey, merchantCat, itemCat, upper } from "./logic.js";
import { parseIps, isFiscalUrl, fiscalUrl, latin } from "./shared/fiscal.js";
import { startCamera, grabFrame, decodePhotoQr } from "./scan.js";
import { readStatement, rowsFrom, parseAmt } from "./importer.js";
import { icon, catIcon } from "./icons.js";
import { shouldPlayIntro, playIntro } from "./intro.js";
import { basket, amountText } from "./items.js";
import { parseSpoken, guessCat } from "./spoken.js";
import { rhythm, seriesDays, seriesWeeks, seriesMonths, categoryCompare, insights, nonEssential, habits, dailyBudget } from "./stats.js";

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
const racuna = n => (n % 10 === 1 && n % 100 !== 11 ? "račun" : "računa");
const stavki = n => { const d = n % 10, h = n % 100; return n + " " + (d === 1 && h !== 11 ? "stavka" : (d >= 2 && d <= 4 && (h < 12 || h > 14)) ? "stavke" : "stavki"); };
const puta = n => n + " " + (n % 10 === 1 && n % 100 !== 11 ? "put" : "puta");
const PAYNAME = { gotovina: "Gotovina", kartica: "Kartica", racun: "Sa računa" };

/* ---------- tema: sistem, svetla ili tamna ---------- */
// prosečna potrošnja: sve, ili bez računa i pretplata (to se ionako plaća svakog meseca)
function getAvg() { try { return localStorage.getItem("kp-avg") === "bez" ? "bez" : "sve"; } catch (_) { return "sve"; } }
function setAvg(v) { try { localStorage.setItem("kp-avg", v); } catch (_) {} }
const avgSkip = () => (getAvg() === "bez" ? FIXED : null);
const avgChips = () => `<div class="periods avgsw">${[["sve", "Sve"], ["bez", "Bez računa i pretplata"]].map(([id, n]) => `<button class="chip" data-avg="${id}" aria-pressed="${getAvg() === id}">${n}</button>`).join("")}</div>`;
function getTheme() { try { return localStorage.getItem("kp-theme") || "svetla"; } catch (_) { return "svetla"; } }
function applyTheme(t) {
  const root = document.documentElement;
  if (t === "svetla") root.dataset.theme = "light"; else if (t === "tamna") root.dataset.theme = "dark"; else delete root.dataset.theme;
  const dark = t === "tamna" || (t === "sistem" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove());
  const m = document.createElement("meta"); m.name = "theme-color"; m.content = S.view === "pregled" || S.view === "profil" ? "#73393a" : dark ? "#1b1813" : "#e3e0d2";
  document.head.appendChild(m);
}
function setTheme(t) { try { localStorage.setItem("kp-theme", t); } catch (_) {} applyTheme(t); }
window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => applyTheme(getTheme()));

/* ---------- novčanik u uvodnoj traci ---------- */
let unmounts = [];
function stopWallet() { unmounts.forEach(f => f()); unmounts = []; }
function startWallet() {
  const els = [...document.querySelectorAll("#app #wallet, #app #card, #app [data-model]")];
  if (!els.length) return;
  import("./wallet.js").then(({ mountWallet, mountCard, mountNamed }) => {
    stopWallet();
    for (const el of els) {
      if (!document.body.contains(el)) continue;
      unmounts.push(el.id === "card" ? mountCard(el) : el.dataset.model ? mountNamed(el, el.dataset.model) : mountWallet(el));
    }
  }).catch(() => {});
}

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
    <div class="logo">[kolko para?]</div>
    <div class="wallet card-tile" id="card"></div>
    <h2>${mode === "in" ? "Prijava" : "Novi nalog"}</h2>
    <form id="auth" class="map" style="grid-template-columns:1fr">
      <label class="field"><span class="meta dim">Email</span><input id="a-email" type="email" autocomplete="email" required></label>
      <label class="field"><span class="meta dim">Lozinka</span><input id="a-pass" type="password" autocomplete="${mode === "in" ? "current-password" : "new-password"}" minlength="8" required></label>
      ${err ? `<p class="err">${esc(err)}</p>` : ""}
      <div class="row-btns"><button class="cta" type="submit">[ ${mode === "in" ? "Prijavi se" : "Napravi nalog"} ]</button>
      <button class="btn" type="button" id="a-switch">${mode === "in" ? "Prvi put? Napravi nalog" : "Već imam nalog"}</button></div>
    </form>
  </div>`;
  startWallet();
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

/* ---------- profil: ime i slika (zapis u tabeli računa, cat = profil) ---------- */
const profRow = () => S.data.receipts.find(r => r.cat === "profil");
const avaSrc = () => profRow()?.journal || "";
const avaHtml = size => avaSrc() ? `<img alt="" src="${esc(avaSrc())}">` : icon("osoba", size);
const avaBtn = () => `<button class="ava" data-go="profil" aria-label="Profil">${avaHtml(20)}</button>`;

/* ---------- okvir ---------- */
function render() {
  if (!configured) { app.innerHTML = `<div class="auth"><div class="logo">[kolko para?]</div><h2>Fale podešavanja</h2><p class="lead">Nedostaju adresa i ključ Supabase baze. Dodaj ih u Vercel podešavanjima kao VITE_SUPABASE_URL i VITE_SUPABASE_ANON_KEY, pa ponovo objavi.</p></div>`; return; }
  if (!S.session) { stopWallet(); renderAuth(); tabbar(false); return; }
  tabbar(true);
  stopWallet(); applyTheme(getTheme()); app.classList.remove("is-empty");
  if (!S.ready) { app.innerHTML = `<div class="top"><div class="logo">[kolko para?]</div></div><div class="empty" style="margin-top:40px"><span class="meta dim">${esc(S.loadError || "Učitavam")}</span></div>`; return; }
  const v = { pregled: renderOverview, stavke: renderList, prolazno: renderPass, vise: renderMore, profil: renderProfile, korpa: renderBasket, stednja: renderSavings, dan: renderDay }[S.view] || renderOverview;
  v();
}
function header() {
  return `<div class="top"><div class="logo">[kolko para?]</div><div class="topr"><span class="meta dim">${S.view === "pregled" ? "" : esc(({ stavke: "Stavke", prolazno: "Prolazno", vise: "Više", korpa: "Korpa", dan: "Po danu" })[S.view] || "")}</span>${avaBtn()}</div></div>${installHint()}`;
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
  const tab = (id, label) => `<button class="tab" data-view="${id}" ${S.view === id || (id === "stavke" && S.view === "dan") ? 'aria-current="page"' : ""}>${icon(id, 22)}<span>${label}</span></button>`;
  bar.innerHTML = `<div class="tabbar-in">${tab("pregled", "Pregled")}${tab("stavke", "Stavke")}<button class="cta scanbtn" data-scan aria-label="Skeniraj račun ili uplatnicu">[ Skeniraj ]</button>${tab("prolazno", "Prolazno")}${tab("vise", "Više")}</div>`;
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
    app.classList.add("is-empty");
    app.innerHTML = `<div class="band fill">
      <div class="top"><div class="logo">[kolko para?]</div>${avaBtn()}</div>
      ${installHint()}
      <div class="mid">
        <div><span class="eyebrow">[još nema stavki]</span></div>
        <div class="wallet card-tile" id="card"></div>
        <div class="actions"><button class="cta big" data-scan>[ Skeniraj prvi račun ]</button></div>
        <p class="sub"><span>Ili u delu Više ubaci</span> izvod iz e-bankinga <span>ili rezervnu kopiju.</span></p>
        ${haveLine()}
      </div>
    </div>`;
    startWallet();
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

  const b = bal();
  app.innerHTML = `<div class="band">
    <div class="top"><div class="logo">[kolko para?]</div>${avaBtn()}</div>
    ${installHint()}
    ${periodChips()}
    <div style="margin-top:26px"><span class="eyebrow">[${from ? esc(dShort(from) + " do " + dShort(to) + to.slice(0, 4)) : ""}]</span></div>
    <div class="duo${(money(T.spend) + (b ? money(b.now) : "")).length > 13 ? " long" : ""}">
      <div><div class="label">Potrošeno</div><div class="big num">${money(T.spend)}</div></div>
      <button data-have aria-label="Koliko imaš"><div class="label">Ostalo</div>${b ? `<div class="big num">${b.now < 0 ? "-" : ""}${money(b.now)}</div>` : `<div class="big set">Upiši</div>`}</button>
    </div>
    <div class="haverow"><button class="have add" data-income><span class="meta">+ Uplata</span></button><button class="have add" data-go="profil"><span class="meta">Statistika</span></button><button class="have add" data-go="korpa"><span class="meta">Korpa</span></button><button class="have add" data-go="stednja"><span class="meta">Štednja</span></button></div>
    <div class="wallet" id="wallet"></div>
    <div class="actions"><button class="cta big" data-scan>[ Skeniraj račun ]</button></div>
    ${budgetLine()}
    <p class="sub"><span>${span} ${span % 10 === 1 && span !== 11 ? "dan" : "dana"}, prosečno</span> ${money((avgSkip() ? totals(L, FIXED).spend : T.spend) / span)} dinara dnevno. <span>Bez prolaznog novca i prenosa između tvojih računa${avgSkip() ? ", bez računa i pretplata" : ""}.</span></p>
    ${avgChips()}
  </div>
  <div class="strip">
    <div><span class="meta dim">Gotovina bez računa</span><span class="v num">${money(T.unexplained)}</span></div>
    <div><span class="meta dim">Uplate</span><span class="v num">${money(T.inc)}</span></div>
    <div><span class="meta dim">Banci, provizije</span><span class="v num">${money(prov + T.feeConv)}</span></div>
    <div><span class="meta dim">Čeka kategoriju</span><span class="v num">${stavki(unc)}</span></div>
  </div>
  ${unc ? `<p class="note"><button class="chip" aria-pressed="true" data-cat="nerazvrstano">Razvrstaj ${stavki(unc)}</button></p>` : ""}

  <section>
    <div class="sec-h"><h2>Na šta</h2><span class="meta dim">Dodirni red za stavke</span></div>
    <div class="rows">${cats.map(x => `
      <button class="crow" data-cat="${x.c.id}">
        ${catIcon(x.c.id, 24)}
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
  startWallet();
}

/* ---------- stavke ---------- */
function rowHtml(e, focus) {
  // kad je izabrana kategorija, red pokazuje deo računa iz te kategorije, a ceo iznos piše ispod
  const fp = typeof focus === "string" && e.parts.length > 1 ? e.parts.filter(p => p.cat === focus) : null;
  const shown = fp && fp.length ? fp.reduce((a, p) => a + p.amount, 0) : e.amount;
  const fItems = fp ? fp.flatMap(p => p.items || []).map(it => String(it.name).replace(/^\s*\d{4,8}\s+/, "").replace(/\s*\/\s*(KOM|KG|L)\s*$/i, "")) : [];
  const tags = e.parts.map(p => {
    const cls = p.cat === "prolazno" ? "pass" : p.cat === "nerazvrstano" ? "wait" : e.manual ? "man" : "";
    const extra = p.cat === "prolazno" && p.person ? " " + p.person : "";
    const part = e.parts.length > 1 ? " " + money(p.amount) : "";
    return `<span class="tag ${cls}">${esc(catName(p.cat) + extra + part)}</span>`;
  }).join("");
  const doc = e.receipt ? `<span class="tag doc">${e.receipt.kind === "ips" ? "Uplatnica" : e.receipt.cat === "priliv" ? "Uplata" : e.receipt.kind === "manual" ? "Ručno" : "Račun"}${e.cash ? ", gotovina" : ""}</span>` : "";
  const info = [fp && fp.length ? `od ukupno ${money(e.amount, true)}${fItems.length ? ": " + fItems.slice(0, 3).join(", ").toLowerCase() + (fItems.length > 3 ? ` i još ${fItems.length - 3}` : "") : ""}` : "", e.label, e.fee ? "uključena konverzija " + money(-e.fee, true) : "", e.pending ? "čeka izvod" : "", e.rule && !e.manual ? "pravilo: " + e.rule.toLowerCase() : ""].filter(Boolean).join(", ");
  const main = e.parts[0]?.cat || "nerazvrstano";
  return `<button class="trow" data-edit="${esc(e.id)}">
    <span class="tic ${main === "nerazvrstano" ? "wait" : main === "prolazno" ? "pass" : ""}">${catIcon(main, 20)}</span>
    <span class="name">${esc(e.name)}</span>
    <span class="amt num ${shown > 0 ? "plus" : ""}">${signed(shown)}</span>
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
  ${dayPicker(null)}
  <div style="margin-top:18px"><input class="search" id="q" type="search" placeholder="Traži trgovca, artikal ili osobu" value="${esc(S.q)}" aria-label="Pretraga"></div>
  <div class="filter-on">
    ${S.cat ? `<span class="meta">Kategorija</span><button class="chip" aria-pressed="true" data-clear>${esc(catName(S.cat))} ×</button>` : ""}
    <span class="meta dim num">${stavki(L.length)}, ukupno ${signed(sum)}</span>
  </div>
  ${Object.keys(days).map(d => `<div class="day"><div class="meta dim">${esc(dDay(d))}</div>${days[d].map(e => rowHtml(e, S.cat)).join("")}</div>`).join("") || `<div class="empty"><span class="meta dim">Nema stavki za ovaj izbor</span></div>`}`;
  bindDayInput();
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
        <div><button class="cta" data-doimport ${S.busy ? "disabled" : ""}>${S.busy ? "Uvozim" : "[ Uvezi " + stavki(rows.length) + " ]"}</button></div>`
      : `<p class="note" style="margin:0">Nijedan red nema i datum i iznos. Proveri izbor kolona.</p>`}</div>` : ""}
  </section>

  <section>
    <div class="sec-h"><h2>Pravila</h2><span class="meta dim">${mr.length + ir.length} ukupno</span></div>
    <div class="rows">${[...mr, ...ir].map(r => `<div class="mrow" style="grid-template-columns:minmax(0,1fr) auto">
      <span class="name">${esc(r.match)}</span><button class="chip" data-delrule="${esc(r.kind + "|" + r.match)}" aria-label="Obriši pravilo">Obriši</button>
      <span class="meta dim" style="grid-column:1/-1">${r.kind === "item" ? "Artikal" : "Trgovac"}: ${esc(catName(r.cat))}${r.person ? ", " + esc(r.person) : ""}</span></div>`).join("") || `<div class="empty"><span class="meta dim">Nema pravila. Pravi se kad na stavci čekiraš "primeni na sve".</span></div>`}</div>
  </section>

  <section>
    <div class="sec-h"><h2>Izgled</h2></div>
    <div class="theme">${[["sistem", "Kao telefon", "phone"], ["svetla", "Svetla", "sun"], ["tamna", "Tamna", "moon"]].map(([id, label, ic]) => `<button class="chip" data-theme-set="${id}" aria-pressed="${getTheme() === id}">${icon(ic, 16)}${label}</button>`).join("")}</div>
  </section>

  <section>
    <div class="sec-h"><h2>Kopija</h2></div>
    <p class="lead">Rezervna kopija svih podataka u jednom fajlu. Isti fajl služi i za prenos podataka iz prve verzije.</p>
    <div class="row-btns" style="margin-top:14px">
      <button class="btn sage" data-export>Sačuvaj kopiju</button>
      <label class="filebtn"><input type="file" id="bk-file" accept=".json,application/json"><span class="b ghost">Uvezi kopiju</span></label>
    </div>
  </section>

  <section>
    <div class="row-btns"><button class="btn" data-logout>Odjavi se</button></div>
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

/* ---------- profil i statistika ---------- */
const PCT = (a, b) => (b > 0 ? Math.round((a / b - 1) * 100) : null);
function cmpLine(now, base, word) {
  if (!(now > 0)) return `<span class="meta dim">Još ništa</span>`;
  const p = PCT(now, base);
  if (p === null) return `<span class="meta dim">${esc(word)}: nema podataka</span>`;
  if (Math.abs(p) < 5) return `<span class="meta dim">Kao ${esc(word)}</span>`;
  return `<span class="meta ${p > 0 ? "up" : "down"}">${p > 0 ? "+" : ""}${p}% od ${esc(word)}</span>`;
}
// stubići: jedna serija, poslednji (tekući) istaknut, isprekidana linija proseka, dodir pokazuje iznos
function barChart(data, { label, avg = null, id }) {
  const W = 360, H = 150, top = 14, bot = 22, n = data.length;
  const max = Math.max(1, ...data.map(d => d.v), avg || 0) * 1.08;
  const bw = (W - (n - 1) * 2) / n, y = v => top + (H - top - bot) * (1 - v / max);
  const bars = data.map((d, i) => {
    const x = i * (bw + 2), h = Math.max(d.v > 0 ? 1.5 : 0, H - bot - y(d.v)), r = Math.min(3, bw / 2, h);
    const cur = i === n - 1;
    const path = h > 0 ? `M${x},${H - bot}V${H - bot - h + r}Q${x},${H - bot - h} ${x + r},${H - bot - h}H${x + bw - r}Q${x + bw},${H - bot - h} ${x + bw},${H - bot - h + r}V${H - bot}Z` : "";
    return `<g class="bar${cur ? " cur" : ""}" data-tip="${esc(label(d) + ": " + money(d.v) + " RSD")}"><rect x="${x - 1}" y="0" width="${bw + 2}" height="${H}" fill="transparent"/>${path ? `<path d="${path}"/>` : ""}</g>`;
  }).join("");
  const ticks = [0, Math.floor((n - 1) / 2), n - 1].map(i => `<text x="${i === 0 ? 0 : i === n - 1 ? W : i * (bw + 2) + bw / 2}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}">${esc(label(data[i]))}</text>`).join("");
  const avgLine = avg ? `<line class="avg" x1="0" x2="${W}" y1="${y(avg)}" y2="${y(avg)}"/>` : "";
  return `<div class="chart" id="${id}"><div class="tip meta dim" aria-live="polite">Dodirni stubić za iznos</div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafikon potrošnje"><line class="base" x1="0" x2="${W}" y1="${H - bot}" y2="${H - bot}"/>${bars}${avgLine}${ticks}</svg></div>`;
}
const MON3 = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "avg", "sep", "okt", "nov", "dec"];
function renderProfile() {
  const L = list(), td = today(), b = bal(), pr = profRow();
  const R = rhythm(L, td, avgSkip()), ins = insights(L, td, b), ne = nonEssential(L, td), hb = habits(L, td), cc = categoryCompare(L, td).slice(0, 7);
  const mode = S.chart || "dani";
  const chart = mode === "nedelje"
    ? barChart(seriesWeeks(R.daily, td, 10), { id: "ch", label: d => dShort(d.key) })
    : mode === "meseci"
      ? barChart(seriesMonths(L, td, 6, avgSkip()), { id: "ch", label: d => MON3[+d.key.slice(5) - 1] })
      : barChart(seriesDays(R.daily, td, 30), { id: "ch", label: d => dShort(d.key), avg: R.avg30 });
  const ccMax = Math.max(1, ...cc.map(r => Math.max(r.now, r.before)));
  const WD = ["ponedeljkom", "utorkom", "sredom", "četvrtkom", "petkom", "subotom", "nedeljom"];
  const tile = (name, v, cmp) => `<div class="tile"><span class="meta dim">${name}</span><span class="v num">${money(v)}</span>${cmp}</div>`;
  app.innerHTML = `<div class="band prof">
    <div class="top"><div class="logo">[kolko para?]</div>${avaBtn()}</div>
    <label class="ava big" aria-label="Promeni sliku"><input type="file" id="ava-file" accept="image/*" hidden>${avaHtml(48)}</label>
    <div class="pname">${esc(pr?.merchant || "Profil")}</div>
    ${b ? `<div class="label">Ostalo</div><h1 class="num">${b.now < 0 ? "-" : ""}${money(b.now)}<span class="rsd">RSD</span></h1>
      <p class="sub"><span>Stanje ${esc(dShort(b.d0))}</span> ${money(b.start)}<span>, uplate</span> ${b.inc ? "+" : ""}${money(b.inc)}<span>, potrošeno</span> ${b.spend ? "-" : ""}${money(b.spend)}</p>`
      : `<p class="sub"><span>Upiši koliko imaš, pa ovde pratiš stanje kao u banci.</span></p>`}
    <div class="haverow"><button class="have add" data-income><span class="meta">+ Uplata</span></button><button class="have add" data-have><span class="meta">${b ? "Ispravi stanje" : "Upiši stanje"}</span></button></div>
    <div class="wallet" data-model="novcanice"></div>
  </div>

  <section>
    <div class="sec-h"><h2>${icon("ritam", 26)} Ritam</h2><span class="meta dim">Bez prolaznog novca${avgSkip() ? ", računa i pretplata" : ""}</span></div>
    ${avgChips()}
    ${budgetFacts()}
    <div class="tiles">
      ${tile("Danas", R.today, cmpLine(R.today, R.avg30, "proseka"))}
      ${tile("Ova nedelja", R.week, cmpLine(R.week, R.lastWeekSame, "prošle"))}
      ${tile("Ovaj mesec", R.month, R.hasLastMonth ? cmpLine(R.month, R.lastMonthSame, "prošlog") : `<span class="meta dim">Do danas</span>`)}
      ${tile("Prošli mesec", R.lastMonth, `<span class="meta dim">${R.hasLastMonth ? "Ceo mesec" : "Samo deo meseca u appu"}</span>`)}
    </div>
    <p class="note">Prosečan dan poslednjih 30 dana: <b>${money(R.avg30)} RSD</b>. Ovim tempom ceo mesec izlazi oko <b>${money(R.projected)} RSD</b>${b ? `, a na kraju meseca ostalo bi oko <b>${money(b.now - (R.projected - R.month))} RSD</b>` : ""}.</p>
  </section>

  <section>
    <div class="sec-h"><h2>${icon("grafikon", 26)} Grafikoni</h2></div>
    <div class="wallet wide" data-model="grafikon"></div>
    <div class="periods" style="margin:18px 0 10px">${[["dani", "30 dana"], ["nedelje", "Nedelje"], ["meseci", "Meseci"]].map(([id, n]) => `<button class="chip" data-chart="${id}" aria-pressed="${mode === id}">${n}</button>`).join("")}</div>
    ${chart}
    <p class="note" style="margin-top:6px">${mode === "dani" ? `Isprekidana linija je prosečan dan, ${money(R.avg30)} RSD. Gotovina se računa na dan podizanja.` : mode === "nedelje" ? "Nedelja od ponedeljka. Poslednja je ova, do danas." : "Poslednji mesec je ovaj, do danas."}</p>
    ${cc.length ? `<div class="cc">
      <div class="sec-h" style="margin:26px 0 8px"><span class="meta">Ovaj i prošli mesec</span><span class="lg"><i class="a"></i><span class="meta dim">ovaj, do danas</span><i class="b"></i><span class="meta dim">prošli</span></span></div>
      ${cc.map(r => `<button class="ccrow" data-cat="${r.id}"><span class="n">${catIcon(r.id, 16)}${esc(catName(r.id))}</span>
        <span class="bars"><i class="a" style="width:${(r.now / ccMax * 100).toFixed(1)}%"></i><i class="b" style="width:${(r.before / ccMax * 100).toFixed(1)}%"></i></span>
        <span class="v num">${money(r.now)}<span class="dim"> / ${money(r.before)}</span></span></button>`).join("")}
    </div>` : ""}
  </section>

  <section>
    <div class="sec-h"><h2>${icon("upozorenje", 26)} Upozorenja</h2><span class="meta dim">${ins.length ? ins.filter(i => i.level === "warn").length + " važno" : ""}</span></div>
    ${ins.length ? `<div class="ins">${ins.map(i => `<div class="icard ${i.level}"><span class="tic">${catIcon(i.icon, 20)}</span><div><b>${esc(i.title)}</b><p>${esc(i.text)}</p></div></div>`).join("")}</div>`
      : `<p class="note">Za sada nema ništa neobično.</p>`}
  </section>

  <section>
    <div class="sec-h"><h2>${icon("nenuzno", 26)} Nije nužno</h2><span class="meta dim">Poslednjih 30 dana</span></div>
    ${ne.sum ? `<div class="tiles">
      <div class="tile"><span class="meta dim">Ukupno</span><span class="v num">${money(ne.sum)}</span><span class="meta dim">${ne.share}% potrošnje</span></div>
      <div class="tile"><span class="meta dim">Godišnje, ovim tempom</span><span class="v num">${money(ne.yearly)}</span><span class="meta dim">ako se ništa ne promeni</span></div>
    </div>
    <div class="rows" style="margin-top:12px">${ne.rows.map(r => `<button class="crow" data-cat="${r.id}">${catIcon(r.id, 22)}<span class="name">${esc(catName(r.id))}</span><span class="amt num">${money(r.v)}</span><span class="bar"><i style="width:${(r.v / ne.rows[0].v * 100).toFixed(1)}%"></i></span><span class="meta dim">${r.id === "cigarete" && ne.packs ? `${ne.packs} ${ne.packs % 10 === 1 && ne.packs % 100 !== 11 ? "paklica" : "paklice"} sa skeniranih računa` : ""}</span></button>`).join("")}</div>`
      : `<p class="note">Nema troškova na cigarete, alkohol, izlaske, dostavu, taksi i pretplate.</p>`}
  </section>

  ${(() => { const bk = basket(L.filter(e => e.d >= dstrBack(td, 29)), S.data.rules).filter(g => g.id !== "ostalo").slice(0, 6); return `<section>
    <div class="sec-h"><h2>${icon("korpa", 26)} Šta kupuješ</h2><span class="meta dim">Poslednjih 30 dana, sa računa</span></div>
    ${bk.length ? `<div class="facts">${bk.map(g => `<div><span class="meta dim">${esc(g.name)}</span><span>${esc(amountText(g))}, ${money(g.sum)} RSD</span></div>`).join("")}</div>` : `<p class="note">Kad skeniraš račune, ovde piše koliko čega kupuješ.</p>`}
    <div class="row-btns" style="margin-top:14px"><button class="cta" data-go="korpa">[ Cela korpa ]</button></div>
  </section>`; })()}

  <section>
    <div class="sec-h"><h2>${icon("navike", 26)} Navike</h2><span class="meta dim">Poslednjih 60 dana</span></div>
    <div class="facts">
      <div><span class="meta dim">Najviše trošiš</span><span>${esc(WD[hb.topWd])}, prosečno ${money(hb.avgWd[hb.topWd])} RSD</span></div>
      ${hb.top ? `<div><span class="meta dim">Najčešće kupuješ</span><span>${esc(hb.top.name)}, ${puta(hb.top.n)}, ukupno ${money(hb.top.v)} RSD</span></div>` : ""}
      <div><span class="meta dim">Kupovina</span><span>${hb.buys}, prosečno ${money(hb.avgBuy)} RSD</span></div>
    </div>
  </section>

  <section>
    <div class="sec-h"><h2>${icon("osoba", 26)} Profil</h2></div>
    <label class="field" style="max-width:360px"><span class="meta dim">Ime</span><input id="p-name" value="${esc(pr?.merchant || "")}" placeholder="Kako da te app zove" autocomplete="given-name"></label>
    <p class="note"><span class="meta dim">${esc(S.session?.user?.email || "")}</span></p>
  </section>`;
  document.getElementById("ava-file").onchange = ev => { const f = ev.target.files[0]; ev.target.value = ""; if (f) openCropper(f); };
  document.getElementById("p-name").onchange = ev => saveProfile({ merchant: ev.target.value.trim() });
  const ch = document.getElementById("ch");
  if (ch) ch.addEventListener("click", ev => { const g = ev.target.closest("[data-tip]"); if (!g) return; ch.querySelectorAll(".bar.on").forEach(x => x.classList.remove("on")); g.classList.add("on"); ch.querySelector(".tip").textContent = g.dataset.tip; });
  startWallet();
}
async function saveProfile(patch) {
  const pr = profRow();
  if (pr) {
    if (!await guard(() => updateReceipt(pr.id, patch), "Sačuvano")) return false;
    Object.assign(pr, patch);
  } else {
    const row = { kind: "manual", cat: "profil", total: 0, issued_at: "2000-01-01T12:00:00", merchant: "", store: "", payment: "racun", refund: false, items: [], person: "", journal: null, ...patch };
    const saved = await guard(() => insertReceipt(row), "Sačuvano");
    if (!saved) return false;
    S.data.receipts.push(saved);
  }
  render(); return true;
}
/* slika: biranje dela slike koji ide u krug (kao u "kako ide?") */
async function openCropper(file) {
  try {
    const url = URL.createObjectURL(file);
    const img = new Image(); img.src = url; await img.decode();
    S.sheet = { kind: "crop", src: url, img, w: img.naturalWidth, h: img.naturalHeight, x: 0, y: 0, z: 1 };
    drawSheet();
  } catch (e) { toast("Slika nije otvorena. Probaj drugu."); }
}
function cropGeom(st, S0) {
  const k = S0 / Math.min(st.w, st.h) * st.z;
  const mx = Math.max(0, (st.w * k - S0) / 2), my = Math.max(0, (st.h * k - S0) / 2);
  st.x = Math.max(-mx, Math.min(mx, st.x)); st.y = Math.max(-my, Math.min(my, st.y));
  return { k, left: S0 / 2 - st.w * k / 2 + st.x, top: S0 / 2 - st.h * k / 2 + st.y };
}
function drawCrop() {
  const st = S.sheet;
  layer.innerHTML = `<div class="scrim" data-close></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="c-t"><div class="sheet-in">
    <span class="meta dim">Profil</span><h3 id="c-t">Slika</h3>
    <p class="note" style="margin:0">Prevuci sliku prstom da lice bude u krugu. Klizač je povećava.</p>
    <div class="crop" id="crop"><img alt="" src="${esc(st.src)}" draggable="false"></div>
    <label class="field" style="max-width:300px"><span class="meta dim">Veličina</span><input type="range" id="crop-z" min="1" max="4" step="0.01" value="${st.z}"></label>
    <div class="row-btns"><button class="cta" data-cropsave>[ Sačuvaj ]</button><button class="btn" data-close>Otkaži</button></div>
  </div></div>`;
  const box = document.getElementById("crop"), img = box.querySelector("img"), zr = document.getElementById("crop-z");
  const place = () => { const g = cropGeom(st, box.clientWidth); img.style.width = st.w * g.k + "px"; img.style.height = st.h * g.k + "px"; img.style.transform = `translate(${g.left}px, ${g.top}px)`; };
  place();
  let drag = null;
  box.onpointerdown = ev => { box.setPointerCapture(ev.pointerId); drag = { x: ev.clientX, y: ev.clientY, sx: st.x, sy: st.y }; };
  box.onpointermove = ev => { if (!drag) return; st.x = drag.sx + ev.clientX - drag.x; st.y = drag.sy + ev.clientY - drag.y; place(); };
  box.onpointerup = box.onpointercancel = () => { drag = null; };
  zr.oninput = () => { const S0 = box.clientWidth, old = cropGeom(st, S0).k; st.z = +zr.value; const nk = cropGeom(st, S0).k; st.x *= nk / old; st.y *= nk / old; place(); };
  st.size = () => box.clientWidth;
}
async function saveCrop() {
  const st = S.sheet, S0 = st.size(), OUT = 384, g = cropGeom(st, S0), f = OUT / S0;
  const c = document.createElement("canvas"); c.width = c.height = OUT;
  c.getContext("2d").drawImage(st.img, g.left * f, g.top * f, st.w * g.k * f, st.h * g.k * f);
  const data = c.toDataURL("image/jpeg", 0.86);
  URL.revokeObjectURL(st.src);
  S.sheet = null; drawSheet();
  await saveProfile({ journal: data });
}

/* ---------- po danu: šta je kupljeno tog dana ---------- */
function dayPicker(d) {
  const td = today(), yd = dstrBack(td, 1);
  return `<div class="periods daypick">
    ${d ? `<button class="chip" data-dstep="-1" aria-label="Dan ranije">‹</button>` : `<span class="meta">Po danu</span>`}
    <button class="chip" data-day="0" aria-pressed="${d === td}">Danas</button>
    <button class="chip" data-day="1" aria-pressed="${d === yd}">Juče</button>
    <label class="chip datechip" aria-pressed="${!!d && d !== td && d !== yd}">${d && d !== td && d !== yd ? esc(dShort(d) + d.slice(0, 4)) : "Izaberi datum"}<input type="date" id="day-in" max="${td}" value="${esc(d || td)}" aria-label="Izaberi datum"></label>
    ${d ? `<button class="chip" data-dstep="1" aria-label="Dan kasnije" ${d >= td ? "disabled" : ""}>›</button>` : ""}
  </div>`;
}
function bindDayInput() {
  const di = document.getElementById("day-in");
  if (di) di.onchange = () => { if (!di.value) return; S.day = di.value > today() ? today() : di.value; S.view = "dan"; render(); window.scrollTo(0, 0); };
}
function renderDay() {
  const td = today(), d = S.day || td, yd = dstrBack(td, 1);
  const L = list().filter(e => e.d === d), T = totals(L);
  const buys = L.filter(e => e.parts.some(p => CAT[p.cat]?.kind === "spend" && p.cat !== "gotovina" && p.amount < 0));
  const items = L.reduce((n, e) => n + (e.receipt?.items || []).length, 0);
  const lb = lastBank();
  const cats = CATS.filter(c => c.kind === "spend" && T.by[c.id] && -T.by[c.id].sum > 0.004).map(c => ({ c, sum: -T.by[c.id].sum })).sort((a, b) => b.sum - a.sum);
  app.innerHTML = `${header()}
  <div class="hero"><div><span class="eyebrow">[${esc(dDay(d))}]</span></div><h1>${d === td ? "Danas" : d === yd ? "Juče" : esc(dShort(d))}</h1></div>
  ${dayPicker(d)}
  <div class="tiles" style="margin-top:20px">
    <div class="tile"><span class="meta dim">Potrošeno</span><span class="v num">${money(T.spend)}</span><span class="meta dim">${buys.length} ${buys.length % 10 === 1 && buys.length % 100 !== 11 ? "kupovina" : "kupovine"}${items ? `, ${stavki(items).replace("stavk", "artik").replace("artika", "artikla").replace("artiki", "artikala")}` : ""}</span></div>
    <div class="tile"><span class="meta dim">${T.inc ? "Uplate" : "Najviše na"}</span><span class="v num">${T.inc ? money(T.inc) : cats[0] ? money(cats[0].sum) : "0"}</span><span class="meta dim">${T.inc ? "tog dana" : cats[0] ? esc(cats[0].c.name) : "ništa"}</span></div>
  </div>
  ${cats.length > 1 ? `<div class="facts" style="margin-top:12px">${cats.map(x => `<div><span class="meta dim">${esc(x.c.name)}</span><span class="num">${money(x.sum)} RSD</span></div>`).join("")}</div>` : ""}
  <section style="margin-top:22px">
    ${L.map(e => rowHtml(e) + ((e.receipt?.items || []).length ? `<div class="kitems">${e.receipt.items.map(it => `<div class="krow"><span class="n">${esc(String(it.name).replace(/^\s*\d{4,8}\s+(?=\D)/, ""))}</span><span class="v num">${money(it.total, true)}</span>${it.qty && it.qty !== 1 ? `<span class="meta dim">${String(it.qty).replace(".", ",")} x ${money(it.price || it.total / it.qty, true)}</span>` : ""}</div>`).join("")}</div>` : "")).join("")
      || `<div class="empty"><span class="meta dim">Tog dana nema ništa upisano</span></div>`}
  </section>
  ${lb && lb < d ? `<p class="note">Izvod iz banke je ubačen do ${esc(dShort(lb) + lb.slice(0, 4))}. Plaćanja karticom posle toga vide se ovde samo ako si skenirao račun ili ih upisao.</p>` : ""}`;
  bindDayInput();
}

/* ---------- korpa: šta je kupljeno, po vrstama artikala ---------- */
const dstrBack = (d, n) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() - n); return t.toISOString().slice(0, 10); };
function renderBasket() {
  const td = today(), per = S.kper || "mesec", ym = td.slice(0, 7);
  const pm = (() => { const [y, m] = ym.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; })();
  const pick = { mesec: e => e.d.startsWith(ym), prosli: e => e.d.startsWith(pm), "30": e => e.d >= dstrBack(td, 29), sve: () => true }[per];
  const all = list(), L = all.filter(pick), bk = basket(L, S.data.rules);
  const scanned = L.filter(e => e.receipt && (e.receipt.items || []).length).length;
  const max = Math.max(1, ...bk.map(g => g.sum));
  app.innerHTML = `${header()}
  <div class="hero"><div><span class="eyebrow">[sa skeniranih računa]</span></div><h1>Korpa</h1>
    <p class="lead">Koliko čega kupuješ, artikal po artikal, bez obzira u kojoj radnji. Cigarete iz Maxija i iz Univerexporta se sabiraju zajedno.</p></div>
  <div class="periods" style="margin-top:22px">${[["mesec", "Ovaj mesec"], ["prosli", "Prošli mesec"], ["30", "30 dana"], ["sve", "Sve"]].map(([id, n]) => `<button class="chip" data-kper="${id}" aria-pressed="${per === id}">${n}</button>`).join("")}</div>
  <p class="note">${scanned ? `${scanned} ${racuna(scanned)} sa artiklima.` : "U ovom periodu nema skeniranih računa sa artiklima."} Stavke iz banke nemaju artikle, pa se ovde ne vide.</p>
  <section style="margin-top:22px">
    <div class="rows">${bk.map(g => {
      const open = S.kopen === g.id;
      return `<button class="crow" data-kgrp="${g.id}" aria-expanded="${open}">${catIcon(g.icon, 22)}<span class="name">${esc(g.name)}</span><span class="amt num">${money(g.sum)}</span>
        <span class="bar"><i style="width:${(g.sum / max * 100).toFixed(1)}%"></i></span><span class="meta dim">${esc(amountText(g))}</span></button>
        ${open ? `<div class="kitems">${g.items.map(i => `<div class="krow"><span class="n">${esc(i.name)}</span><span class="v num">${money(i.sum, true)}</span>
          <span class="meta dim">${esc(amountText({ ...g, pieces: i.pieces, weight: i.weight }))}, ${esc(i.stores.join(", "))}, poslednji put ${esc(dShort(i.last))}</span></div>`).join("")}</div>` : ""}`;
    }).join("") || `<div class="empty"><span class="meta dim">Nema artikala</span></div>`}</div>
  </section>`;
}

/* ---------- koliko smeš dnevno ---------- */
const endOfMonth = d => { const [y, m] = d.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
function planRow() { return S.data.receipts.filter(r => r.cat === "plan").sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || ""))).pop(); }
// do kog dana novac treba da potraje: upisan datum, ili kraj meseca (i kad upisan datum prođe)
function planUntil() { const r = planRow(), td = today(), d = r ? String(r.issued_at).slice(0, 10) : ""; return r && r.merchant !== "auto" && d >= td ? d : endOfMonth(td); }
function budget() { const b = bal(); return b ? dailyBudget(b.now, list(), today(), planUntil()) : null; }
function budgetLine() {
  const B = budget(); if (!B) return "";
  return `<button class="budget" data-plan><span class="label">Smeš dnevno</span><span class="bnum num">${B.perDay < 0 ? "-" : ""}${money(B.perDay)}</span><span class="meta">do ${esc(dShort(B.until))}${B.perDay > 0 ? `, danas još ${B.leftToday < 0 ? "-" : ""}${money(B.leftToday)}` : ""}</span></button>`;
}
function budgetFacts() {
  const B = budget(); if (!B) return "";
  return `<div class="facts" style="margin-top:14px">
    <div><span class="meta dim">Smeš dnevno do ${esc(dShort(B.until))}</span><span>${B.perDay < 0 ? "-" : ""}${money(B.perDay)} RSD, ${B.daysLeft} ${B.daysLeft % 10 === 1 && B.daysLeft % 100 !== 11 ? "dan" : "dana"}</span></div>
    <div><span class="meta dim">Danas</span><span>potrošeno ${money(B.spentToday)}, ostalo ${B.leftToday < 0 ? "-" : ""}${money(B.leftToday)} RSD</span></div>
    <div><span class="meta dim">Odvojeno za račune i pretplate</span><span>${money(B.reserve)} RSD</span></div>
  </div>
  <div class="row-btns" style="margin-top:10px"><button class="btn" data-plan>Promeni datum</button></div>`;
}
function openPlan() { S.sheet = { kind: "plan", date: planUntil() }; drawSheet(); }
function drawPlanSheet() {
  const st = S.sheet, b = bal(), B = b ? dailyBudget(b.now, list(), today(), st.date) : null;
  layer.innerHTML = `<div class="scrim" data-close></div>
  <div class="sheet" role="dialog" aria-modal="true"><div class="sheet-in">
    <span class="meta dim">Do sledeće uplate, ili do kraja meseca</span>
    <h3>Koliko smeš dnevno</h3>
    ${B ? `<div class="num" style="font-size:40px;font-weight:500;letter-spacing:-.02em;line-height:1">${B.perDay < 0 ? "-" : ""}${money(B.perDay)} <span class="meta dim">RSD dnevno</span></div>
    <div class="hrows">
      <div><span>Ostalo sada</span><span class="num">${b.now < 0 ? "-" : ""}${money(b.now)}</span></div>
      ${B.spentToday ? `<div><span>Potrošeno danas</span><span class="num">+${money(B.spentToday)}</span></div>` : ""}
      <div><span>Računi i pretplate do tada</span><span class="num">${B.reserve ? "-" : ""}${money(B.reserve)}</span></div>
      <div><span>Podeljeno na ${B.daysLeft} ${B.daysLeft % 10 === 1 && B.daysLeft % 100 !== 11 ? "dan" : "dana"}, sa današnjim</span><span class="num">${B.perDay < 0 ? "-" : ""}${money(B.perDay)}</span></div>
    </div>
    <p class="note" style="margin:0">${B.pool < 0 ? "Ostalo ne pokriva račune i pretplate do tog datuma. " : ""}Računi i pretplate za mesec su procena: ono što si za njih platio prošlog meseca${B.paid ? `, umanjeno za ${money(B.paid)} plaćenih ovog meseca` : ""}. Kasica se ne računa.</p>` : `<p class="note" style="margin:0">Prvo upiši koliko imaš (dodirni Ostalo na početnoj), pa ovde piše koliko smeš dnevno.</p>`}
    <div class="map">
      <label class="field"><span class="meta">Do kada treba da izdržiš</span><input id="pl-date" type="date" min="${today()}" value="${esc(st.date)}"></label>
    </div>
    <div class="row-btns"><button class="cta" data-plsave>[ Sačuvaj ]</button><button class="btn" data-plauto>Do kraja meseca</button><button class="btn" data-close>Zatvori</button></div>
  </div></div>`;
}
async function savePlan(auto) {
  const d = auto ? endOfMonth(today()) : (document.getElementById("pl-date").value || "");
  if (!auto && (!d || d < today())) { toast("Izaberi današnji ili kasniji datum"); return; }
  const row = { kind: "manual", cat: "plan", refund: false, total: 0, issued_at: d + "T12:00:00", merchant: auto ? "auto" : "", store: "", payment: "racun", items: [], person: "" };
  const saved = await guard(() => insertReceipt(row), "Sačuvano");
  if (!saved) return;
  S.data.receipts.push({ ...saved, created_at: saved.created_at || new Date().toISOString() }); S.sheet = null; drawSheet(); render();
}

/* ---------- štednja: kasica u gotovini ---------- */
const meseci = n => n + " " + (n % 10 === 1 && n % 100 !== 11 ? "mesec" : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? "meseca" : "meseci");
const nedelja = n => n % 10 === 1 && n % 100 !== 11 ? "nedelja" : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? "nedelje" : "nedelja";
function renderSavings() {
  const sv = savings(S.data.receipts), td = today(), ne = nonEssential(list(), td);
  const plan = sv.goal && sv.left > 0 ? [1000, 2000, 5000].map(w => { const n = Math.ceil(sv.left / w); return `<div><span class="meta dim">${money(w)} RSD nedeljno</span><span>${n} ${nedelja(n)}${n > 8 ? `, oko ${meseci(Math.round(n / 4.345))}` : ""}</span></div>`; }).join("") : "";
  app.innerHTML = `<div class="band prof save">
    <div class="top"><div class="logo">[kolko para?]</div>${avaBtn()}</div>
    <div class="label">U kasici</div>
    <h1 class="num">${money(sv.total)}<span class="rsd">RSD</span></h1>
    <p class="sub">${sv.goal ? `<span>${esc(sv.goal.name || "Cilj")}</span> ${money(sv.goal.amount)}<span>, ${sv.left ? "još" : "cilj je pun"}</span> ${sv.left ? money(sv.left) : ""}` : `<span>Gotovina, odvojeno od onoga što trošiš</span>`}</p>
    ${sv.goal ? `<div class="goalbar" role="progressbar" aria-valuenow="${sv.pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${sv.pct}%"></i></div>` : ""}
    <div class="haverow"><button class="have add" data-save-in><span class="meta">+ U kasicu</span></button>${sv.total > 0 ? `<button class="have add" data-save-out><span class="meta">Uzmi iz kasice</span></button>` : ""}<button class="have add" data-goal><span class="meta">${sv.goal ? "Promeni cilj" : "Postavi cilj"}</span></button></div>
    <div class="wallet" data-model="kasica"></div>
  </div>

  <section>
    <div class="sec-h"><h2>${icon("kasica", 26)} Kako do ${sv.goal ? "cilja" : "prve uštede"}</h2></div>
    ${plan ? `<div class="facts">${plan}</div>` : sv.goal && !sv.left ? `<p class="note">Cilj je pun. Postavi novi kad budeš hteo.</p>`
      : `<p class="note">${sv.total ? "" : "Kasica je prazna i to je u redu. "}Ne mora mnogo odjednom: 500 dinara nedeljno je ${money(500 * 52)} za godinu, 1.000 nedeljno je ${money(1000 * 52)}. ${sv.goal ? "" : "Postavi cilj pa ovde piše koliko ti treba do njega."}</p>`}
    ${ne.sum ? `<div class="tiles" style="margin-top:14px">
      <div class="tile"><span class="meta dim">Nije nužno, 30 dana</span><span class="v num">${money(ne.sum)}</span><span class="meta dim">${esc(ne.rows.slice(0, 3).map(r => catName(r.id).toLowerCase()).join(", "))}</span></div>
      <div class="tile"><span class="meta dim">Petina toga u kasicu</span><span class="v num">${money(ne.sum / 5 / 30 * 365)}</span><span class="meta dim">za godinu</span></div>
    </div>` : ""}
    <p class="note">Novac u kasici se ne računa u Ostalo, da ga ne bi potrošio. Kad staviš podignutu gotovinu u kasicu, to nije potrošnja. Kad nešto uzmeš, vraća se u Ostalo.</p>
  </section>

  ${sv.rows.length ? `<section>
    <div class="sec-h"><h2>${icon("stavke", 26)} Istorija</h2><span class="meta dim">${sv.rows.length}</span></div>
    <div class="items">${sv.rows.map(r => `<button class="irow" data-edit="r:${esc(r.id)}"><span class="n">${r.refund ? "Iz kasice" : "U kasicu"}${r.merchant ? `, ${esc(r.merchant)}` : ""} <span class="dim">${esc(dShort(r.issued_at))}</span></span><span class="a num">${r.refund ? "-" : "+"}${money(r.total, true)}</span></button>`).join("")}</div>
  </section>` : ""}`;
  startWallet();
}
function openSave(out) { S.sheet = { kind: "save", out, amount: "", date: today(), note: "" }; drawSheet(); setTimeout(() => document.getElementById("s-amt")?.focus(), 60); }
function drawSaveSheet() {
  const st = S.sheet, sv = savings(S.data.receipts);
  layer.innerHTML = `<div class="scrim" data-close></div>
  <div class="sheet" role="dialog" aria-modal="true"><div class="sheet-in">
    <span class="meta dim">${st.out ? `U kasici je ${money(sv.total, true)} RSD` : "Gotovina koju odvajaš"}</span>
    <h3>${st.out ? "Iz kasice" : "U kasicu"}</h3>
    <div class="map">
      <label class="field"><span class="meta">Iznos</span><input id="s-amt" inputmode="decimal" value="${esc(st.amount)}" placeholder="npr. 2000"></label>
      <label class="field"><span class="meta">Datum</span><input id="s-date" type="date" value="${esc(st.date)}"></label>
      <label class="field"><span class="meta">${st.out ? "Za šta" : "Napomena"} (nije obavezno)</span><input id="s-note" value="${esc(st.note)}" placeholder="${st.out ? "npr. popravka auta" : "npr. ostatak od plate"}"></label>
    </div>
    <div class="row-btns"><button class="cta" data-ssave>[ Sačuvaj ]</button><button class="btn" data-close>Otkaži</button></div>
  </div></div>`;
}
async function saveSave() {
  const st = S.sheet, g = id => document.getElementById(id);
  const amt = Math.abs(parseAmt(g("s-amt").value)); st.date = g("s-date").value || today(); st.note = g("s-note").value.trim();
  if (!isFinite(amt) || amt <= 0) { toast("Upiši iznos"); return; }
  if (st.out && amt > savings(S.data.receipts).total + 0.005) { toast("U kasici nema toliko"); return; }
  const row = { kind: "manual", cat: "stednja", refund: !!st.out, total: Math.round(amt * 100) / 100, issued_at: st.date + "T12:00:00", merchant: st.note, store: "", payment: "gotovina", items: [], person: "" };
  const saved = await guard(() => insertReceipt(row), st.out ? "Uzeto iz kasice" : "Stavljeno u kasicu");
  if (!saved) return;
  S.data.receipts.push(saved); S.sheet = null; drawSheet(); changed();
}
function openGoal() { const g = savings(S.data.receipts).goal; S.sheet = { kind: "goal", name: g?.name || "", amount: g ? amtStr(g.amount) : "" }; drawSheet(); }
function drawGoalSheet() {
  const st = S.sheet, has = !!savings(S.data.receipts).goal;
  layer.innerHTML = `<div class="scrim" data-close></div>
  <div class="sheet" role="dialog" aria-modal="true"><div class="sheet-in">
    <span class="meta dim">Za šta štediš i koliko ti treba</span>
    <h3>Cilj štednje</h3>
    <div class="map">
      <label class="field"><span class="meta">Za šta</span><input id="g-name" value="${esc(st.name)}" placeholder="npr. letovanje, rezerva"></label>
      <label class="field"><span class="meta">Koliko</span><input id="g-amt" inputmode="decimal" value="${esc(st.amount)}" placeholder="npr. 100000"></label>
    </div>
    <div class="row-btns"><button class="cta" data-gsave>[ Sačuvaj ]</button><button class="btn" data-close>Otkaži</button>${has ? `<button class="btn" data-gdel>Ukloni cilj</button>` : ""}</div>
  </div></div>`;
}
async function saveGoal(remove) {
  const g = id => document.getElementById(id);
  const amt = remove ? 0 : Math.abs(parseAmt(g("g-amt").value)), name = remove ? "" : g("g-name").value.trim();
  if (!remove && (!isFinite(amt) || amt <= 0)) { toast("Upiši koliko ti treba"); return; }
  const row = { kind: "manual", cat: "cilj", refund: false, total: Math.round((amt || 0) * 100) / 100, issued_at: today() + "T12:00:00", merchant: name, store: "", payment: "gotovina", items: [], person: "" };
  const saved = await guard(() => insertReceipt(row), remove ? "Cilj uklonjen" : "Cilj sačuvan");
  if (!saved) return;
  S.data.receipts.push({ ...saved, created_at: saved.created_at || new Date().toISOString() }); S.sheet = null; drawSheet(); render();
}

/* ---------- koliko imaš ---------- */
const bal = () => balance(S.data.receipts, list());
function haveLine() {
  const b = bal();
  const have = b ? `<button class="have" data-have><span class="meta">Imaš</span><span class="num">${b.now < 0 ? "-" : ""}${money(b.now)}</span><span class="meta">RSD</span></button>`
    : `<button class="have empty" data-have><span class="meta">Koliko imaš?</span></button>`;
  return `<div class="haverow">${have}<button class="have add" data-income><span class="meta">+ Uplata</span></button></div>`;
}
function openHave() { S.sheet = { kind: "have", edit: !bal() }; drawSheet(); }
function drawHave() {
  const st = S.sheet, b = bal();
  const incs = b ? list().filter(e => e.amount > 0 && e.parts.some(p => p.cat === "priliv") && (e.d > b.d0 || (e.d === b.d0 && e.type === "receipt" && String(e.receipt.created_at || "") > String(b.row.created_at || "")))) : [];
  layer.innerHTML = `<div class="scrim" data-close></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="h-t"><div class="sheet-in">
    <span class="meta dim">Na računu i u gotovini, bez tuđeg novca</span>
    <h3 id="h-t">Koliko imaš</h3>
    ${b ? `<div class="num" style="font-size:40px;font-weight:500;letter-spacing:-.02em;line-height:1">${b.now < 0 ? "-" : ""}${money(b.now)} <span class="meta dim">RSD</span></div>
      <div class="hrows">
        <div><span>Stanje ${esc(dShort(b.d0) + b.d0.slice(0, 4))}.</span><span class="num">${money(b.start)}</span></div>
        <div><span>Uplate od tada</span><span class="num">${b.inc ? "+" : ""}${money(b.inc)}</span></div>
        <div><span>Potrošeno od tada</span><span class="num">${b.spend ? "-" : ""}${money(b.spend)}</span></div>
        ${b.saved ? `<div><span>U kasicu od tada</span><span class="num">${b.saved > 0 ? "-" : "+"}${money(b.saved)}</span></div>` : ""}
      </div>
      ${incs.length ? `<div class="field"><span class="meta">Uplate</span><div class="items">${incs.slice(0, 8).map(e => `<button class="irow" data-edit-in="${esc(e.id)}"><span class="n">${esc(e.name)} <span class="dim">${esc(dShort(e.d))}</span></span><span class="a num">+${money(e.amount, true)}</span>${e.pending ? `<span class="meta dim">čeka izvod</span>` : ""}</button>`).join("")}</div></div>` : ""}`
      : `<p class="note" style="margin:0">Upiši koliko novca imaš sada, na računu i u novčaniku zajedno. Od tog trenutka uplate se dodaju, a troškovi oduzimaju.</p>`}
    ${st.edit ? `<div class="map">
        <label class="field"><span class="meta">Imam sada</span><input id="h-amt" inputmode="decimal" placeholder="npr. 85000" value="${esc(st.amt || "")}"></label>
        <label class="field"><span class="meta">Na dan</span><input id="h-date" type="date" value="${esc(st.date || today())}"></label>
      </div>
      <div class="row-btns"><button class="cta" data-hsave>[ Sačuvaj stanje ]</button>${b ? `<button class="btn" data-hcancel>Otkaži</button>` : `<button class="btn" data-income>+ Uplata</button>`}</div>`
    : `<div class="row-btns"><button class="cta" data-income>[ + Uplata ]</button><button class="btn" data-hedit>Ispravi stanje</button><button class="btn" data-close>Zatvori</button></div>`}
  </div></div>`;
}
async function saveHave() {
  const st = S.sheet, a = document.getElementById("h-amt"), d = document.getElementById("h-date");
  st.amt = a.value; st.date = d.value;
  const v = parseAmt(a.value);
  if (!isFinite(v)) { toast("Upiši iznos, na primer 85000"); return; }
  const row = { kind: "manual", issued_at: (d.value || today()) + "T12:00:00", merchant: "Stanje", store: "", total: Math.round(v * 100) / 100, payment: "racun", refund: false, items: [], cat: "stanje", person: "" };
  const saved = await guard(() => insertReceipt(row), "Stanje sačuvano");
  if (!saved) return;
  S.data.receipts.push(saved); cache = null;
  S.sheet = { kind: "have", edit: false }; drawSheet(); render();
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
    return `<button class="irow" data-item="${i}"><span class="n">${esc(it.name)}${it.qty && it.qty !== 1 ? ` <span class="dim">x ${String(it.qty).replace(".", ",")}</span>` : ""}</span><span class="a num">${money(it.total, true)}</span><span class="meta dim">${ic ? catIcon(ic.cat, 14) + esc(catName(ic.cat)) : "kao ceo račun"}</span></button>`;
  }).join("")}</div><p class="note" style="margin:0">Dodirni artikal da mu zadaš kategoriju, npr. cigarete.</p></div>`;
}
function drawSheet() {
  const st = S.sheet;
  if (!st) { layer.innerHTML = ""; document.body.style.overflow = ""; return; }
  document.body.style.overflow = "hidden";
  if (st.kind === "item") return drawItemSheet();
  if (st.kind === "result") return drawResult();
  if (st.kind === "manual") return drawManual();
  if (st.kind === "save") return drawSaveSheet();
  if (st.kind === "goal") return drawGoalSheet();
  if (st.kind === "plan") return drawPlanSheet();
  if (st.kind === "ocrwait") return drawOcrWait();
  if (st.kind === "ocr") return drawOcr();
  if (st.kind === "have") return drawHave();
  if (st.kind === "crop") return drawCrop();
  const e = st.e, rc = e.receipt, isPass = st.cat === "prolazno", isRec = e.type === "receipt";
  layer.innerHTML = `<div class="scrim" data-close></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh-t"><div class="sheet-in">
    <div class="meta dim">${esc(dDay(e.d))}</div>
    <h3 id="sh-t">${esc(e.name)}</h3>
    <div class="num" style="font-size:22px;font-weight:500">${signed(e.amount)} RSD</div>
    <div class="meta dim" style="letter-spacing:.04em;text-transform:none">${esc(e.type === "bank" ? e.t : [rc.merchant, rc.store].filter(Boolean).join(", "))}${e.fee ? ", uključena konverzija " + money(-e.fee, true) : ""}${rc && e.type === "bank" ? ", uparen sa računom" : ""}</div>
    ${isRec ? `<div class="field"><span class="meta">Plaćeno</span><div class="catgrid">${["gotovina", "kartica", "racun"].map(p => `<button class="chip" data-pay="${p}" aria-pressed="${st.payment === p}">${PAYNAME[p]}</button>`).join("")}</div></div>` : ""}
    <div class="field"><span class="meta">Kategorija</span><div class="catgrid">${CATS.filter(c => c.id !== "gotovina" || !isRec).map(c => `<button class="chip" data-setcat="${c.id}" aria-pressed="${st.cat === c.id}">${catIcon(c.id, 16)}${esc(c.name)}</button>`).join("")}</div></div>
    ${isPass ? `<div class="map">
      <label class="field"><span class="meta">Za koga</span><input id="sh-person" list="sh-people" value="${esc(st.person)}" placeholder="Ime osobe" autocomplete="off"><datalist id="sh-people">${personsList().map(p => `<option value="${esc(p)}">`).join("")}</datalist></label>
      ${isRec ? "" : `<label class="field"><span class="meta">Koliko je prolazno</span><input id="sh-pass" inputmode="decimal" value="${esc(st.pass)}" placeholder="Ceo iznos ${money(e.amount, true)}"></label>`}
    </div>${isRec ? "" : `<p class="note" style="margin:0">Ostavi prazno ako je ceo iznos tuđ. Ako upišeš manji iznos, ostatak ostaje kao tvoja potrošnja.</p>`}` : ""}
    <label class="check"><input type="checkbox" id="sh-all" ${st.applyAll ? "checked" : ""}> Primeni na sve od ovog trgovca</label>
    ${st.applyAll ? `<label class="field"><span class="meta dim">Važi za sve stavke koje sadrže</span><input id="sh-key" class="search" value="${esc(st.key)}"></label>` : ""}
    ${itemsHtml(rc)}
    <div class="row-btns">
      <button class="cta" data-save>[ Sačuvaj ]</button>
      <button class="btn" data-close>Otkaži</button>
      ${e.type === "bank" && S.data.overrides[e.id] ? `<button class="btn" data-reset>Vrati na automatski</button>` : ""}
      ${rc ? `<button class="btn" data-delreceipt>${st.confirmDel ? "Sigurno obriši " + (rc.kind === "ips" ? "uplatnicu" : "račun") : "Obriši " + (rc.kind === "ips" ? "uplatnicu" : rc.kind === "manual" ? "unos" : "račun")}</button>` : ""}
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
    <div class="field"><span class="meta">Kategorija</span><div class="catgrid">${CATS.filter(c => c.kind === "spend" && c.id !== "gotovina").map(c => `<button class="chip" data-icat="${c.id}" aria-pressed="${st.cat === c.id}">${catIcon(c.id, 16)}${esc(c.name)}</button>`).join("")}</div></div>
    <label class="field"><span class="meta">Važi za sve artikle koji sadrže</span><input id="it-key" class="search" value="${esc(st.key)}"></label>
    <div class="row-btns"><button class="cta" data-isave>[ Sačuvaj ]</button><button class="btn" data-back>Nazad</button></div>
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
const CAMHINT = {
  qr: "Uperi kameru u QR kod sa računa ili uplatnice",
  text: "Za račun čiji QR ne može da se pročita. Stavi račun u okvir, ravno i izbliza, pri dobrom svetlu, da se vide artikli i ukupan iznos, pa dodirni Slikaj.",
};
function openScan() {
  closeCam();
  // 3D modeli ispod kamere troše grafiku telefona; dok je kamera otvorena, ugase se
  stopWallet();
  const cam = document.createElement("div"); cam.className = "cam"; cam.id = "cam"; cam.dataset.mode = "qr";
  cam.innerHTML = `<div class="view"><video autoplay playsinline muted></video><div class="frame"></div><button class="cta close" data-camclose>[ Nazad ]</button>
    <div class="hint" id="cam-hint">${CAMHINT.qr}</div>
    <button class="cta shutter" data-shoot>[ Slikaj ]</button><input type="file" id="cam-text" accept="image/*" capture="environment" hidden><div class="flash"></div></div>
  <div class="bottom">
    <div class="modes"><button class="mode" data-mode="qr" aria-pressed="true">Skeniraj QR</button><button class="mode" data-mode="text" aria-pressed="false">Slikaj tekst računa</button></div>
    <button class="btn" data-manual>Unesi ručno</button><button class="btn" data-voice>${icon("mikrofon", 16)} Izgovori</button>
  </div>`;
  document.body.appendChild(cam);
  const hint = cam.querySelector("#cam-hint");
  // QR se traži u oba načina: ako se ipak pročita, račun ide preko QR koda
  startQr(cam.querySelector("video"), err => {
    cam.dataset.nocam = "1";
    hint.textContent = err && err.name === "NotAllowedError"
      ? "Kamera nije dozvoljena. Dozvoli je u podešavanjima telefona, ili dodirni Slikaj da otvoriš kameru telefona."
      : "Kamera u appu ne daje sliku. Dodirni Slikaj: otvoriće se kamera telefona, pa slikaj QR kod ili ceo račun.";
  });
  cam.querySelector("#cam-text").onchange = async ev => {
    const f = ev.target.files[0]; ev.target.value = ""; if (!f) return;
    // slika iz kamere telefona: prvo QR (fiskalni račun ili uplatnica), pa tek onda čitanje teksta
    if (cam.dataset.mode === "qr") {
      hint.textContent = "Tražim QR kod na slici";
      const t = await decodePhotoQr(f);
      if (t && (isFiscalUrl(t) || parseIps(t))) { handleQr(t); return; }
    }
    startOcr(f);
  };
  cam.addEventListener("click", ev => {
    if (ev.target.closest("[data-camclose]")) closeCam();
    if (ev.target.closest("[data-manual]")) { closeCam(); openManual(); }
    if (ev.target.closest("[data-voice]")) { closeCam(); openManual(false, true); }
    if (ev.target.closest("[data-shoot]")) {
      // slika se pravi iz kamere u appu; ako kamera ne radi, otvara se kamera telefona
      const v = cam.querySelector("video"), p = cam.dataset.nocam ? null : grabFrame(v, cam.querySelector(".frame"));
      if (!p) { cam.querySelector("#cam-text").click(); return; }
      cam.classList.add("shot");
      p.then(blob => { if (blob) startOcr(blob); else cam.querySelector("#cam-text").click(); });
      return;
    }
    const m = ev.target.closest("[data-mode]");
    if (m) {
      cam.dataset.mode = m.dataset.mode;
      cam.querySelectorAll("[data-mode]").forEach(b => b.setAttribute("aria-pressed", String(b === m)));
      hint.textContent = CAMHINT[m.dataset.mode];
    }
  });
}
// QR se prihvata samo ako je fiskalni račun ili uplatnica; sve drugo kamera preskače i čita dalje
function startQr(video, onErr = () => {}) {
  let rejects = 0;
  stopCam = startCamera(video, handleQr, onErr, t => isFiscalUrl(t) || !!parseIps(t), t => {
    const hint = document.getElementById("cam-hint");
    if (++rejects >= 6 && hint && document.getElementById("cam")?.dataset.mode === "qr")
      hint.textContent = `Pročitan je QR koji nije račun ni uplatnica (${t.slice(0, 28)}...). Drži telefon mirno i malo bliže kodu.`;
  });
}
function closeCam() {
  if (stopCam) { stopCam(); stopCam = null; }
  const c = document.getElementById("cam");
  if (c) { c.remove(); startWallet(); }
}

async function handleQr(text) {
  const hint = document.getElementById("cam-hint");
  if (isFiscalUrl(text)) {
    text = fiscalUrl(text);
    if (S.data.receipts.some(r => r.source_url === text)) { closeCam(); toast("Ovaj račun je već sačuvan."); return; }
    if (hint) hint.textContent = "Čitam račun kod Poreske uprave";
    try {
      const r = await fetch("/api/receipt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: text.trim() }) });
      const j = await r.json().catch(() => ({ error: "Račun nije pročitan. Proveri internet i probaj ponovo." }));
      if (!r.ok) throw new Error(j.error || "Račun nije pročitan.");
      closeCam();
      if (j.issuedAt && sameReceipt(j.issuedAt, Math.abs(j.total))) { toast("Ovaj račun je već sačuvan."); return; }
      const rc = { kind: "fiscal", source_url: text.trim(), issued_at: j.issuedAt || today() + "T12:00:00", merchant: j.merchant || "", store: j.store || "", total: Math.abs(j.total), payment: j.payment || "kartica", refund: !!j.refund, items: j.items || [], journal: j.journal || null, cat: null, person: "" };
      S.sheet = { kind: "result", rc, warn: j.sale === false ? "Ovo nije račun o kupovini (predračun, kopija ili obuka). Ne čuvam ga." : "" };
      drawSheet();
    } catch (e) {
      if (hint) hint.textContent = e.message + " Skeniraj ponovo, a ako je QR loše odštampan, izaberi Slikaj tekst računa.";
      setTimeout(() => { if (document.getElementById("cam")) startQr(document.querySelector("#cam video")); }, 1500);
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
  setTimeout(() => { if (document.getElementById("cam")) startQr(document.querySelector("#cam video")); }, 1800);
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
    <div class="field"><span class="meta">Kategorija</span><div class="catgrid">${CATS.filter(c => c.id !== "gotovina").map(c => `<button class="chip" data-rcat="${c.id}" aria-pressed="${base === c.id}">${catIcon(c.id, 16)}${esc(c.name)}</button>`).join("")}</div></div>
    ${base === "prolazno" ? `<label class="field"><span class="meta">Za koga</span><input id="r-person" list="r-people" value="${esc(rc.person)}" autocomplete="off"><datalist id="r-people">${personsList().map(p => `<option value="${esc(p)}">`).join("")}</datalist></label>` : ""}
    ${itemsHtml(rc)}
    <div class="row-btns"><button class="cta" data-rsave ${st.warn ? "disabled" : ""}>[ Sačuvaj ]</button><button class="btn" data-close>Odbaci</button></div>
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
  afterSaved(saved);
}
function afterSaved(saved) {
  S.data.receipts.push(saved);
  S.sheet = null; drawSheet();
  cache = null;
  const e = list().find(x => x.receipt && x.receipt.id === saved.id);
  toast(e && e.type === "bank" ? "Sačuvano i upareno sa stavkom iz banke" : saved.payment === "gotovina" ? "Sačuvano kao trošak gotovinom" : "Sačuvano, upariće se kad ubaciš izvod");
  S.period = String(saved.issued_at).slice(0, 7); render();
}
// isti račun: isto vreme do minuta i isti iznos
const sameReceipt = (iso, total) => S.data.receipts.some(r => r.kind === "fiscal" && String(r.issued_at).slice(0, 16) === String(iso).slice(0, 16) && Math.abs(Math.abs(r.total) - total) < 0.01);

/* ---------- račun pročitan sa slike (tekst, bez QR koda) ---------- */
const amtStr = n => nf2.format(Math.abs(n || 0));
async function startOcr(file) {
  closeCam();
  S.sheet = { kind: "ocrwait", msg: "Pripremam sliku", pr: 0 }; drawSheet();
  const mine = S.sheet;
  try {
    const { readReceiptPhoto } = await import("./ocr.js");
    const r = await readReceiptPhoto(file, (msg, pr) => {
      if (S.sheet !== mine) return;
      mine.msg = msg; mine.pr = pr || 0;
      const m = document.getElementById("ow-msg"), b = document.getElementById("ow-bar");
      if (m) m.textContent = msg; if (b) b.style.transform = `scaleX(${Math.max(0.03, mine.pr)})`;
    });
    if (S.sheet !== mine) return;                     // korisnik je zatvorio
    if (!r.totalFound && !r.items.length) {
      S.sheet = { kind: "ocrwait", fail: "Nisam uspeo da pročitam račun sa ove slike. Slikaj ga ravno, izbliza i pri dobrom svetlu, tako da se vide artikli i ukupan iznos.", text: r.text };
      drawSheet(); return;
    }
    const iso = r.issuedAt || today() + "T12:00:00";
    const rc = { merchant: r.merchant || "", store: r.store || r.merchant || "", issued_at: iso, total: Math.abs(r.total) || 0,
      payment: r.payment || "kartica", refund: !!r.refund, cat: null, person: "",
      items: r.items.map(i => ({ ...i, total: Math.abs(i.total), orig: Math.abs(i.total) })) };
    S.sheet = { kind: "ocr", rc, text: r.text, dateFound: !!r.issuedAt, totalFound: r.totalFound, notSale: r.sale === false };
  } catch (e) {
    console.error(e);
    if (S.sheet !== mine) return;
    S.sheet = { kind: "ocrwait", fail: "Čitanje nije uspelo. Prvi put je potreban internet da se preuzme srpski jezik. Proveri vezu i probaj ponovo." };
  }
  drawSheet();
}
function drawOcrWait() {
  const st = S.sheet;
  layer.innerHTML = `<div class="scrim" data-close></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-live="polite"><div class="sheet-in">
    <span class="meta dim">Račun sa slike</span>
    ${st.fail ? `<h3>Nije pročitano</h3><p class="note" style="margin:0">${esc(st.fail)}</p>
      <div class="row-btns"><label class="filebtn"><input type="file" id="o-retake" accept="image/*" capture="environment"><span class="b cta-like">[ Slikaj ponovo ]</span></label><button class="btn" data-omanual>Unesi ručno</button><button class="btn" data-close>Zatvori</button></div>`
    : `<h3 id="ow-msg">${esc(st.msg)}</h3><div class="obar"><i id="ow-bar" style="transform:scaleX(${Math.max(0.03, st.pr || 0)})"></i></div>
      <p class="note" style="margin:0">Čitam na telefonu, bez slanja na internet. Traje nekoliko sekundi.</p>
      <div class="row-btns"><button class="btn" data-close>Otkaži</button></div>`}
  </div></div>`;
}
function readOcr() {
  const st = S.sheet, rc = st.rc, g = id => document.getElementById(id);
  if (g("o-store")) rc.store = g("o-store").value.trim();
  if (g("o-date") && g("o-date").value) rc.issued_at = g("o-date").value + "T" + ((g("o-time") && g("o-time").value) || rc.issued_at.slice(11, 16) || "12:00").slice(0, 5) + ":" + (rc.issued_at.slice(17, 19) || "00");
  if (g("o-total")) { const v = Math.abs(parseAmt(g("o-total").value)); rc.total = isFinite(v) ? v : 0; }
  if (g("o-person")) rc.person = g("o-person").value.trim();
  layer.querySelectorAll("[data-oname]").forEach(el => { const it = rc.items[+el.dataset.oname]; if (it) it.name = el.value.trim(); });
  layer.querySelectorAll("[data-oamt]").forEach(el => {
    const it = rc.items[+el.dataset.oamt]; if (!it) return;
    const v = Math.abs(parseAmt(el.value)); it.total = isFinite(v) ? v : 0;
    if (Math.abs(it.total - it.orig) > 0.004) { it.price = it.total; it.qty = 1; it.check = false; }
  });
}
function drawOcr() {
  const st = S.sheet, rc = st.rc;
  const base = rc.cat || merchantCat(S.data.rules, rc.merchant + " " + rc.store, -1).cat;
  const sum = rc.items.reduce((s, i) => s + (i.total || 0), 0), diff = Math.round((rc.total - sum) * 100) / 100;
  const sumLine = !rc.items.length ? `<p class="note" style="margin:0">Artikli nisu pročitani. Možeš da ih dopišeš ili da sačuvaš samo ukupan iznos.</p>`
    : Math.abs(diff) < 0.01 ? `<p class="okline">${icon("check", 16)} Zbir artikala se slaže sa ukupnim iznosom.</p>`
    : `<p class="err">Zbir artikala je ${amtStr(sum)}, a ukupno ${amtStr(rc.total)}. ${diff > 0 ? "Fali " + amtStr(diff) + ": neki artikal nije pročitan, dopiši ga." : "Višak " + amtStr(-diff) + ": proveri iznose artikala."}</p>`;
  layer.innerHTML = `<div class="scrim" data-close></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="o-t"><div class="sheet-in">
    <span class="meta dim">Račun pročitan sa slike, proveri pre čuvanja</span>
    <h3 id="o-t">${esc(rc.store || rc.merchant || "Račun")}</h3>
    ${st.notSale ? `<p class="err">Na računu piše da nije prodaja (predračun, kopija ili obuka). Sačuvaj ga samo ako je to greška u čitanju.</p>` : ""}
    <div class="map">
      <label class="field"><span class="meta">Prodavnica</span><input id="o-store" value="${esc(rc.store)}" placeholder="npr. Maxi"></label>
      <label class="field"><span class="meta">Ukupno${st.totalFound ? "" : ", upiši"}</span><input id="o-total" inputmode="decimal" value="${rc.total ? esc(amtStr(rc.total)) : ""}" placeholder="0,00"></label>
      <label class="field"><span class="meta">Datum${st.dateFound ? "" : ", proveri"}</span><input id="o-date" type="date" value="${esc(rc.issued_at.slice(0, 10))}"></label>
      <label class="field"><span class="meta">Vreme</span><input id="o-time" type="time" value="${esc(rc.issued_at.slice(11, 16))}"></label>
    </div>
    <div class="field"><span class="meta">Plaćeno</span><div class="catgrid">${["gotovina", "kartica", "racun"].map(p => `<button class="chip" data-opay="${p}" aria-pressed="${rc.payment === p}">${PAYNAME[p]}</button>`).join("")}</div></div>
    <div class="field"><span class="meta">Kategorija</span><div class="catgrid">${CATS.filter(c => c.id !== "gotovina").map(c => `<button class="chip" data-ocat="${c.id}" aria-pressed="${base === c.id}">${catIcon(c.id, 16)}${esc(c.name)}</button>`).join("")}</div></div>
    ${base === "prolazno" ? `<label class="field"><span class="meta">Za koga</span><input id="o-person" list="o-people" value="${esc(rc.person)}" autocomplete="off"><datalist id="o-people">${personsList().map(p => `<option value="${esc(p)}">`).join("")}</datalist></label>` : ""}
    <div class="field"><span class="meta">Artikli</span>
      <div class="oitems">${rc.items.map((it, i) => `<div class="orow${it.check ? " chk" : ""}">
        <textarea data-oname="${i}" rows="${(it.name || "").length > 24 ? 2 : 1}" aria-label="Naziv artikla" placeholder="Naziv">${esc(it.name)}</textarea>
        <input data-oamt="${i}" inputmode="decimal" value="${it.total ? esc(amtStr(it.total)) : ""}" aria-label="Iznos" placeholder="0,00">
        <button class="x" data-odel="${i}" aria-label="Ukloni artikal">×</button>
        ${it.qty && it.qty !== 1 ? `<span class="q meta dim">${String(it.qty).replace(".", ",")} x ${amtStr(it.price)}</span>` : ""}
        ${it.check ? `<span class="q meta">Proveri iznos</span>` : ""}
      </div>`).join("")}</div>
      <div><button class="btn" data-oadd>+ Dodaj artikal</button></div>
      ${sumLine}
    </div>
    <details class="raw"><summary class="meta dim">Pročitan tekst</summary><pre>${esc(st.text || "")}</pre></details>
    <div class="row-btns"><button class="cta" data-osave>[ Sačuvaj ]</button><button class="btn" data-close>Odbaci</button></div>
  </div></div>`;
}
async function saveOcr() {
  readOcr();
  const st = S.sheet, rc = st.rc;
  if (!(rc.total > 0)) { toast("Upiši ukupan iznos sa računa"); return; }
  const base = rc.cat || merchantCat(S.data.rules, rc.merchant + " " + rc.store, -1).cat;
  if (base === "prolazno" && !rc.person) { toast("Upiši za koga je ovaj novac"); return; }
  if (sameReceipt(rc.issued_at, rc.total)) { toast("Ovaj račun je već sačuvan."); return; }
  const items = rc.items.filter(i => i.name && i.total > 0).map(i => ({ name: i.name, price: i.price || i.total, qty: i.qty || 1, total: rc.refund ? -i.total : i.total }));
  const row = { kind: "fiscal", source_url: "ocr:" + rc.issued_at.slice(0, 16) + "|" + rc.total.toFixed(2), qr_text: null,
    issued_at: rc.issued_at, merchant: rc.merchant || rc.store, store: rc.store, total: rc.total, payment: rc.payment, refund: rc.refund,
    items, journal: st.text || null, cat: rc.cat || null, person: base === "prolazno" ? rc.person : "" };
  const saved = await guard(() => insertReceipt(row));
  if (!saved) return;
  afterSaved(saved);
}

function openManual(income = false, listen = false) {
  S.sheet = { kind: "manual", income, cat: "nerazvrstano", payment: income ? "racun" : "gotovina", desc: "", amount: "", date: today(), person: "", items: [], said: "", sayNote: "" };
  sttAvailable(); drawSheet(); if (listen) toggleVoice();
}
const incomeNames = () => [...new Set(S.data.receipts.filter(r => r.cat === "priliv" && r.merchant).map(r => r.merchant))].sort();
function drawManual() {
  const st = S.sheet, its = st.items || [];
  const isum = its.reduce((a, it) => a + (Math.abs(parseAmt(it.total)) || 0), 0);
  layer.innerHTML = `<div class="scrim" data-close></div>
  <div class="sheet" role="dialog" aria-modal="true"><div class="sheet-in">
    <div class="catgrid"><button class="chip" data-mmode="out" aria-pressed="${!st.income}">Trošak</button><button class="chip" data-mmode="in" aria-pressed="${!!st.income}">Uplata</button></div>
    <div class="say${st.listening ? " on" : ""}">
      <button class="saybtn" data-mvoice aria-label="${st.listening ? "Završi" : "Izgovori"}">${icon("mikrofon", 22)}<span>${st.busy ? "Prepoznajem" : st.listening ? "Slušam, dodirni kad završiš" : "Izgovori"}</span></button>
      <input id="m-say" value="${esc(st.said || "")}" placeholder="${st.income ? "npr. Akka studio uplata 100000" : "npr. pijaca, paradajz 230, krastavac 120"}" enterkeyhint="done" autocomplete="off" aria-label="Unos rečenicom">
      ${st.sayNote ? `<p class="note">${esc(st.sayNote)}</p>` : ""}
    </div>
    ${st.income ? drawIncomeFields(st) : `<h3>Trošak bez računa</h3>
    <div class="map">
      <label class="field"><span class="meta">Na šta ili gde</span><input id="m-desc" value="${esc(st.desc)}" placeholder="npr. pijaca, frizer"></label>
      <label class="field"><span class="meta">Iznos</span><input id="m-amt" inputmode="decimal" value="${esc(st.amount)}" placeholder="${isum ? amtStr(isum) : "0"}"></label>
      <label class="field"><span class="meta">Datum</span><input id="m-date" type="date" value="${esc(st.date)}"></label>
    </div>
    <div class="field"><span class="meta">Artikli, da ih Korpa broji (nije obavezno)</span>
      ${its.length ? `<div class="oitems">${its.map((it, i) => `<div class="orow">
        <textarea data-mname="${i}" rows="1" aria-label="Naziv artikla" placeholder="npr. paradajz">${esc(it.name)}</textarea>
        <input data-mamt="${i}" inputmode="decimal" value="${esc(it.total)}" aria-label="Iznos" placeholder="0">
        <button class="x" data-mdel="${i}" aria-label="Ukloni artikal">×</button>
        ${it.qty && it.qty !== 1 ? `<span class="q meta dim">${String(it.qty).replace(".", ",")} ${/\/KG$/.test(it.name) ? "kg" : "kom"}</span>` : ""}
      </div>`).join("")}</div>` : ""}
      <button class="btn" data-madd style="align-self:flex-start">+ Artikal</button>
      ${its.length ? `<span class="meta dim">Zbir artikala ${money(isum, true)}${st.amount && Math.abs(Math.abs(parseAmt(st.amount)) - isum) > 0.01 ? ", razlika ide u kategoriju ispod" : ""}</span>` : ""}
    </div>
    <div class="field"><span class="meta">Plaćeno</span><div class="catgrid">${["gotovina", "kartica", "racun"].map(p => `<button class="chip" data-mpay="${p}" aria-pressed="${st.payment === p}">${PAYNAME[p]}</button>`).join("")}</div></div>
    <div class="field"><span class="meta">Kategorija</span><div class="catgrid">${CATS.filter(c => c.kind === "spend" && c.id !== "gotovina" || c.id === "prolazno").map(c => `<button class="chip" data-mcat="${c.id}" aria-pressed="${st.cat === c.id}">${catIcon(c.id, 16)}${esc(c.name)}</button>`).join("")}</div></div>
    ${st.cat === "prolazno" ? `<label class="field"><span class="meta">Za koga</span><input id="m-person" list="m-people" value="${esc(st.person)}" autocomplete="off"><datalist id="m-people">${personsList().map(p => `<option value="${esc(p)}">`).join("")}</datalist></label>` : ""}
    <p class="note" style="margin:0">Gotovina se odbija od podignutog novca. Kartica i sa računa se uparuju sa izvodom, pa se ne računaju dva puta.</p>`}
    <div class="row-btns"><button class="cta" data-msave>[ Sačuvaj ]</button><button class="btn" data-close>Otkaži</button></div>
  </div></div>`;
}
function drawIncomeFields(st) {
  return `<h3>Uplata</h3>
    <div class="map">
      <label class="field"><span class="meta">Od koga</span><input id="m-desc" list="m-from" value="${esc(st.desc)}" placeholder="npr. Hristijan" autocomplete="off"><datalist id="m-from">${incomeNames().map(n => `<option value="${esc(n)}">`).join("")}</datalist></label>
      <label class="field"><span class="meta">Iznos</span><input id="m-amt" inputmode="decimal" value="${esc(st.amount)}" placeholder="0"></label>
      <label class="field"><span class="meta">Datum</span><input id="m-date" type="date" value="${esc(st.date)}"></label>
    </div>
    <div class="field"><span class="meta">Čiji je novac</span><div class="catgrid"><button class="chip" data-mpass="0" aria-pressed="${!st.pass}">Moj</button><button class="chip" data-mpass="1" aria-pressed="${!!st.pass}">Prolazno, nije moj</button></div></div>
    ${st.pass ? `<label class="field"><span class="meta">Za koga je, kome ide dalje</span><input id="m-person" list="m-people" value="${esc(st.person)}" placeholder="npr. Hristijan" autocomplete="off"><datalist id="m-people">${personsList().map(p => `<option value="${esc(p)}">`).join("")}</datalist></label>` : ""}
    <div class="field"><span class="meta">Gde je ušlo</span><div class="catgrid">${[["racun", "Na račun"], ["gotovina", "U gotovini"]].map(([p, n]) => `<button class="chip" data-mpay="${p}" aria-pressed="${st.payment === p}">${n}</button>`).join("")}</div></div>
    <p class="note" style="margin:0">${st.pass ? "Prolazni novac se ne dodaje na Koliko imaš. Kad ga pošalješ dalje, upiši i taj trošak kao Prolazno, pa se ni on ne oduzima." : "Dodaje se na Koliko imaš. Uplata na račun se upari sa izvodom kad ga ubaciš, pa se ne računa dva puta."}</p>`;
}
function readManual() {
  const st = S.sheet;
  const g = id => document.getElementById(id);
  if (g("m-desc")) st.desc = g("m-desc").value; if (g("m-amt")) st.amount = g("m-amt").value; if (g("m-date")) st.date = g("m-date").value; if (g("m-person")) st.person = g("m-person").value.trim();
  if (g("m-say")) st.said = g("m-say").value;
  layer.querySelectorAll("[data-mname]").forEach(el => { const it = st.items[+el.dataset.mname]; if (it) it.name = el.value.trim(); });
  layer.querySelectorAll("[data-mamt]").forEach(el => { const it = st.items[+el.dataset.mamt]; if (it) it.total = el.value.trim(); });
}
const redrawKeep = () => { const sh = layer.querySelector(".sheet"), y = sh ? sh.scrollTop : 0; drawSheet(); const n = layer.querySelector(".sheet"); if (n) n.scrollTop = y; };

// rečenica (izgovorena ili napisana) popunjava polja; korisnik proveri pa sačuva
function applySaid(text) {
  const st = S.sheet; if (!st || st.kind !== "manual") return;
  const r = parseSpoken(text, { incomeNames: incomeNames(), rules: S.data.rules });
  st.said = text;
  if (!r.desc && r.amount == null) { st.sayNote = "Nisam razumeo. Probaj ovako: pijaca, paradajz 230, krastavac 120."; return; }
  st.income = r.income;
  if (r.desc) st.desc = r.desc;
  if (r.income) st.pass = !!r.pass;
  st.amount = r.amount != null ? amtStr(r.amount) : "";
  st.payment = r.payment || (r.income ? "racun" : st.payment === "racun" && !r.income ? "gotovina" : st.payment);
  st.date = r.dayOffset ? dstrBack(today(), -r.dayOffset) : today();
  if (!r.income) { st.items = r.items.map(i => ({ name: i.name, total: amtStr(i.total), qty: i.qty })); if (r.pass) st.cat = "prolazno"; else if (r.cat) st.cat = r.cat; }
  st.sayNote = r.income ? "Proveri ime i iznos, pa sačuvaj." : r.items.length ? `Upisano ${stavki(r.items.length)}. Proveri pa sačuvaj.` : "Proveri pa sačuvaj.";
}

/*
 * Glas. Na iPhoneu, u appu dodatom na početni ekran, ugrađeno prepoznavanje (SpeechRecognition) često postoji
 * ali ništa ne radi, pa je prvi izbor snimak koji prepoznaje server (/api/transcribe). Ako server nema ključ,
 * probaj ugrađeno, sa čuvarem vremena; ako ni to ne krene, ostaje mikrofon na tastaturi.
 */
let rec = null, sttOk = null;
const VOICE_FAIL = "Mikrofon u appu ne radi na ovom telefonu. Dodirni polje iznad, pa mikrofon na tastaturi, izgovori i dodirni Gotovo.";
async function sttAvailable() {
  if (sttOk !== null) return sttOk;
  try { const r = await fetch("/api/transcribe", { cache: "no-store" }); sttOk = r.ok && !!(await r.json()).ok; } catch (_) { sttOk = false; }
  return sttOk;
}
function voiceDone(st, text, err) {
  rec = null;
  if (S.sheet !== st) return;
  st.listening = false; st.busy = false;
  if (text) applySaid(text); else if (err) st.sayNote = err;
  redrawKeep();
  if (!text && err === VOICE_FAIL) document.getElementById("m-say")?.focus();
}
async function toggleVoice() {
  const st = S.sheet; if (!st || st.busy) return;
  if (rec) { rec.finish(); return; }
  readManual();
  st.listening = true; st.sayNote = ""; redrawKeep();
  if (window.MediaRecorder && navigator.mediaDevices?.getUserMedia && await sttAvailable()) return recordVoice(st);
  speechVoice(st);
}

// snimak, pa tekst sa servera
async function recordVoice(st) {
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (_) { voiceDone(st, "", "Mikrofon nije dozvoljen. Dozvoli ga u podešavanjima telefona za ovaj app, ili koristi mikrofon na tastaturi."); return; }
  const type = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find(t => MediaRecorder.isTypeSupported?.(t)) || "";
  const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined), chunks = [];
  const stopAll = () => stream.getTracks().forEach(t => t.stop());
  const limit = setTimeout(() => rec && rec.finish(), 30000);
  rec = { finish: () => { clearTimeout(limit); if (mr.state !== "inactive") mr.stop(); } };
  mr.ondataavailable = ev => { if (ev.data && ev.data.size) chunks.push(ev.data); };
  mr.onstop = async () => {
    stopAll(); rec = null;
    if (S.sheet !== st) return;
    st.listening = false; st.busy = true; st.sayNote = "Prepoznajem..."; redrawKeep();
    try {
      const blob = new Blob(chunks, { type: mr.mimeType || type || "audio/mp4" });
      const b64 = await new Promise((ok, bad) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(",")[1] || ""); fr.onerror = bad; fr.readAsDataURL(blob); });
      const r = await fetch("/api/transcribe", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + (S.session?.access_token || "") }, body: JSON.stringify({ audio: b64, type: blob.type }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { voiceDone(st, "", j.error || "Prepoznavanje nije uspelo. Probaj ponovo."); return; }
      if (j.text) j.text = latin(j.text); // Whisper ponekad piše ćirilicom
      if (j.text) { const inp = document.getElementById("m-say"); if (inp) inp.value = j.text; }
      voiceDone(st, j.text, "Nisam ništa čuo. Dodirni Izgovori i probaj ponovo.");
    } catch (_) { voiceDone(st, "", "Prepoznavanje nije uspelo. Proveri internet i probaj ponovo."); }
  };
  try { mr.start(); } catch (_) { stopAll(); voiceDone(st, "", VOICE_FAIL); }
}

// ugrađeno prepoznavanje u pregledaču
function speechVoice(st) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { voiceDone(st, "", VOICE_FAIL); return; }
  const go = lang => {
    const r = new SR();
    let heard = "", err = "", started = false, ended = false;
    const end = () => { if (ended) return; ended = true; clearTimeout(wd); voiceDone(st, heard, err || (started ? "Nisam ništa čuo. Dodirni Izgovori i probaj ponovo." : VOICE_FAIL)); };
    // ako se za 3 s ne javi da sluša, ugrađeno prepoznavanje ovde ne radi
    const wd = setTimeout(() => { if (!started) { try { r.abort(); } catch (_) {} end(); } }, 3000);
    rec = { finish: () => { try { r.stop(); } catch (_) {} setTimeout(end, 1500); } };
    r.lang = lang; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    r.onstart = r.onaudiostart = () => { started = true; };
    r.onresult = ev => { started = true; heard = [...ev.results].map(x => x[0].transcript).join(" ").trim(); const inp = document.getElementById("m-say"); if (inp) inp.value = heard; };
    r.onerror = ev => {
      if (ev.error === "language-not-supported" && lang !== "hr-HR") { ended = true; clearTimeout(wd); go("hr-HR"); return; }
      err = ev.error === "not-allowed" || ev.error === "service-not-allowed" ? VOICE_FAIL : ev.error === "no-speech" ? "Nisam ništa čuo. Dodirni Izgovori i probaj ponovo." : VOICE_FAIL;
    };
    r.onend = end;
    try { r.start(); } catch (_) { end(); }
  };
  go("sr-RS");
}

async function saveManual() {
  readManual();
  const st = S.sheet;
  const items = st.income ? [] : (st.items || []).map(it => ({ name: String(it.name || "").trim(), qty: it.qty || 1, total: Math.abs(parseAmt(it.total)) }))
    .filter(it => it.name && isFinite(it.total) && it.total > 0).map(it => ({ ...it, price: Math.round(it.total / it.qty * 100) / 100 }));
  let amt = Math.abs(parseAmt(st.amount));
  if ((!isFinite(amt) || amt <= 0) && items.length) amt = Math.round(items.reduce((a, it) => a + it.total, 0) * 100) / 100;
  if (!isFinite(amt) || amt <= 0) { toast("Upiši iznos"); return; }
  if (!st.desc.trim()) { toast(st.income ? "Upiši od koga je uplata" : "Upiši na šta je potrošeno"); return; }
  if ((st.income ? st.pass : st.cat === "prolazno") && !st.person) { toast("Upiši za koga je ovaj novac"); return; }
  let cat = st.cat;
  if (!st.income && cat === "nerazvrstano") cat = guessCat({ income: false, desc: st.desc.trim(), items }, S.data.rules) || cat;
  const row = st.income
    ? { kind: "manual", issued_at: (st.date || today()) + "T12:00:00", merchant: st.desc.trim(), store: "", total: amt, payment: st.payment, refund: true, items: [], cat: st.pass ? "prolazno" : "priliv", person: st.pass ? st.person : "" }
    : { kind: "manual", issued_at: (st.date || today()) + "T12:00:00", merchant: st.desc.trim(), store: "", total: amt, payment: st.payment, refund: false, items, cat, person: cat === "prolazno" ? st.person : "" };
  const saved = await guard(() => insertReceipt(row), st.income ? "Uplata sačuvana" : "Sačuvano");
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
  if (t.closest("[data-scan]")) { openScan(); return; }
  if (t.closest("[data-have]")) { openHave(); return; }
  if (t.closest("[data-income]")) { openManual(true); return; }
  if (t.closest("[data-save-in]")) { openSave(false); return; }
  if (t.closest("[data-save-out]")) { openSave(true); return; }
  if (t.closest("[data-goal]")) { openGoal(); return; }
  if (t.closest("[data-plan]")) { openPlan(); return; }
  const dy = t.closest("[data-day]"); if (dy) { S.day = dstrBack(today(), +dy.dataset.day); S.view = "dan"; render(); window.scrollTo(0, 0); return; }
  const dsp = t.closest("[data-dstep]"); if (dsp) { const n = dstrBack(S.day || today(), -dsp.dataset.dstep); S.day = n > today() ? today() : n; render(); return; }
  const av = t.closest("[data-avg]"); if (av) { setAvg(av.dataset.avg); const y = window.scrollY; render(); window.scrollTo(0, y); return; }
  const kp = t.closest("[data-kper]"); if (kp) { S.kper = kp.dataset.kper; S.kopen = null; render(); return; }
  const kg = t.closest("[data-kgrp]"); if (kg) { S.kopen = S.kopen === kg.dataset.kgrp ? null : kg.dataset.kgrp; const y = window.scrollY; render(); window.scrollTo(0, y); return; }
  const chm = t.closest("[data-chart]"); if (chm) { S.chart = chm.dataset.chart; const y = window.scrollY; render(); window.scrollTo(0, y); return; }
  const th = t.closest("[data-theme-set]"); if (th) { setTheme(th.dataset.themeSet); render(); return; }
  if (t.closest("[data-dismiss-install]")) { try { localStorage.setItem("kp-install", "1"); } catch (_) {} render(); return; }
  const dr = t.closest("[data-delrule]");
  if (dr) {
    const [kind, ...rest] = dr.dataset.delrule.split("|"); const r = { kind, match: rest.join("|") };
    if (await guard(() => deleteRule(r), "Pravilo obrisano")) { S.data.rules = S.data.rules.filter(x => !(x.kind === r.kind && x.match === r.match)); changed(); }
    return;
  }
  if (t.closest("[data-export]")) {
    const blob = new Blob([JSON.stringify(exportBackup(S.data), null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `kolko-para-kopija-${today()}.json`;
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
  if (t.closest("[data-ssave]")) { saveSave(); return; }
  if (t.closest("[data-plsave]")) { savePlan(false); return; }
  if (t.closest("[data-plauto]")) { savePlan(true); return; }
  if (t.closest("[data-gsave]")) { saveGoal(false); return; }
  if (t.closest("[data-gdel]")) { saveGoal(true); return; }
  if (st.kind === "manual") {
    if (t.closest("[data-mvoice]")) { toggleVoice(); return; }
    const mps = t.closest("[data-mpass]"); if (mps) { readManual(); st.pass = mps.dataset.mpass === "1"; redrawKeep(); return; }
    if (t.closest("[data-madd]")) { readManual(); st.items.push({ name: "", total: "", qty: 1 }); redrawKeep(); const ins = layer.querySelectorAll("[data-mname]"); if (ins.length) ins[ins.length - 1].focus(); return; }
    const md = t.closest("[data-mdel]"); if (md) { readManual(); st.items.splice(+md.dataset.mdel, 1); redrawKeep(); return; }
  }
  if (st.kind === "ocr") {
    const op = t.closest("[data-opay]"); if (op) { readOcr(); st.rc.payment = op.dataset.opay; drawSheet(); return; }
    const oc = t.closest("[data-ocat]"); if (oc) { readOcr(); st.rc.cat = oc.dataset.ocat; drawSheet(); return; }
    const od = t.closest("[data-odel]"); if (od) { readOcr(); st.rc.items.splice(+od.dataset.odel, 1); drawSheet(); return; }
    if (t.closest("[data-oadd]")) {
      readOcr(); st.rc.items.push({ name: "", price: 0, qty: 1, total: 0, orig: 0 }); drawSheet();
      const ins = layer.querySelectorAll("[data-oname]"); if (ins.length) ins[ins.length - 1].focus();
      return;
    }
    if (t.closest("[data-osave]")) { saveOcr(); return; }
  }
  if (t.closest("[data-omanual]")) { openManual(); return; }
  if (t.closest("[data-hsave]")) { saveHave(); return; }
  if (t.closest("[data-cropsave]")) { saveCrop(); return; }
  if (t.closest("[data-hedit]")) { st.edit = true; st.amt = bal() ? String(bal().now) : ""; st.date = today(); drawSheet(); return; }
  if (t.closest("[data-hcancel]")) { st.edit = false; drawSheet(); return; }
  if (t.closest("[data-income]")) { openManual(true); return; }
  const ei = t.closest("[data-edit-in]"); if (ei) { openEdit(ei.dataset.editIn); return; }
  const mm = t.closest("[data-mmode]"); if (mm) { readManual(); st.income = mm.dataset.mmode === "in"; st.payment = st.income ? "racun" : "gotovina"; drawSheet(); return; }
});
layer.addEventListener("change", ev => {
  // rečenica iz polja (napisana ili izdiktirana tastaturom) popuni ostala polja
  if (ev.target.id === "m-say" && S.sheet?.kind === "manual") { readManual(); if (S.sheet.said.trim()) { applySaid(S.sheet.said.trim()); redrawKeep(); } return; }
  if (S.sheet?.kind === "manual" && ev.target.matches("[data-mamt]")) { readManual(); redrawKeep(); return; }
  if (ev.target.id === "o-retake" && ev.target.files[0]) { startOcr(ev.target.files[0]); return; }
  // zbir artikala se osveži kad se promeni iznos
  if (S.sheet?.kind === "ocr" && (ev.target.matches("[data-oamt]") || ev.target.id === "o-total")) {
    const y = layer.querySelector(".sheet").scrollTop; readOcr(); drawSheet(); layer.querySelector(".sheet").scrollTop = y;
  }
});
document.addEventListener("keydown", ev => { if (ev.key === "Enter" && ev.target.id === "m-say") { ev.preventDefault(); ev.target.blur(); return; } if (ev.key === "Escape") { if (document.getElementById("cam")) closeCam(); else if (S.sheet) { S.sheet = null; drawSheet(); } } });

/* ---------- nova verzija ---------- */
// Telefon često samo vrati app iz pozadine sa starom verzijom. Kad se app vrati na ekran,
// proveri da li je na adresi novija verzija i, ako ništa nije otvoreno, učitaj je.
const myBuild = [...document.scripts].map(x => x.src).find(x => /\/assets\/index-[^/]+\.js/.test(x)) || "";
async function checkUpdate() {
  if (!myBuild || S.sheet || document.getElementById("cam")) return;
  try {
    const t = await (await fetch("/", { cache: "no-store" })).text();
    const m = t.match(/\/assets\/index-[^"']+\.js/);
    if (m && !myBuild.endsWith(m[0])) { try { sessionStorage.setItem("kp-skip-intro", "1"); } catch (_) {} location.reload(); }
  } catch (_) {}
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkUpdate(); });
setTimeout(checkUpdate, 4000);

/* ---------- start ---------- */
applyTheme(getTheme());
if (configured && shouldPlayIntro()) playIntro();
if (configured) {
  sb.auth.getSession().then(({ data }) => { S.session = data.session; render(); if (S.session) load(); });
  sb.auth.onAuthStateChange((evt, session) => {
    const was = !!S.session; S.session = session;
    if (session && !was) { S.ready = false; render(); load(); }
    if (!session) { S.ready = false; S.data = { tx: [], overrides: {}, rules: [], receipts: [] }; cache = null; render(); }
  });
} else render();

if ("serviceWorker" in navigator && import.meta.env.PROD) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
