// Corre el buscador del bot (js/ayuda/kb.js) en Node sobre la base real.
// Uso: node kb/tools/local_decide.js < consultas.json   → JSON [{q, type, ids, ms}]
const fs = require('fs'), vm = require('vm'), path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const initSqlJs = require(path.join(REPO, 'js', 'vendor', 'sql-wasm.js'));
const win = { SILA_CONFIG: { ayuda: {} }, initSqlJs: () => initSqlJs({ locateFile: (f) => path.join(REPO, 'js', 'vendor', f) }) };
const ctx = { window: win, document: { currentScript: null }, URL, console, performance,
  fetch: async (u) => ({ ok: true, arrayBuffer: async () => fs.readFileSync(path.join(REPO, String(u).replace(/^\.\//, ''))) }) };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(REPO, 'js', 'ayuda', 'kb.js'), 'utf8'), ctx);
const KB = win.SILA_KB;
const qs = JSON.parse(fs.readFileSync(0, 'utf8'));
KB.load().then(() => {
  const out = qs.map((q) => {
    const t = performance.now();
    const d = KB.decide(q);
    const ms = performance.now() - t;
    const ids = d.card ? [d.card.id] : d.cards ? d.cards.map((c) => c.id) : d.module ? KB.cardsOf(d.module).map((c) => c.id) : [];
    return { q, type: d.type, ids, ms };
  });
  process.stdout.write(JSON.stringify(out));
});
