// Corre el backend REAL (ayuda-casos.gs) en tu PC con Google simulado en memoria, para probar la central sin tocar Google.
//   node backend/servidor_local.js [puerto]      → POST http://127.0.0.1:8355/ (CORS abierto)
const fs = require('fs'), vm = require('vm'), crypto = require('crypto'), path = require('path'), http = require('http');
function hoja(nombre) {
  return { nombre, filas: [], oculta: false,
    getLastRow() { return this.filas.length; }, getLastColumn() { return this.filas.reduce((m, r) => Math.max(m, r.length), 0); }, getMaxRows() { return 1000; },
    appendRow(r) { this.filas.push(r.slice()); }, setName(n) { this.nombre = n; return this; }, hideSheet() { this.oculta = true; }, setFrozenRows() {}, deleteRow(r) { this.filas.splice(r - 1, 1); },
    getRange(r, c, nr = 1, nc = 1) { const h = this; const g = {
      getValues() { const o = []; for (let i = 0; i < nr; i++) { const row = h.filas[r - 1 + i] || []; o.push(Array.from({ length: nc }, (_, j) => (row[c - 1 + j] === undefined ? '' : row[c - 1 + j]))); } return o; },
      setValues(v) { v.forEach((row, i) => { const ri = r - 1 + i; while (h.filas.length <= ri) h.filas.push([]); row.forEach((x, j) => { h.filas[ri][c - 1 + j] = typeof x === 'string' && x[0] === "'" ? x.slice(1) : x; }); }); return g; },
      setValue(x) { return g.setValues([[x]]); }, setFontWeight() { return g; }, setBackground() { return g; }, setFontColor() { return g; }, setDataValidation() { return g; } }; return g; } };
}
const libro = { hojas: [hoja('Hoja 1')], getSheetByName(n) { return this.hojas.find((h) => h.nombre === n) || null; }, getSheets() { return this.hojas; }, insertSheet(n) { const h = hoja(n); this.hojas.push(h); return h; } };
const props = {}, cache = {};
const ctx = { console,
  SpreadsheetApp: { openById: () => libro, getActiveSpreadsheet: () => libro, newDataValidation: () => ({ requireValueInList() { return { build() {} }; } }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperties: (o) => Object.assign(props, o), setProperty: (k, v) => { props[k] = v; } }) },
  CacheService: { getScriptCache: () => ({ get: (k) => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = String(v); }, remove: (k) => { delete cache[k]; } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: { getUuid: () => crypto.randomUUID(), DigestAlgorithm: { SHA_256: 'sha256' },
    computeDigest: (a, s) => [...crypto.createHash('sha256').update(String(s)).digest()].map((b) => (b > 127 ? b - 256 : b)),
    base64Encode: (b) => Buffer.from(b.map((x) => (x + 256) % 256)).toString('base64'), base64EncodeWebSafe: (b) => Buffer.from(b.map((x) => (x + 256) % 256)).toString('base64url'),
    formatDate: (d) => d.toISOString().slice(0, 10).replace(/-/g, '') },
  ContentService: { createTextOutput: (t) => ({ t, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
  MailApp: { sendEmail() {}, getRemainingDailyQuota: () => 100 },
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 503, getContentText: () => '' }) } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'ayuda-casos.gs'), 'utf8'), ctx);
const port = Number(process.argv[2] || 8355);
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method !== 'POST') { res.writeHead(204); return res.end(); }
  let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { res.setHeader('Content-Type', 'application/json'); res.end(ctx.doPost({ postData: { contents: b } }).t); });
}).listen(port, '127.0.0.1', () => console.log('backend local en http://127.0.0.1:' + port + '/'));
