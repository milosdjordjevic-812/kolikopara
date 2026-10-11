// Priprema fotografije računa za čitanje teksta.
// Bledi termalni papir i neravno svetlo: siva slika se deli sa svojom zamućenom verzijom
// (procena pozadine), pa ostaje samo štampa, a zatim se kontrast razvuče.
// Radi nad RGBA nizom, isto u telefonu (canvas) i u testovima.
export function prepReceipt({ data, width: w, height: h }) {
  const n = w * h, g = new Float32Array(n);
  for (let i = 0; i < n; i++) g[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];

  // pozadina: prosek u kvadratu oko tačke, preko integralne slike
  const r = Math.max(8, Math.round(Math.min(w, h) / 28));
  const I = new Uint32Array((w + 1) * (h + 1));   // zbir do 255 x 5 miliona tačaka staje u 32 bita
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += Math.round(g[y * w + x]); I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; }
  }
  const out = new Uint8ClampedArray(n * 4);
  const v = new Float32Array(n), B = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const s = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
      const bg = s / ((y1 - y0) * (x1 - x0));
      B[y * w + x] = bg;
      // štampa je tamnija od pozadine; svetlije od pozadine se seče na belo
      v[y * w + x] = Math.min(1, g[y * w + x] / Math.max(bg, 1));
    }
  }
  // sve što nije papir (sto, ruka, senka oko računa) postaje belo, da ne zbuni čitanje
  const hb = new Uint32Array(256);
  for (let i = 0; i < n; i += 7) hb[Math.min(255, Math.round(B[i]))]++;
  let paper = 255, cnt = 0; const tot = Math.ceil(n / 7);
  while (paper > 0 && (cnt += hb[paper]) < tot * 0.1) paper--;
  for (let i = 0; i < n; i++) if (B[i] < paper * 0.62 || (g[i] < paper * 0.42 && B[i] < paper * 0.78)) v[i] = 1;
  // razvlačenje kontrasta: 1. percentil tamnog postaje crno
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[Math.round(v[i] * 255)]++;
  let lo = 0, acc = 0; while (lo < 254 && (acc += hist[lo]) < n * 0.01) lo++;
  const hi = 252, span = Math.max(8, hi - lo);
  for (let i = 0; i < n; i++) {
    let p = (v[i] * 255 - lo) / span; p = p < 0 ? 0 : p > 1 ? 1 : p;
    const c = Math.round(255 * Math.pow(p, 1.3));   // tamni potezi još tamniji
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = c; out[i * 4 + 3] = 255;
  }
  return { data: out, width: w, height: h };
}

// koliko da se smanji/uveća slika: tekst računa treba da bude dovoljno krupan, a slika ne prevelika
export function targetSize(w, h) {
  const maxPx = 5e6, maxSide = 3600;   // više od ovoga troši previše memorije u Safariju
  let s = Math.min(1, maxSide / Math.max(w, h), Math.sqrt(maxPx / (w * h)));
  if (Math.min(w, h) * s < 900) s = Math.min(2, 900 / Math.min(w, h));
  return { w: Math.round(w * s), h: Math.round(h * s) };
}
