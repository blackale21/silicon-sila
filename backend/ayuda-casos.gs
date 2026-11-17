/**
 * SILA Ayuda: backend en Google (Apps Script).
 * - Chat de residentes: registra cada caso en la planilla y, al derivar, avisa por correo si hay CENTRAL_MAIL.
 * - Jev (TypeSafe): puente seguro, con pregunta y opciones FIJAS. Clave sólo en Propiedades del script (TYPESAFE_KEY).
 * - App de la central (gestion/): lee casos y guarda su estado compartido. Todo protegido con la clave de la central.
 * Publicado como aplicación web ("Ejecutar como: yo", "Cualquier usuario"). En el repo SHEET_ID va vacío;
 * en el script publicado tiene el id de la planilla "SILA Ayuda · Casos de residentes".
 */
const CENTRAL_MAIL = '';          // a quién avisar por correo cada derivación (vacío = sólo queda en la planilla y en la app)
const SHEET = 'Casos';
const ESTADO_SHEET = 'Estado';
const SHEET_ID = '';
function libro() { return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet(); }
const COLS = ['caso_id', 'creado', 'actualizado', 'estado', 'barrio', 'residente', 'lote', 'celular', 'correo',
  'consulta', 'aclaraciones', 'modulo', 'fuentes_citadas', 'pasos_intentados', 'resultado', 'derivado_central',
  'correo_enviado', 'monday_ticket', 'origen', 'eventos'];
const ESTADOS = ['abierto', 'pendiente', 'resuelto'];
const MONDAY_TOKEN = '';          // PENDIENTE (fase 2)
const MONDAY_BOARD_ID = '';

function setup() {
  const sh = sheet();
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, COLS.length).setFontWeight('bold').setBackground('#006bf2').setFontColor('#ffffff');
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(ESTADOS, true).build();
  sh.getRange(2, 4, sh.getMaxRows() - 1, 1).setDataValidation(rule);
  estadoSheet();
  MailApp.getRemainingDailyQuota();
  UrlFetchApp.fetch(CRITERIOS_URL, { muteHttpExceptions: true });
}

/* ───────────── Jev ───────────── */
const JEV_MODEL = 'jev-latest';
const CRITERIOS_URL = 'https://blackale21.github.io/silicon-sila/kb/jev-criterios.json';
const JEV_MAX_POR_MINUTO = 600;
const JEV_MAX_POR_DIA = 50000;
const JEV_MAX_POR_SESION_10MIN = 120;

function criterios() {
  const c = CacheService.getScriptCache();
  const hit = c.get('jev_criterios');
  if (hit) return JSON.parse(hit);
  const r = UrlFetchApp.fetch(CRITERIOS_URL, { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('criterios ' + r.getResponseCode());
  const j = JSON.parse(r.getContentText());
  if (!j.ninguna || Object.keys(j).length < 10) throw new Error('criterios invalidos');
  c.put('jev_criterios', JSON.stringify(j), 21600);
  return j;
}

function jevResponder(p) {
  const key = PropertiesService.getScriptProperties().getProperty('TYPESAFE_KEY');
  if (!key) return { ok: false, error: 'jev_no_configurado' };
  const q = String(p.q || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (q.length < 3 || q.length > 400) return { ok: false, error: 'consulta_invalida' };
  if (/(https?:\/\/|www\.|<\/?[a-z]|\{[\s\S]*\}|;\s*(drop|select|insert)\b)/i.test(q)) return { ok: false, error: 'consulta_invalida' };
  if (!/[a-záéíóúñü]{3,}/i.test(q)) return { ok: false, error: 'consulta_invalida' };
  const cache = CacheService.getScriptCache();
  const ck = 'jev_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, q.toLowerCase())).slice(0, 40);
  const hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  const now = new Date();
  const sid = String(p.sid || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 32) || 'anon';
  const topes = [
    ['jm_' + Math.floor(now.getTime() / 60000), JEV_MAX_POR_MINUTO, 120],
    ['jd_' + Utilities.formatDate(now, 'GMT-3', 'yyyyMMdd'), JEV_MAX_POR_DIA, 21600],
    ['js_' + sid + '_' + Math.floor(now.getTime() / 600000), JEV_MAX_POR_SESION_10MIN, 700],
  ];
  for (const [k, max] of topes) if (Number(cache.get(k) || 0) >= max) return { ok: false, error: 'tope' };
  topes.forEach(([k, , ttl]) => cache.put(k, String(Number(cache.get(k) || 0) + 1), ttl));
  const body = {
    model: JEV_MODEL,
    state: { consulta_del_residente: q },
    questions: { ficha: {
      type: 'choice',
      instructions: 'Sos el asistente de ayuda de la app Silicon Access para residentes de barrios cerrados. ' +
        'Elegí el tema de ayuda que responde la consulta del residente (puede tener errores de tipeo). ' +
        'Si ninguno la responde de verdad, elegí "ninguna".',
      criteria: criterios(),
    } },
  };
  let res;
  try {
    res = UrlFetchApp.fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + key },
      payload: JSON.stringify(body), muteHttpExceptions: true,
    });
  } catch (err) {
    return { ok: false, error: 'jev_sin_conexion' };
  }
  if (res.getResponseCode() !== 200) return { ok: false, error: 'jev_' + res.getResponseCode() };
  const a = JSON.parse(res.getContentText()).answers.ficha;
  const top = Object.entries(a.probabilities || {}).sort((x, y) => y[1] - x[1]).slice(0, 3)
    .map(([id, pr]) => [id, Math.round(pr * 1000) / 1000]);
  const outp = { ok: true, choice: a.choice, confidence: Math.round((a.confidence || (top[0] || [0, 0])[1]) * 1000) / 1000, top };
  cache.put(ck, JSON.stringify(outp), 21600);
  return outp;
}

/* ───────────── Clave de la central ───────────── */
function hashClave(clave, salt) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + clave));
}
function centralOk(clave) {
  const cache = CacheService.getScriptCache();
  if (Number(cache.get('central_fallos') || 0) >= 20) return 'bloqueado';
  const props = PropertiesService.getScriptProperties();
  const h = props.getProperty('CENTRAL_HASH'), s = props.getProperty('CENTRAL_SALT');
  if (!h || !s) return 'sin_clave';
  if (hashClave(String(clave || ''), s) === h) return 'ok';
  cache.put('central_fallos', String(Number(cache.get('central_fallos') || 0) + 1), 600);
  return 'clave';
}
function centralCrearClave(clave) {
  clave = String(clave || '');
  if (clave.length < 8) return { ok: false, error: 'clave_corta' };
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('CENTRAL_HASH')) return { ok: false, error: 'ya_existe' };
  const salt = Utilities.getUuid();
  props.setProperties({ CENTRAL_SALT: salt, CENTRAL_HASH: hashClave(clave, salt) });
  return { ok: true };
}

/* ───────────── Planilla de casos ───────────── */
function sheet() {
  const ss = libro();
  const sh = ss.getSheetByName(SHEET) || ss.getSheets()[0].setName(SHEET);
  if (sh.getLastRow() === 0) sh.appendRow(COLS);
  const head = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  COLS.forEach((c, i) => { if (head[i] !== c) sh.getRange(1, i + 1).setValue(c); });
  return sh;
}
function findRow(sh, id) {
  const n = sh.getLastRow() - 1;
  if (n < 1) return 0;
  const i = sh.getRange(2, 1, n, 1).getValues().flat().indexOf(id);
  return i === -1 ? 0 : i + 2;
}
function clip(v, max) {
  const s = String(v).slice(0, max || 4000);
  return s.replace(/^[=+\-@]/, "'$&"); // evita inyección de fórmulas
}
function filaACaso(row) {
  const o = {};
  COLS.forEach((k, i) => {
    let v = row[i];
    if (v instanceof Date) v = v.toISOString();
    if (typeof v === 'string' && v.charAt(0) === "'") v = v.slice(1);
    o[k] = v;
  });
  try { o.eventos = o.eventos ? JSON.parse(o.eventos) : []; } catch (_) { o.eventos = []; }
  return o;
}

function guardarCaso(p) {
  const c = p.caso || {};
  if (!/^RES-[A-Z0-9]{6}$/.test(String(c.caso_id || ''))) return { ok: false, error: 'caso_id' };
  if (ESTADOS.indexOf(c.estado) === -1) return { ok: false, error: 'estado' };
  if (!throttle(c.caso_id)) return { ok: false, error: 'demasiados envios' };
  const sh = sheet();
  const row = findRow(sh, c.caso_id);
  const now = new Date();
  const prev = row ? sh.getRange(row, 1, 1, COLS.length).getValues()[0] : null;
  const rec = {};
  COLS.forEach((k, i) => { rec[k] = prev ? prev[i] : ''; });
  COLS.forEach((k) => { if (k !== 'eventos' && k in c && c[k] != null && k !== 'derivado_central' && k !== 'correo_enviado' && k !== 'monday_ticket') rec[k] = clip(c[k]); });
  rec.creado = prev ? prev[1] : now;
  rec.actualizado = now;
  let ev = [];
  try { ev = rec.eventos ? JSON.parse(String(rec.eventos).replace(/^'/, '')) : []; } catch (_) { ev = []; }
  if (p.evento) ev.push({ t: now.toISOString(), txt: String(p.evento).slice(0, 500) });
  let mail = false;
  if (p.action === 'derivar') {
    ['barrio', 'residente', 'lote', 'celular', 'correo'].forEach((k) => { if (!String(rec[k] || '').trim()) throw new Error('falta ' + k); });
    rec.derivado_central = 'sí';
    if (CENTRAL_MAIL) {
      sendMail(rec);
      rec.correo_enviado = now;
      mail = true;
      ev.push({ t: now.toISOString(), txt: 'Correo enviado a la central' });
    }
    const t = mondayTicket(rec);
    if (t) rec.monday_ticket = t;
  }
  rec.eventos = JSON.stringify(ev.slice(-80)).slice(0, 45000);
  const values = [COLS.map((k) => rec[k])];
  if (row) sh.getRange(row, 1, 1, COLS.length).setValues(values);
  else sh.appendRow(values[0]);
  return { ok: true, mail: mail, central: rec.derivado_central === 'sí' };
}

function casosListar(desde) {
  const sh = sheet();
  const n = sh.getLastRow() - 1;
  const casos = n < 1 ? [] : sh.getRange(2, 1, n, COLS.length).getValues().map(filaACaso);
  const d = desde ? new Date(desde) : null;
  return { ok: true, ahora: new Date().toISOString(), casos: d ? casos.filter((c) => new Date(c.actualizado) > d) : casos };
}

function casoActualizar(p) {
  const sh = sheet();
  const row = findRow(sh, String(p.caso_id || ''));
  if (!row) return { ok: false, error: 'no_existe' };
  const campos = p.campos || {};
  const prev = sh.getRange(row, 1, 1, COLS.length).getValues()[0];
  const now = new Date();
  ['monday_ticket', 'estado', 'resultado'].forEach((k) => {
    if (!(k in campos)) return;
    if (k === 'estado' && ESTADOS.indexOf(campos[k]) === -1) return;
    prev[COLS.indexOf(k)] = clip(campos[k], 500);
  });
  prev[COLS.indexOf('actualizado')] = now;
  let ev = [];
  try { ev = JSON.parse(String(prev[COLS.indexOf('eventos')] || '[]').replace(/^'/, '')); } catch (_) { ev = []; }
  ev.push({ t: now.toISOString(), txt: 'Central: ' + Object.keys(campos).filter((k) => ['monday_ticket', 'estado', 'resultado'].indexOf(k) >= 0).map((k) => k + ' = ' + campos[k]).join(', ') });
  prev[COLS.indexOf('eventos')] = JSON.stringify(ev.slice(-80)).slice(0, 45000);
  sh.getRange(row, 1, 1, COLS.length).setValues([prev]);
  return { ok: true };
}

/* ───────────── Estado compartido de la app de la central (clave → JSON, troceado) ───────────── */
function estadoSheet() {
  const ss = libro();
  let sh = ss.getSheetByName(ESTADO_SHEET);
  if (!sh) { sh = ss.insertSheet(ESTADO_SHEET); sh.appendRow(['key', 'parte', 'version', 'actualizado', 'datos']); sh.hideSheet(); }
  return sh;
}
function kvLeerTodo(sh) {
  const n = sh.getLastRow() - 1;
  const rows = n < 1 ? [] : sh.getRange(2, 1, n, 5).getValues();
  const m = {};
  rows.forEach((r, i) => {
    const k = r[0];
    if (!k) return;
    (m[k] = m[k] || { partes: [], version: r[2], actualizado: r[3], filas: [] }).partes[r[1]] = String(r[4]);
    m[k].filas.push(i + 2);
  });
  return m;
}
function kvGet(keys) {
  const m = kvLeerTodo(estadoSheet());
  const valores = {};
  (keys || []).forEach((k) => {
    const e = m[k];
    if (!e) { valores[k] = null; return; }
    let valor = null;
    try { valor = JSON.parse(e.partes.join('')); } catch (_) { valor = null; }
    valores[k] = { valor: valor, version: Number(e.version) || 0, actualizado: e.actualizado instanceof Date ? e.actualizado.toISOString() : e.actualizado };
  });
  return { ok: true, valores: valores };
}
function kvSet(p) {
  const key = String(p.key || '');
  if (!/^sila_central_[a-z0-9_]{1,40}$/.test(key)) return { ok: false, error: 'key' };
  const sh = estadoSheet();
  const m = kvLeerTodo(sh);
  const e = m[key];
  const actual = e ? Number(e.version) || 0 : 0;
  if (Number(p.version || 0) !== actual) {
    let valor = null;
    try { valor = e ? JSON.parse(e.partes.join('')) : null; } catch (_) { valor = null; }
    return { ok: false, error: 'conflicto', actual: { valor: valor, version: actual } };
  }
  const txt = JSON.stringify(p.valor === undefined ? null : p.valor);
  const partes = [];
  for (let i = 0; i < txt.length; i += 45000) partes.push(txt.slice(i, i + 45000));
  if (!partes.length) partes.push('null');
  if (e) e.filas.sort((a, b) => b - a).forEach((r) => sh.deleteRow(r));
  const now = new Date();
  const version = actual + 1;
  sh.getRange(sh.getLastRow() + 1, 1, partes.length, 5).setValues(partes.map((d, i) => [key, i, version, now, "'" + d]));
  return { ok: true, version: version };
}

/* ───────────── Entrada única ───────────── */
function doPost(e) {
  let p = {};
  try { p = JSON.parse(e.postData.contents || '{}'); } catch (_) { return out({ ok: false, error: 'json' }); }
  try {
    if (p.action === 'jev') return out(jevResponder(p));
    if (p.action === 'central_estado') return out({ ok: true, tieneClave: !!PropertiesService.getScriptProperties().getProperty('CENTRAL_HASH') });
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      if (p.action === 'upsert' || p.action === 'derivar') return out(guardarCaso(p));
      if (p.action === 'central_crear_clave') return out(centralCrearClave(p.clave));
      const auth = centralOk(p.clave);
      if (auth !== 'ok') return out({ ok: false, error: auth });
      if (p.action === 'casos_listar') return out(casosListar(p.desde));
      if (p.action === 'caso_actualizar') return out(casoActualizar(p));
      if (p.action === 'kv_get') return out(kvGet(p.keys));
      if (p.action === 'kv_set') return out(kvSet(p));
      return out({ ok: false, error: 'accion' });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err).slice(0, 200) });
  }
}

function sendMail(r) {
  const body =
    'Caso ' + r.caso_id + ' · ' + String(r.estado).toUpperCase() + ' · derivado desde SILA Ayuda\n\n' +
    'CONTACTO DEL RESIDENTE\n' +
    'Barrio: ' + r.barrio + '\nResidente: ' + r.residente + '\nLote: ' + r.lote + '\nCelular: ' + r.celular + '\nCorreo: ' + r.correo + '\n\n' +
    'CONSULTA\n' + r.consulta + '\n' + (r.aclaraciones ? '\nAclaraciones: ' + r.aclaraciones + '\n' : '') +
    (r.modulo ? 'Módulo: ' + r.modulo + '\n' : '') +
    '\nLO QUE YA SE INTENTÓ\n' + (r.pasos_intentados || '— No había una solución documentada.') + '\n' +
    (r.fuentes_citadas ? '\nRespaldo en manuales: ' + r.fuentes_citadas + '\n' : '') +
    '\nResultado informado por el residente: ' + (r.resultado || '—') + '\n';
  MailApp.sendEmail({ to: CENTRAL_MAIL, subject: 'SILA Ayuda · ' + r.caso_id + ' · ' + r.barrio + ' · Lote ' + r.lote, body: body,
    replyTo: /@/.test(String(r.correo)) ? String(r.correo) : undefined, name: 'SILA Ayuda' });
}

function mondayTicket(r) {
  if (!MONDAY_TOKEN || !MONDAY_BOARD_ID) return null;
  const q = 'mutation ($b: ID!, $n: String!) { create_item (board_id: $b, item_name: $n) { id } }';
  const res = UrlFetchApp.fetch('https://api.monday.com/v2', {
    method: 'post', contentType: 'application/json', headers: { Authorization: MONDAY_TOKEN },
    payload: JSON.stringify({ query: q, variables: { b: MONDAY_BOARD_ID, n: r.caso_id + ' · ' + r.barrio + ' · Lote ' + r.lote } }),
    muteHttpExceptions: true,
  });
  const j = JSON.parse(res.getContentText() || '{}');
  return j.data && j.data.create_item ? j.data.create_item.id : null;
}

function throttle(id) {
  const c = CacheService.getScriptCache();
  const k = 't_' + id;
  const n = Number(c.get(k) || 0);
  if (n > 60) return false;
  c.put(k, String(n + 1), 3600);
  return true;
}
function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
