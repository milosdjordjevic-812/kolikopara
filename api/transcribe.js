// Vercel funkcija: prima kratak snimak glasa iz appa i vraća tekst (Whisper).
// Besplatno preko Groq-a (GROQ_API_KEY), ili preko OpenAI-ja (OPENAI_API_KEY) ako je on podešen.
// Radi samo za prijavljenog korisnika, da niko drugi ne bi trošio ključ.
// GET kaže da li je prepoznavanje uključeno.
export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

const HINT = "Pijaca, paradajz 230 dinara, krastavac 120, jaja 300. Akka Studio uplata 100.000 dinara. Uradi sam 2.400. Frizer 1.500 gotovinom.";

const GROQ = "https://api.groq.com/openai/v1/audio/transcriptions", OPENAI = "https://api.openai.com/v1/audio/transcriptions";

async function stt(url, key, model, buf, type, ext) {
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type }), "glas." + ext);
  fd.append("model", model);
  fd.append("language", "sr");
  fd.append("prompt", HINT);
  return fetch(url, { method: "POST", headers: { authorization: "Bearer " + key }, body: fd });
}

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  const groq = process.env.GROQ_API_KEY, key = groq || process.env.OPENAI_API_KEY;
  const url = groq ? GROQ : OPENAI, who = groq ? "Groq" : "OpenAI";
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
    let r = await stt(url, key, groq ? "whisper-large-v3" : (process.env.OPENAI_STT_MODEL || "gpt-4o-mini-transcribe"), buf, mime, ext);
    if (!r.ok && r.status !== 401 && r.status !== 429) r = await stt(url, key, groq ? "whisper-large-v3-turbo" : "whisper-1", buf, mime, ext);
    if (!r.ok) {
      const t = await r.text();
      const why = r.status === 401 ? `${who} ključ nije ispravan.` : r.status === 429 ? `${who}: dostignut dnevni limit, probaj kasnije.` : `${who} greška ${r.status}.`;
      return res.status(502).json({ error: why, detail: t.slice(0, 300) });
    }
    const j = await r.json();
    return res.status(200).json({ text: String(j.text || "").trim() });
  } catch (e) {
    return res.status(502).json({ error: "Prepoznavanje nije uspelo. Probaj ponovo." });
  }
}
