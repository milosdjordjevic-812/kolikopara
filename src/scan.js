// Kamera i čitanje QR koda. Vraća tekst iz QR-a preko onResult.
import jsQR from "jsqr";

// ZXing (zxing-cpp u WebAssembly) čita gust i mutan QR sa fiskalnog računa mnogo bolje od jsQR.
// Učitava se tek kad se otvori kamera; jsQR ostaje kao rezerva ako se ZXing ne učita.
let zxP = null;
function zx() {
  if (!zxP) zxP = import("zxing-wasm/reader").then(m => {
    m.prepareZXingModule({ overrides: { locateFile: (path, prefix) => (path.endsWith(".wasm") ? "/zxing/zxing_reader.wasm" : prefix + path) } });
    return m;
  }).catch(e => { zxP = null; throw e; });
  return zxP;
}
export const warmQr = () => zx().catch(() => {});
async function decodeZx(img) {
  const m = await zx();
  const r = await m.readBarcodes(img, { formats: ["QRCode"], tryHarder: true, maxNumberOfSymbols: 1 });
  return r.length && r[0].text ? r[0].text : null;
}

export function decodeImageData(img) {
  const r = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
  if (!r) return null;
  if (r.data) return r.data;
  try { return new TextDecoder("utf-8").decode(new Uint8Array(r.binaryData)); } catch (_) { return null; }
}

// QR sa fotografije (kamera telefona): prvo ZXing, pa jsQR
export async function decodePhotoQr(file) {
  try { const m = await zx(); const r = await m.readBarcodes(file, { formats: ["QRCode"], tryHarder: true, maxNumberOfSymbols: 1 }); if (r.length && r[0].text) return r[0].text; } catch (_) {}
  try { return await decodeFile(file); } catch (_) { return null; }
}

export async function decodeFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    // probaj u više veličina, mali QR na velikoj slici se lakše čita kad je slika smanjena
    for (const max of [1600, 1000, 2400]) {
      const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(im, 0, 0, c.width, c.height);
      const t = decodeImageData(g.getImageData(0, 0, c.width, c.height));
      if (t) return t;
    }
    return null;
  } finally { URL.revokeObjectURL(url); }
}

// accept: da li je pročitan tekst ono što tražimo; ako nije, kamera nastavlja da čita (onReject javlja šta je pročitano)
export function startCamera(video, onResult, onError, accept = () => true, onReject = () => {}) {
  let stream = null, raf = 0, stopped = false, last = 0, busy = false, n = 0, useZx = true;
  const canvas = document.createElement("canvas");
  const g = canvas.getContext("2d", { willReadFrequently: true });
  zx().catch(() => { useZx = false; });

  const tick = t => {
    if (stopped) return;
    raf = requestAnimationFrame(tick);
    if (busy || t - last < 120 || video.readyState < 2) return;
    last = t;
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return;
    let img;
    if (useZx) {
      // ceo kadar, najviše 1600 px po dužoj strani
      const k = Math.min(1, 1600 / Math.max(w, h));
      canvas.width = Math.round(w * k); canvas.height = Math.round(h * k);
      g.drawImage(video, 0, 0, canvas.width, canvas.height);
    } else {
      // jsQR: naizmenično centralni kvadrat i veći isečak
      const big = n++ % 2 === 1;
      const side = Math.min(w, h) * (big ? 0.95 : 0.8), out = Math.round(Math.min(big ? 1200 : 720, side));
      canvas.width = out; canvas.height = out;
      g.drawImage(video, (w - side) / 2, (h - side) / 2, side, side, 0, 0, out, out);
    }
    img = g.getImageData(0, 0, canvas.width, canvas.height);
    busy = true;
    (useZx ? decodeZx(img).catch(() => { useZx = false; return decodeImageData(img); }) : Promise.resolve(decodeImageData(img)))
      .then(text => {
        busy = false;
        if (stopped || !text) return;
        if (accept(text)) { stop(); onResult(text); } else onReject(text);
      });
  };

  function stop() {
    stopped = true; cancelAnimationFrame(raf); clearTimeout(watch);
    if (stream) stream.getTracks().forEach(tr => tr.stop());
    video.srcObject = null;
  }

  // Kamera: prvo velika rezolucija (gust QR), a ako ne krene ili ostane crna, ponovo sa običnim podešavanjima.
  // Na iPhoneu kamera ume da ostane crna bez ikakve greške (npr. posle povratka appa iz pozadine).
  const WANT = [
    { video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false },
    { video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
    { video: { facingMode: { ideal: "environment" } }, audio: false },
  ];
  let attempt = 0, watch = 0, restarts = 0;
  const live = () => video.readyState >= 2 && video.videoWidth > 0;
  function open() {
    if (stopped) return;
    if (attempt >= WANT.length) { onError(new Error("no-frames")); return; }
    const want = WANT[attempt++];
    clearTimeout(watch);
    watch = setTimeout(() => { if (!stopped && !live()) { drop(); open(); } }, 3000);
    navigator.mediaDevices.getUserMedia(want)
      .then(s => {
        if (stopped) { s.getTracks().forEach(tr => tr.stop()); return; }
        stream = s; video.setAttribute("playsinline", ""); video.muted = true; video.srcObject = s;
        // ako sistem ugasi kameru dok je otvorena, upali je ponovo
        s.getVideoTracks().forEach(tr => tr.addEventListener("ended", () => { if (!stopped && stream === s && restarts++ < 3) { drop(); attempt = Math.max(0, attempt - 1); open(); } }));
        const play = () => video.play().catch(() => {});
        play(); video.onloadedmetadata = play;
        if (!raf) raf = requestAnimationFrame(tick);
      })
      .catch(err => {
        if (stopped) return;
        clearTimeout(watch);
        // zabranjena kamera: nema smisla pokušavati dalje
        if (err && (err.name === "NotAllowedError" || err.name === "SecurityError")) { onError(err); return; }
        open();
      });
  }
  function drop() { if (stream) stream.getTracks().forEach(tr => tr.stop()); stream = null; video.srcObject = null; }
  if (navigator.mediaDevices?.getUserMedia) open(); else setTimeout(() => onError(new Error("no-camera")), 0);
  return stop;
}

// Slika iz kamere za čitanje teksta: isečak koji je u okviru na ekranu (plus malo oko njega), u punoj rezoluciji.
export function grabFrame(video, frameEl) {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh || video.readyState < 2) return null;
  let sx = 0, sy = 0, sw = vw, sh = vh;
  if (frameEl) {
    const vr = video.getBoundingClientRect(), fr = frameEl.getBoundingClientRect();
    const k = Math.max(vr.width / vw, vr.height / vh);          // object-fit: cover
    const ox = (vr.width - vw * k) / 2, oy = (vr.height - vh * k) / 2;
    const m = 0.12 * Math.max(fr.width, fr.height);
    sx = Math.max(0, (fr.left - vr.left - m - ox) / k); sy = Math.max(0, (fr.top - vr.top - m - oy) / k);
    sw = Math.min(vw - sx, (fr.width + 2 * m) / k); sh = Math.min(vh - sy, (fr.height + 2 * m) / k);
  }
  const c = document.createElement("canvas"); c.width = Math.round(sw); c.height = Math.round(sh);
  c.getContext("2d").drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return new Promise(res => c.toBlob(b => { c.width = c.height = 0; res(b); }, "image/jpeg", 0.92));
}
