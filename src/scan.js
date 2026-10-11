// Kamera i čitanje QR koda. Vraća tekst iz QR-a preko onResult.
import jsQR from "jsqr";

export function decodeImageData(img) {
  const r = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
  return r ? r.data : null;
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

export function startCamera(video, onResult, onError) {
  let stream = null, raf = 0, stopped = false, last = 0;
  const canvas = document.createElement("canvas");
  const g = canvas.getContext("2d", { willReadFrequently: true });

  const tick = t => {
    if (stopped) return;
    raf = requestAnimationFrame(tick);
    if (t - last < 180 || video.readyState < 2) return;
    last = t;
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return;
    // čita centralni kvadrat, brže je i ignoriše ostatak kadra
    const side = Math.min(w, h), sx = (w - side) / 2, sy = (h - side) / 2, out = Math.min(720, side);
    canvas.width = out; canvas.height = out;
    g.drawImage(video, sx, sy, side, side, 0, 0, out, out);
    const text = decodeImageData(g.getImageData(0, 0, out, out));
    if (text) { stop(); onResult(text); }
  };

  function stop() {
    stopped = true; cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach(tr => tr.stop());
    video.srcObject = null;
  }

  navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false })
    .then(s => {
      if (stopped) { s.getTracks().forEach(tr => tr.stop()); return; }
      stream = s; video.srcObject = s; video.setAttribute("playsinline", ""); video.muted = true;
      return video.play().then(() => { raf = requestAnimationFrame(tick); });
    })
    .catch(err => { if (!stopped) onError(err); });
  if (!navigator.mediaDevices?.getUserMedia) setTimeout(() => onError(new Error("no-camera")), 0);
  return stop;
}
