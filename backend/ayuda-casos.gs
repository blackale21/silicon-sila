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

/* ───────────── Usuarios de la central: Dirección + operadores/técnicos ───────────── */
// Dirección: usuario "direccion", clave en Propiedades (CENTRAL_HASH/SALT). El resto: hoja oculta "Usuarios",
// clave con hash iterado + sal. Sesión: token aleatorio en caché (6 h, se renueva con cada uso).
const USR_SHEET = 'Usuarios';
const USR_COLS = ['usuario', 'nombre', 'rol', 'barrios', 'hash', 'salt', 'activo', 'creado', 'permisos'];
const ROLES = ['operador'];
// Permisos que Dirección tilda por operador. Los que tocan datos los aplica este servidor.
const PERMISOS = ['gestionar_tickets', 'cerrar_tickets', 'ver_contacto', 'ver_experiencia', 'ver_reputacion', 'todos_los_barrios', 'configurar', 'gestionar_usuarios'];
const PERMISOS_BASE = ['gestionar_tickets', 'cerrar_tickets', 'ver_contacto', 'ver_experiencia', 'ver_reputacion'];
function tiene(yo, perm) { return yo.rol === 'direccion' || (yo.permisos || []).indexOf(perm) >= 0; }
function hashClave(clave, salt) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + clave));
}
function hashFuerte(clave, salt) {
  let h = hashClave(clave, salt);
  for (let i = 0; i < 400; i++) h = hashClave(h, salt);
  return h;
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
function usrSheet() {
  const ss = libro();
  let sh = ss.getSheetByName(USR_SHEET);
  if (!sh) { sh = ss.insertSheet(USR_SHEET); sh.appendRow(USR_COLS); sh.hideSheet(); }
  const head = sh.getRange(1, 1, 1, USR_COLS.length).getValues()[0];
  USR_COLS.forEach((c, i) => { if (head[i] !== c) sh.getRange(1, i + 1).setValue(c); });
  return sh;
}
function usrTodos() {
  const sh = usrSheet();
  const n = sh.getLastRow() - 1;
  return n < 1 ? [] : sh.getRange(2, 1, n, USR_COLS.length).getValues().map((r, i) => {
    const o = { fila: i + 2 };
    USR_COLS.forEach((k, j) => { o[k] = r[j]; });
    try { o.barrios = JSON.parse(String(o.barrios || '[]').replace(/^'/, '')); } catch (_) { o.barrios = []; }
    try { o.permisos = o.permisos === '' || o.permisos == null ? PERMISOS_BASE.slice() : JSON.parse(String(o.permisos).replace(/^'/, '')); } catch (_) { o.permisos = PERMISOS_BASE.slice(); }
    o.activo = o.activo === true || o.activo === 'TRUE' || o.activo === 'sí';
    return o;
  });
}
const DIRECCION = { usuario: 'direccion', nombre: 'Dirección', rol: 'direccion', barrios: [], permisos: PERMISOS.slice() };
function publico(u) { return { usuario: u.usuario, nombre: u.nombre, rol: u.rol, barrios: u.barrios || [], permisos: u.permisos || [] }; }

function login(usuario, clave) {
  usuario = String(usuario || '').trim().toLowerCase();
  clave = String(clave || '');
  const cache = CacheService.getScriptCache();
  const kf = 'lf_' + usuario.replace(/[^a-z0-9._-]/g, '').slice(0, 30);
  if (Number(cache.get(kf) || 0) >= 10 || Number(cache.get('lf_global') || 0) >= 80) return { ok: false, error: 'bloqueado' };
  let yo = null;
  if (usuario === 'direccion') {
    const props = PropertiesService.getScriptProperties();
    const h = props.getProperty('CENTRAL_HASH'), sa = props.getProperty('CENTRAL_SALT');
    if (h && sa && hashClave(clave, sa) === h) yo = DIRECCION;
  } else {
    const u = usrTodos().find((x) => x.usuario === usuario);
    if (u && hashFuerte(clave, u.salt) === u.hash) {
      if (!u.activo) return { ok: false, error: 'inactivo' };
      yo = publico(u);
    }
  }
  if (!yo) {
    cache.put(kf, String(Number(cache.get(kf) || 0) + 1), 600);
    cache.put('lf_global', String(Number(cache.get('lf_global') || 0) + 1), 600);
    return { ok: false, error: 'credenciales' };
  }
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  cache.put('tok_' + token, yo.usuario, 21600);
  return { ok: true, token: token, yo: yo };
}
// Devuelve el usuario vigente (re-leído de la planilla: una baja o un cambio de barrios rige al instante)
function sesion(token) {
  token = String(token || '');
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const cache = CacheService.getScriptCache();
  const usuario = cache.get('tok_' + token);
  if (!usuario) return null;
  let yo = null;
  if (usuario === 'direccion') yo = DIRECCION;
  else {
    const u = usrTodos().find((x) => x.usuario === usuario);
    if (!u || !u.activo) { cache.remove('tok_' + token); return null; }
    yo = publico(u);
  }
  cache.put('tok_' + token, usuario, 21600);
  return yo;
}
function usuarioGuardar(p) {
  const usuario = String(p.usuario || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(usuario) || usuario === 'direccion') return { ok: false, error: 'usuario_invalido' };
  if (ROLES.indexOf(p.rol) === -1) return { ok: false, error: 'rol' };
  const nombre = clip(String(p.nombre || '').trim(), 80);
  if (!nombre) return { ok: false, error: 'nombre' };
  const pedidos = Array.isArray(p.barrios) ? p.barrios : [];
  const existentes = Object.values(mapaBarrios());
  if (pedidos.some((b) => typeof b !== 'string' || existentes.indexOf(b) === -1)) return { ok: false, error: 'barrio_invalido' };
  const barrios = pedidos.filter((b, i) => pedidos.indexOf(b) === i).slice(0, 100);
  const pp = Array.isArray(p.permisos) ? p.permisos : null;
  if (pp && pp.some((x) => PERMISOS.indexOf(x) === -1)) return { ok: false, error: 'permiso_invalido' };
  const sh = usrSheet();
  const u = usrTodos().find((x) => x.usuario === usuario);
  const clave = p.clave == null ? '' : String(p.clave);
  if (!u && clave.length < 8) return { ok: false, error: 'clave_corta' };
  if (u && clave && clave.length < 8) return { ok: false, error: 'clave_corta' };
  const salt = clave ? Utilities.getUuid() : u.salt;
  const hash = clave ? hashFuerte(clave, salt) : u.hash;
  const permisos = pp && pp.length ? pp.filter((x, i) => pp.indexOf(x) === i) : (u ? u.permisos : PERMISOS_BASE.slice());
  const fila = [usuario, nombre, p.rol, JSON.stringify(barrios), hash, salt, u ? (p.activo === false ? false : true) : true, u ? u.creado : new Date(), JSON.stringify(permisos)];
  if (u) sh.getRange(u.fila, 1, 1, USR_COLS.length).setValues([fila]);
  else sh.appendRow(fila);
  return { ok: true };
}
function usuarioBaja(usuario) {
  const u = usrTodos().find((x) => x.usuario === String(usuario || '').toLowerCase());
  if (!u) return { ok: false, error: 'no_existe' };
  usrSheet().getRange(u.fila, USR_COLS.indexOf('activo') + 1).setValue(false);
  return { ok: true };
}
function claveCambiar(yo, actual, nueva) {
  nueva = String(nueva || '');
  if (nueva.length < 8) return { ok: false, error: 'clave_corta' };
  if (!login(yo.usuario, actual).ok) return { ok: false, error: 'credenciales' };
  const salt = Utilities.getUuid();
  if (yo.usuario === 'direccion') {
    PropertiesService.getScriptProperties().setProperties({ CENTRAL_SALT: salt, CENTRAL_HASH: hashClave(nueva, salt) });
  } else {
    const u = usrTodos().find((x) => x.usuario === yo.usuario);
    usrSheet().getRange(u.fila, USR_COLS.indexOf('hash') + 1, 1, 2).setValues([[hashFuerte(nueva, salt), salt]]);
  }
  return { ok: true };
}

/* ── permisos por barrio ── */
function normTxt(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
function mapaBarrios() {
  const v = kvGet(['sila_central_cfg']).valores.sila_central_cfg;
  const m = {};
  ((v && v.valor && v.valor.barrios) || []).forEach((b) => {
    [b.nombre].concat(b.alias || []).forEach((n) => { if (n) m[normTxt(n)] = String(b.id); });
  });
  return m;
}
function veBarrio(yo, id) { return tiene(yo, 'todos_los_barrios') || (yo.barrios || []).indexOf(id) >= 0; }
function puedeKey(yo, key, escribir) {
  if (yo.rol === 'direccion') return true;
  if (key === 'sila_central_cfg') return !escribir || tiene(yo, 'configurar');
  const m = /^sila_central_b_([a-z0-9]+)_[a-z0-9_]+$/.exec(key);
  if (!m || !veBarrio(yo, m[1])) return false;
  return !escribir || tiene(yo, 'gestionar_tickets') || tiene(yo, 'cerrar_tickets');
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

function casosListar(yo, desde) {
  const sh = sheet();
  const n = sh.getLastRow() - 1;
  let casos = n < 1 ? [] : sh.getRange(2, 1, n, COLS.length).getValues().map(filaACaso);
  if (yo.rol !== 'direccion' && !tiene(yo, 'todos_los_barrios')) {
    const m = mapaBarrios();
    casos = casos.filter((c) => (yo.barrios || []).indexOf(m[normTxt(c.barrio)]) >= 0);
  }
  if (!tiene(yo, 'ver_contacto')) casos.forEach((c) => { c.celular = 'oculto'; c.correo = 'oculto'; });
  const d = desde ? new Date(desde) : null;
  return { ok: true, ahora: new Date().toISOString(), casos: d ? casos.filter((c) => new Date(c.actualizado) > d) : casos };
}

function casoActualizar(yo, p) {
  const sh = sheet();
  const row = findRow(sh, String(p.caso_id || ''));
  if (!row) return { ok: false, error: 'no_existe' };
  const campos = p.campos || {};
  const prev = sh.getRange(row, 1, 1, COLS.length).getValues()[0];
  if (yo.rol !== 'direccion' && !veBarrio(yo, mapaBarrios()[normTxt(prev[COLS.indexOf('barrio')])])) return { ok: false, error: 'permiso' };
  if (campos.estado === 'resuelto' && !tiene(yo, 'cerrar_tickets')) return { ok: false, error: 'permiso' };
  if (Object.keys(campos).some((k) => k !== 'estado' && k !== 'resultado') && !tiene(yo, 'gestionar_tickets')) return { ok: false, error: 'permiso' };
  if (campos.estado && campos.estado !== 'resuelto' && !tiene(yo, 'gestionar_tickets')) return { ok: false, error: 'permiso' };
  const now = new Date();
  ['monday_ticket', 'estado', 'resultado'].forEach((k) => {
    if (!(k in campos)) return;
    if (k === 'estado' && ESTADOS.indexOf(campos[k]) === -1) return;
    prev[COLS.indexOf(k)] = clip(campos[k], 500);
  });
  prev[COLS.indexOf('actualizado')] = now;
  let ev = [];
  try { ev = JSON.parse(String(prev[COLS.indexOf('eventos')] || '[]').replace(/^'/, '')); } catch (_) { ev = []; }
  ev.push({ t: now.toISOString(), txt: (yo.nombre || 'Central') + ': ' + Object.keys(campos).filter((k) => ['monday_ticket', 'estado', 'resultado'].indexOf(k) >= 0).map((k) => k + ' = ' + campos[k]).join(', ') });
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
    if (p.action === 'login') return out(login(p.usuario, p.clave));
    if (p.action === 'logout') { CacheService.getScriptCache().remove('tok_' + String(p.token || '')); return out({ ok: true }); }
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      if (p.action === 'upsert' || p.action === 'derivar') return out(guardarCaso(p));
      if (p.action === 'central_crear_clave') return out(centralCrearClave(p.clave));
      // compatibilidad: la versión anterior de la central manda la clave de Dirección en vez de token
      const yo = sesion(p.token) || (p.clave && login('direccion', p.clave).ok ? DIRECCION : null);
      if (!yo) return out({ ok: false, error: 'sesion' });
      const dir = tiene(yo, 'gestionar_usuarios');
      switch (p.action) {
        case 'yo': return out({ ok: true, yo: yo });
        case 'clave_cambiar': return out(claveCambiar(yo, p.actual, p.nueva));
        case 'casos_listar': return out(casosListar(yo, p.desde));
        case 'caso_actualizar': return out(casoActualizar(yo, p));
        case 'kv_get': {
          const keys = (p.keys || []).map(String);
          const r = kvGet(keys.filter((k) => puedeKey(yo, k, false)));
          r.denegadas = keys.filter((k) => !puedeKey(yo, k, false));
          return out(r);
        }
        case 'kv_set': return out(puedeKey(yo, String(p.key || ''), true) ? kvSet(p) : { ok: false, error: 'permiso' });
        case 'usuarios_listar': return out(dir ? { ok: true, usuarios: usrTodos().map((u) => ({ usuario: u.usuario, nombre: u.nombre, rol: u.rol, barrios: u.barrios, permisos: u.permisos, activo: u.activo, creado: u.creado instanceof Date ? u.creado.toISOString() : u.creado })) } : { ok: false, error: 'permiso' });
        case 'usuario_guardar': return out(dir ? usuarioGuardar(p) : { ok: false, error: 'permiso' });
        case 'usuario_baja': return out(dir ? usuarioBaja(p.usuario) : { ok: false, error: 'permiso' });
        default: return out({ ok: false, error: 'accion' });
      }
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
