// Vercel funkcija: prima kratak snimak glasa iz appa i vraća tekst (OpenAI prepoznavanje govora).
// Radi samo za prijavljenog korisnika, da niko drugi ne bi trošio ključ.
// GET kaže da li je prepoznavanje uključeno (da li postoji OPENAI_API_KEY).
export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

const HINT = "Pijaca, paradajz 230 dinara, krastavac 120, jaja 300. Akka Studio uplata 100.000 dinara. Uradi sam 2.400. Frizer 1.500 gotovinom.";

async function stt(key, model, buf, type, ext) {
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type }), "glas." + ext);
  fd.append("model", model);
  fd.append("language", "sr");
  fd.append("prompt", HINT);
  return fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { authorization: "Bearer " + key }, body: fd });
}

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  const key = process.env.OPENAI_API_KEY;
  if (req.method === "GET") return res.status(200).json({ ok: !!key });
  if (req.method !== "POST") return res.status(405).json({ error: "Samo POST." });
  if (!key) return res.status(501).json({ error: "Prepoznavanje govora nije uključeno." });

  const tok = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const U = process.env.VITE_SUPABASE_URL, A = process.env.VITE_SUPABASE_ANON_KEY;
  if (!tok || !U || !A) return res.status(401).json({ error: "Nisi prijavljen." });
  try {
    const u = await fetch(U.replace(/\/$/, "") + "/auth/v1/user", { headers: { apikey: A, authorization: "Bearer " + tok } });
    if (!u.ok) return res.status(401).json({ error: "Nisi prijavljen." });
  } catch { return res.status(502).json({ error: "Provera prijave nije uspela." }); }

  const { audio, type = "audio/mp4" } = req.body || {};
  const buf = Buffer.from(String(audio || ""), "base64");
  if (buf.length < 800) return res.status(400).json({ error: "Snimak je prazan." });
  if (buf.length > 3_500_000) return res.status(413).json({ error: "Snimak je predug." });
  const ext = /webm/.test(type) ? "webm" : /ogg/.test(type) ? "ogg" : /wav/.test(type) ? "wav" : /mpeg|mp3/.test(type) ? "mp3" : "m4a";
  const mime = ext === "m4a" ? "audio/mp4" : type.split(";")[0];

  try {
    let r = await stt(key, process.env.OPENAI_STT_MODEL || "gpt-4o-mini-transcribe", buf, mime, ext);
    if (!r.ok && r.status !== 401 && r.status !== 429) r = await stt(key, "whisper-1", buf, mime, ext);
    if (!r.ok) {
      const t = await r.text();
      const why = r.status === 401 ? "OpenAI ključ nije ispravan." : r.status === 429 ? "OpenAI nalog nema kredita ili je dostignut limit." : `OpenAI greška ${r.status}.`;
      return res.status(502).json({ error: why, detail: t.slice(0, 300) });
    }
    const j = await r.json();
    return res.status(200).json({ text: String(j.text || "").trim() });
  } catch (e) {
    return res.status(502).json({ error: "Prepoznavanje nije uspelo. Probaj ponovo." });
  }
}
