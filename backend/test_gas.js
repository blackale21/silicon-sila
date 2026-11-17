// Prueba el backend de Apps Script en Node, con Google simulado en memoria (planilla, caché, propiedades).
//   node backend/test_gas.js
const fs = require('fs'), vm = require('vm'), crypto = require('crypto'), path = require('path');

function hoja(nombre) {
  return {
    nombre, filas: [], oculta: false,
    getLastRow() { return this.filas.length; },
    getLastColumn() { return this.filas.reduce((m, r) => Math.max(m, r.length), 0); },
    getMaxRows() { return 1000; },
    appendRow(r) { this.filas.push(r.slice()); },
    setName(n) { this.nombre = n; return this; },
    hideSheet() { this.oculta = true; },
    setFrozenRows() {}, deleteRow(r) { this.filas.splice(r - 1, 1); },
    getRange(r, c, nr = 1, nc = 1) {
      const h = this;
      const rng = {
        getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = h.filas[r - 1 + i] || []; out.push(Array.from({ length: nc }, (_, j) => (row[c - 1 + j] === undefined ? '' : row[c - 1 + j]))); } return out; },
        setValues(v) { v.forEach((row, i) => { const ri = r - 1 + i; while (h.filas.length <= ri) h.filas.push([]); row.forEach((x, j) => { h.filas[ri][c - 1 + j] = typeof x === 'string' && x[0] === "'" ? x.slice(1) : x; }); }); return rng; },
        setValue(x) { return rng.setValues([[x]]); },
        setFontWeight() { return rng; }, setBackground() { return rng; }, setFontColor() { return rng; }, setDataValidation() { return rng; },
      };
      return rng;
    },
  };
}
const libro = { hojas: [hoja('Hoja 1')], getSheetByName(n) { return this.hojas.find((h) => h.nombre === n) || null; }, getSheets() { return this.hojas; }, insertSheet(n) { const h = hoja(n); this.hojas.push(h); return h; } };
const props = {}, cache = {};
const ctx = {
  console,
  SpreadsheetApp: { openById: () => libro, getActiveSpreadsheet: () => libro, newDataValidation: () => ({ requireValueInList() { return { build() {} }; } }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperties: (o) => Object.assign(props, o), setProperty: (k, v) => { props[k] = v; } }) },
  CacheService: { getScriptCache: () => ({ get: (k) => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = String(v); }, remove: (k) => { delete cache[k]; } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    DigestAlgorithm: { SHA_256: 'sha256' },
    computeDigest: (alg, s) => [...crypto.createHash('sha256').update(String(s)).digest()].map((b) => (b > 127 ? b - 256 : b)),
    base64Encode: (bytes) => Buffer.from(bytes.map((b) => (b + 256) % 256)).toString('base64'),
    base64EncodeWebSafe: (bytes) => Buffer.from(bytes.map((b) => (b + 256) % 256)).toString('base64url'),
    formatDate: (d) => d.toISOString().slice(0, 10).replace(/-/g, ''),
  },
  ContentService: { createTextOutput: (t) => ({ t, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
  MailApp: { sendEmail() { throw new Error('no debería mandar correo'); }, getRemainingDailyQuota: () => 100 },
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 500, getContentText: () => '' }) },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'ayuda-casos.gs'), 'utf8'), ctx);
const api = (o) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(o) } }).t);

let fallas = 0;
const ok = (cond, txt) => { console.log((cond ? '✅ ' : '❌ ') + txt); if (!cond) fallas++; };

ok(api({ action: 'central_estado' }).tieneClave === false, 'sin clave al inicio');
ok(api({ action: 'central_crear_clave', clave: 'corta' }).error === 'clave_corta', 'rechaza clave corta');
ok(api({ action: 'central_crear_clave', clave: 'direccion-secreta' }).ok, 'crea la clave de Dirección');
ok(api({ action: 'central_crear_clave', clave: 'otra-clave-123' }).error === 'ya_existe', 'no deja crear otra clave encima');
ok(api({ action: 'login', usuario: 'direccion', clave: 'mal' }).error === 'credenciales', 'login de Dirección con clave mala');
const D = api({ action: 'login', usuario: 'Direccion', clave: 'direccion-secreta' });
ok(D.ok && D.yo.rol === 'direccion', 'login de Dirección');
const T = D.token;

// casos de dos barrios
const caso = (id, barrio) => api({ action: 'derivar', evento: 'Derivado', caso: { caso_id: id, estado: 'pendiente', barrio, residente: 'Vecino ' + id, lote: '1', celular: '1155550000', correo: 'v@x.com', consulta: 'no anda', derivado_central: 'sí', monday_ticket: 'X' } });
ok(caso('RES-AAAAAA', 'Los Álamos').ok, 'caso de Los Álamos (derivado, sin correo)');
ok(caso('RES-BBBBBB', 'El Ceibo').ok, 'caso de El Ceibo');
ok(api({ action: 'kv_set', token: T, key: 'sila_central_cfg', version: 0, valor: { barrios: [{ id: 'losalamos', nombre: 'Los Alamos', alias: ['Los Álamos'] }, { id: 'elceibo', nombre: 'El Ceibo' }] } }).ok, 'Dirección guarda la config de barrios');

ok(api({ action: 'usuario_guardar', token: T, usuario: 'direccion', nombre: 'x', rol: 'operador', clave: '12345678' }).error === 'usuario_invalido', 'no deja crear otro "direccion"');
ok(api({ action: 'usuario_guardar', token: T, usuario: 'ana', nombre: 'Ana', rol: 'operador', barrios: ['losalamos'], clave: 'corta' }).error === 'clave_corta', 'clave inicial corta rechazada');
ok(api({ action: 'usuario_guardar', token: T, usuario: 'ana', nombre: 'Ana Pérez', rol: 'operador', barrios: ['losalamos'], clave: 'ana-clave-1' }).ok, 'Dirección crea a la operadora Ana (Los Álamos)');
ok(api({ action: 'usuarios_listar', token: T }).usuarios.length === 1, 'Dirección lista usuarios');
const hojaUsr = libro.getSheetByName('Usuarios');
ok(hojaUsr && hojaUsr.oculta && !JSON.stringify(hojaUsr.filas).includes('ana-clave-1'), 'la clave no queda guardada en texto (hoja oculta, sólo hash)');

const A = api({ action: 'login', usuario: 'ana', clave: 'ana-clave-1' });
ok(A.ok && A.yo.rol === 'operador', 'Ana entra con su usuario');
const ta = A.token;
const vis = api({ action: 'casos_listar', token: ta }).casos.map((c) => c.caso_id);
ok(vis.length === 1 && vis[0] === 'RES-AAAAAA', 'Ana ve SÓLO los casos de Los Álamos');
ok(api({ action: 'caso_actualizar', token: ta, caso_id: 'RES-BBBBBB', campos: { estado: 'resuelto' } }).error === 'permiso', 'Ana no puede tocar un caso de otro barrio');
ok(api({ action: 'caso_actualizar', token: ta, caso_id: 'RES-AAAAAA', campos: { estado: 'resuelto', monday_ticket: 'TK-1' } }).ok, 'Ana cierra un caso de su barrio');
ok(api({ action: 'usuarios_listar', token: ta }).error === 'permiso', 'Ana no ve la lista de usuarios');
ok(api({ action: 'usuario_guardar', token: ta, usuario: 'pepe', nombre: 'P', rol: 'operador', clave: '12345678' }).error === 'permiso', 'Ana no puede crear usuarios');
ok(api({ action: 'kv_set', token: ta, key: 'sila_central_cfg', version: 1, valor: {} }).error === 'permiso', 'Ana no puede cambiar la configuración');
ok(api({ action: 'kv_get', token: ta, keys: ['sila_central_cfg'] }).valores.sila_central_cfg.valor.barrios.length === 2, 'Ana puede leer la configuración');
ok(api({ action: 'kv_set', token: ta, key: 'sila_central_b_losalamos_tickets', version: 0, valor: [{ id: 'TK-1' }] }).ok, 'Ana guarda tickets de su barrio');
ok(api({ action: 'kv_set', token: ta, key: 'sila_central_b_elceibo_tickets', version: 0, valor: [] }).error === 'permiso', 'Ana no puede escribir tickets de otro barrio');
const g = api({ action: 'kv_get', token: ta, keys: ['sila_central_b_elceibo_tickets', 'sila_central_b_losalamos_tickets'] });
ok(g.denegadas.includes('sila_central_b_elceibo_tickets') && g.valores.sila_central_b_losalamos_tickets, 'kv_get filtra lo que no le corresponde');
ok(api({ action: 'clave_cambiar', token: ta, actual: 'mal', nueva: 'nueva-clave-ana' }).error === 'credenciales', 'cambiar clave exige la actual');
ok(api({ action: 'clave_cambiar', token: ta, actual: 'ana-clave-1', nueva: 'nueva-clave-ana' }).ok, 'Ana cambia su clave');
ok(api({ action: 'login', usuario: 'ana', clave: 'nueva-clave-ana' }).ok, 'entra con la clave nueva');

ok(api({ action: 'usuario_baja', token: T, usuario: 'ana' }).ok, 'Dirección da de baja a Ana');
ok(api({ action: 'casos_listar', token: ta }).error === 'sesion', 'la sesión de Ana se corta al instante');
ok(api({ action: 'login', usuario: 'ana', clave: 'nueva-clave-ana' }).error === 'inactivo', 'Ana dada de baja no puede entrar');

for (let i = 0; i < 10; i++) api({ action: 'login', usuario: 'pepe', clave: 'x' + i });
ok(api({ action: 'login', usuario: 'pepe', clave: 'x' }).error === 'bloqueado', 'bloqueo por intentos fallidos');
ok(api({ action: 'casos_listar', token: 'f'.repeat(64) }).error === 'sesion', 'token inventado no sirve');
ok(api({ action: 'casos_listar', clave: 'direccion-secreta' }).ok, 'compatibilidad: la central vieja con la clave de Dirección');
ok(api({ action: 'casos_listar', token: T }).casos.length === 2, 'Dirección ve todo');

console.log(fallas ? `\n${fallas} FALLAS` : '\nTodo OK');
process.exit(fallas ? 1 : 0);
