// Kratak uvod pri otvaranju appa: na bež pozadini kutije okreće se 3D kartica, pojavi se logo,
// pa se pozadina skupi u kutiju na početnoj strani (kartica ide sa njom), a logo ode na svoje mesto gore.
// Ukupno oko dve sekunde. Preskače se kad je uključeno smanjeno kretanje i posle automatskog osvežavanja.
const TILE = "#dfddcd";
const EASE = "cubic-bezier(.72,0,.18,1)";

export function shouldPlayIntro() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  try { if (sessionStorage.getItem("kp-skip-intro")) { sessionStorage.removeItem("kp-skip-intro"); return false; } } catch (_) {}
  return true;
}

export function playIntro() {
  const root = document.createElement("div");
  root.id = "intro"; root.setAttribute("aria-hidden", "true");
  root.innerHTML = `<div class="i-bg"><div class="i-card"></div></div><div class="logo i-logo">[kolko para?]</div>`;
  document.body.appendChild(root);
  document.body.classList.add("intro-on");
  const meta = document.createElement("meta"); meta.name = "theme-color"; meta.content = TILE; meta.id = "intro-tc";
  document.head.appendChild(meta);

  const bg = root.querySelector(".i-bg"), card = root.querySelector(".i-card"), logo = root.querySelector(".i-logo");
  const vw = innerWidth, vh = innerHeight;
  const size = Math.min(vw * 0.78, 340);
  Object.assign(card.style, { left: (vw - size) / 2 + "px", top: vh * 0.42 - size / 2 + "px", width: size + "px", height: size + "px" });
  logo.style.top = vh * 0.42 + size / 2 + 22 + "px";

  let unmount = null;
  import("./wallet.js").then(({ mountCard }) => { if (root.isConnected) unmount = mountCard(card, { period: 1.7 }); }).catch(() => {});
  logo.animate([{ opacity: 0, transform: "translate(-50%, 10px)" }, { opacity: 1, transform: "translate(-50%, 0)" }],
    { duration: 420, delay: 380, easing: "ease-out", fill: "both" });

  const t0 = performance.now();
  const finish = () => {
    document.body.classList.remove("intro-on");
    root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: "ease-out", fill: "forwards" }).finished.then(() => {
      if (unmount) unmount(); root.remove(); meta.remove();
    });
  };

  // čeka da početna strana ima kutiju i logo (podaci se možda još učitavaju), najduže još 2,5 s
  const wait = () => new Promise(res => {
    const t1 = performance.now();
    const look = () => {
      const tile = document.querySelector("#app #card, #app #wallet"), lg = document.querySelector("#app .logo");
      const ok = tile && lg && tile.getBoundingClientRect().width > 0;
      if (ok || performance.now() - t1 > 2500) res(ok ? { tile, lg } : null); else setTimeout(look, 80);
    };
    look();
  });

  setTimeout(async () => {
    const tg = await wait();
    if (!tg) { finish(); return; }
    const r = tg.tile.getBoundingClientRect(), cr = card.getBoundingClientRect();
    const lr = tg.lg.getBoundingClientRect(), ir = logo.getBoundingClientRect();
    const dur = 680, opt = { duration: dur, easing: EASE, fill: "forwards" };
    bg.animate([{ clipPath: "inset(0px 0px 0px 0px)" }, { clipPath: `inset(${r.top}px ${vw - r.right}px ${vh - r.bottom}px ${r.left}px)` }], opt);
    const s = r.width / cr.width;
    card.style.transformOrigin = "0 0";
    card.animate([{ transform: "translate(0,0) scale(1)" }, { transform: `translate(${r.left - cr.left}px, ${r.top - cr.top}px) scale(${s})` }],
      opt);
    const ls = lr.height / ir.height || 1;
    const dx = lr.left + lr.width / 2 - (ir.left + ir.width / 2), dy = lr.top + lr.height / 2 - (ir.top + ir.height / 2);
    logo.animate([
      { transform: "translate(-50%, 0) scale(1)", color: getComputedStyle(logo).color },
      { transform: `translate(calc(-50% + ${dx}px), ${dy}px) scale(${ls})`, color: getComputedStyle(tg.lg).color },
    ], opt);
    setTimeout(finish, dur);
  }, Math.max(0, 1250 - (performance.now() - t0)));
}
