// Čitanje teksta sa fotografije računa, na samom telefonu (Tesseract, srpska ćirilica i latinica).
// Ne ide na sajt Poreske uprave. Prvi put preuzima jezičke podatke (oko 3 MB), posle radi iz memorije.
import { prepReceipt, targetSize } from "./shared/ocr-prep.js";
import { parseOcrText, scoreParse } from "./shared/ocr-parse.js";

let workerP = null, onStatus = () => {};
const STATUS = {
  "loading tesseract core": "Pripremam čitač",
  "initializing tesseract": "Pripremam čitač",
  "loading language traineddata": "Preuzimam srpski jezik, samo prvi put",
  "initializing api": "Pripremam čitač",
  "recognizing text": "Čitam tekst",
};

function getWorker() {
  if (!workerP) workerP = (async () => {
    const { createWorker } = await import("tesseract.js");
    const w = await createWorker(["srp", "srp_latn"], 1, {
      ...(globalThis.KP_TESS || {}),   // samo za testove: lokalne putanje umesto CDN-a
      logger: m => { const t = STATUS[m.status]; if (t) onStatus(t, m.progress); },
    });
    await w.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
    return w;
  })().catch(e => { workerP = null; throw e; });
  return workerP;
}

async function loadBitmap(file) {
  try { return await createImageBitmap(file); } catch (_) {}
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.decoding = "async"; img.src = url;
    await img.decode(); return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 2000); }
}

// vraća pročitan račun: { merchant, store, issuedAt, total, totalFound, payment, items, text, ... }
export async function readReceiptPhoto(file, status = () => {}) {
  onStatus = status;
  status("Pripremam sliku", 0);
  const bmp = await loadBitmap(file);
  const W = bmp.width || bmp.naturalWidth, H = bmp.height || bmp.naturalHeight;
  const { w, h } = targetSize(W, H);
  const raw = document.createElement("canvas"); raw.width = w; raw.height = h;
  const ctx = raw.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  const prep = document.createElement("canvas"); prep.width = w; prep.height = h;
  const p = prepReceipt(ctx.getImageData(0, 0, w, h));
  prep.getContext("2d").putImageData(new ImageData(p.data, w, h), 0, 0);

  const worker = await getWorker();
  const tries = [];
  for (const [canvas, label] of [[prep, "Čitam tekst"], [raw, "Čitam još jednom, drugačije"]]) {
    onStatus = (t, pr) => status(t === "Čitam tekst" ? label : t, pr);
    const { data } = await worker.recognize(canvas);
    const r = parseOcrText(data.text);
    tries.push({ r: { ...r, text: data.text }, sc: scoreParse(r) });
    if (tries[0].sc >= 20) break;          // zbir artikala se slaže sa ukupnim iznosom, dovoljno
  }
  raw.width = raw.height = prep.width = prep.height = 0;   // oslobodi memoriju odmah
  return tries.sort((a, b) => b.sc - a.sc)[0].r;
}
