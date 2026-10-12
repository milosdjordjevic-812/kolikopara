import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { extractJournal, parseJournal } from "../src/shared/fiscal.js";

// Pravi račun sa strane Poreske uprave (lokalno, nije u repou). Ako fajla nema, test se preskače.
const f = new URL("./fixtures/suf-pravi.html", import.meta.url);
test("pravi račun sa SUF strane", { skip: !fs.existsSync(f) }, () => {
  const r = parseJournal(extractJournal(fs.readFileSync(f, "utf8")));
  assert.ok(r.merchant && r.store);
  assert.ok(r.items.length > 5);
  const sum = Math.round(r.items.reduce((s, i) => s + i.total, 0) * 100) / 100;
  assert.equal(sum, r.total);
});
