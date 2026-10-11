// Sve što ide u bazu (Supabase). Svaki red pripada prijavljenom korisniku.
import { createClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = !!(URL && KEY);
export const sb = configured ? createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

async function fetchAll(table, select = "*") {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(select).range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

export async function loadAll() {
  const [tx, ov, rules, receipts] = await Promise.all([
    fetchAll("transactions", "id,date,description,amount"),
    fetchAll("overrides", "tx_id,cat,person,pass"),
    fetchAll("rules", "kind,match,cat,person"),
    fetchAll("receipts"),
  ]);
  return {
    tx: tx.map(r => ({ id: r.id, d: r.date, t: r.description, a: Number(r.amount) })),
    overrides: Object.fromEntries(ov.map(o => [o.tx_id, { cat: o.cat, person: o.person || "", ...(o.pass ? { pass: Number(o.pass) } : {}) }])),
    rules: rules.map(r => ({ ...r, person: r.person || "" })),
    receipts: receipts.map(r => ({ ...r, total: Number(r.total), items: r.items || [] })),
  };
}

const ok = ({ error }) => { if (error) throw error; };

export const saveOverride = (tx_id, o) => sb.from("overrides").upsert({ tx_id, cat: o.cat, person: o.person || "", pass: o.pass || null, updated_at: new Date().toISOString() }).then(ok);
export const deleteOverride = tx_id => sb.from("overrides").delete().eq("tx_id", tx_id).then(ok);
export const saveRule = r => sb.from("rules").upsert({ kind: r.kind, match: r.match, cat: r.cat, person: r.person || "", updated_at: new Date().toISOString() }).then(ok);
export const deleteRule = r => sb.from("rules").delete().eq("kind", r.kind).eq("match", r.match).then(ok);

export async function insertReceipt(rc) {
  const { data, error } = await sb.from("receipts").insert(rc).select().single();
  if (error) throw error;
  return { ...data, total: Number(data.total), items: data.items || [] };
}
export const updateReceipt = (id, patch) => sb.from("receipts").update(patch).eq("id", id).then(ok);
export const deleteReceipt = id => sb.from("receipts").delete().eq("id", id).then(ok);

// Uvoz izvoda: stavke u istom rasponu datuma se menjaju novim.
export async function replaceBankRange(from, to, rows) {
  ok(await sb.from("transactions").delete().gte("date", from).lte("date", to));
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map(r => ({ id: r.id, date: r.d, description: r.t, amount: r.a, source: r.source || "bank" }));
    ok(await sb.from("transactions").upsert(chunk));
  }
}

export async function importBackup(b) {
  const tx = (b.transactions || []).map(r => ({ id: r.id, date: r.date, description: r.description, amount: r.amount, source: r.source || "bank" }));
  for (let i = 0; i < tx.length; i += 500) ok(await sb.from("transactions").upsert(tx.slice(i, i + 500)));
  if (b.overrides?.length) ok(await sb.from("overrides").upsert(b.overrides.map(o => ({ tx_id: o.tx_id, cat: o.cat, person: o.person || "", pass: o.pass || null }))));
  if (b.rules?.length) ok(await sb.from("rules").upsert(b.rules.map(r => ({ kind: r.kind || "merchant", match: r.match, cat: r.cat, person: r.person || "" }))));
  if (b.receipts?.length) {
    const rows = b.receipts.map(({ user_id, created_at, _matched, ...r }) => r);
    ok(await sb.from("receipts").upsert(rows));
  }
}

export function exportBackup(state) {
  return {
    app: "koliko-para", version: 1, exportedAt: new Date().toISOString(),
    transactions: state.tx.map(r => ({ id: r.id, date: r.d, description: r.t, amount: r.a })),
    overrides: Object.entries(state.overrides).map(([tx_id, o]) => ({ tx_id, ...o })),
    rules: state.rules,
    receipts: state.receipts.map(({ user_id, _matched, ...r }) => r),
  };
}
