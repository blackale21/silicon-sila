/**
 * SILA Ayuda — backend gratis en Google: casos → Sheet + correo a la central, y puente seguro a Jev.
 *
 * INSTALACIÓN (una vez):
 *  1) Abrir la planilla "SILA Ayuda · Casos de residentes" → Extensiones → Apps Script.
 *     Pegar ESTE archivo en Código.gs y crear un 2º archivo con backend/ayuda-jev-criterios.gs.
 *  2) Configuración del proyecto (engranaje) → Propiedades del script → Agregar:
 *       TYPESAFE_KEY = <tu clave de Jev>      (la clave queda sólo acá, nunca en el código ni en la web)
 *  3) Completar CENTRAL_MAIL (a quién le llega el correo de cada derivación).
 *  4) Ejecutar la función setup() una vez (pide permisos: aceptar).
 *  5) Implementar → Nueva implementación → Aplicación web
 *       Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario  → copiar la URL /exec
 *  6) Pegar esa URL en js/config.js → ayuda.backendUrl.
 *     Jev se usa apenas hay URL. Los casos siguen SIMULADOS mientras ayuda.demo = true.
 *
 * El bot sólo le dice al residente "registrado" / "enviado a la central" si este script
 * responde { ok: true } (y mail: true para el correo). Si algo falla, el bot lo dice.
 */
const CENTRAL_MAIL = '';          // ej: 'central@tuempresa.com' (varios: separados por coma)
const SHEET = 'Casos';
const COLS = ['caso_id', 'creado', 'actualizado', 'estado', 'barrio', 'residente', 'lote', 'celular', 'correo',
  'consulta', 'aclaraciones', 'modulo', 'fuentes_citadas', 'pasos_intentados', 'resultado', 'derivado_central',
  'correo_enviado', 'monday_ticket', 'origen'];
const ESTADOS = ['abierto', 'pendiente', 'resuelto'];

// PENDIENTE (fase 2): ticket en Monday para los casos pendientes. Vacío = desactivado.
const MONDAY_TOKEN = '';
const MONDAY_BOARD_ID = '';

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET) || ss.getSheets()[0].setName(SHEET);
  if (sh.getLastRow() === 0) sh.appendRow(COLS);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, COLS.length).setFontWeight('bold').setBackground('#006bf2').setFontColor('#ffffff');
  sh.setColumnWidths(1, COLS.length, 140);
  [10, 11, 13, 14].forEach((c) => sh.setColumnWidth(c, 320));
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(ESTADOS, true).build();
  sh.getRange(2, 4, sh.getMaxRows() - 1, 1).setDataValidation(rule);
  const rules = [
    ['pendiente', '#fff4e0'], ['resuelto', '#e6f6ec'],
  ].map(([v, bg]) => SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(v).setBackground(bg)
    .setRanges([sh.getRange(2, 4, sh.getMaxRows() - 1, 1)]).build());
  sh.setConditionalFormatRules(rules);
  // prueba de permisos de correo (no envía nada)
  MailApp.getRemainingDailyQuota();
}

/* ───────────────────────── Jev (TypeSafe AI) ─────────────────────────
 * El chat de la web NO puede llamar a Jev directo (su API sólo acepta su propia consola), así que
 * este script hace de puente. Seguridad:
 *  - La clave vive SÓLO en "Propiedades del script" (TYPESAFE_KEY): no está en el código, ni en git, ni en la web.
 *  - Pregunta y opciones FIJAS (JEV_CRITERIOS, generado desde las fichas): del navegador sólo entra el texto
 *    del vecino. Nadie puede usar el puente para otra cosa que elegir una ficha de ayuda.
 *  - Validación de entrada (largo, caracteres de control, links/código) y respuesta mínima (nunca la clave
 *    ni el error crudo de Jev).
 *  - Caché de 6 h por consulta idéntica (más rápido y no gasta de nuevo).
 *  - Topes ALTOS sólo contra abuso masivo (ajustables abajo): no frenan el uso normal del chat.
 */
const JEV_MODEL = 'jev-latest';
const JEV_MAX_POR_MINUTO = 600;        // todo el sitio (un uso normal está muy por debajo)
const JEV_MAX_POR_DIA = 50000;         // tope de gasto diario (~US$ 12 al precio publicado)
const JEV_MAX_POR_SESION_10MIN = 120;  // por pestaña del navegador

function jevResponder(p) {
  const key = PropertiesService.getScriptProperties().getProperty('TYPESAFE_KEY');
  if (!key) return { ok: false, error: 'jev_no_configurado' };
  let q = String(p.q || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (q.length < 3 || q.length > 400) return { ok: false, error: 'consulta_invalida' };
  if (/(https?:\/\/|www\.|<\/?[a-z]|\{[\s\S]*\}|;\s*(drop|select|insert)\b)/i.test(q)) return { ok: false, error: 'consulta_invalida' };
  if (!/[a-záéíóúñü]{3,}/i.test(q)) return { ok: false, error: 'consulta_invalida' };

  const cache = CacheService.getScriptCache();
  const norm = q.toLowerCase();
  const ck = 'jev_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, norm)).slice(0, 40);
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
      criteria: JEV_CRITERIOS,
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
  const out = { ok: true, choice: a.choice, confidence: Math.round((a.confidence || (top[0] || [0, 0])[1]) * 1000) / 1000, top };
  cache.put(ck, JSON.stringify(out), 21600);
  return out;
}

function doPost(e) {
  let p0 = {};
  try { p0 = JSON.parse(e.postData.contents || '{}'); } catch (_) { return out({ ok: false, error: 'json' }); }
  if (p0.action === 'jev') {
    try { return out(jevResponder(p0)); } catch (err) { return out({ ok: false, error: 'jev_error' }); }
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const p = JSON.parse(e.postData.contents || '{}');
    const c = p.caso || {};
    if (!/^RES-[A-Z0-9]{6}$/.test(String(c.caso_id || ''))) return out({ ok: false, error: 'caso_id' });
    if (ESTADOS.indexOf(c.estado) === -1) return out({ ok: false, error: 'estado' });
    if (!throttle(c.caso_id)) return out({ ok: false, error: 'demasiados envios' });

    const sh = sheet();
    const row = findRow(sh, c.caso_id);
    const now = new Date();
    const prev = row ? sh.getRange(row, 1, 1, COLS.length).getValues()[0] : null;
    const rec = {};
    COLS.forEach((k, i) => { rec[k] = prev ? prev[i] : ''; });
    COLS.forEach((k) => { if (k in c && c[k] != null) rec[k] = clip(c[k]); });
    rec.creado = prev ? prev[1] : now;
    rec.actualizado = now;

    let mail = false;
    if (p.action === 'derivar') {
      ['barrio', 'residente', 'lote', 'celular', 'correo'].forEach((k) => {
        if (!String(rec[k] || '').trim()) throw new Error('falta ' + k);
      });
      if (!CENTRAL_MAIL) return out({ ok: false, error: 'CENTRAL_MAIL vacío: completar en el script' });
      rec.derivado_central = 'sí';
      sendMail(rec);                        // si falla, lanza y NO se marca como enviado
      rec.correo_enviado = now;
      mail = true;
      const t = mondayTicket(rec);          // fase 2 (hoy devuelve null)
      if (t) rec.monday_ticket = t;
    }
    const values = [COLS.map((k) => rec[k])];
    if (row) sh.getRange(row, 1, 1, COLS.length).setValues(values);
    else sh.appendRow(values[0]);
    return out({ ok: true, mail, row: row || sh.getLastRow() });
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function sendMail(r) {
  const body =
    `Caso ${r.caso_id} · ${String(r.estado).toUpperCase()} · derivado desde SILA Ayuda\n\n` +
    `CONTACTO DEL RESIDENTE\n` +
    `Barrio: ${r.barrio}\nResidente: ${r.residente}\nLote: ${r.lote}\nCelular: ${r.celular}\nCorreo: ${r.correo}\n\n` +
    `CONSULTA\n${r.consulta}\n` + (r.aclaraciones ? `\nAclaraciones: ${r.aclaraciones}\n` : '') +
    (r.modulo ? `Módulo: ${r.modulo}\n` : '') +
    `\nLO QUE YA SE INTENTÓ (según manuales)\n${r.pasos_intentados || '— El bot no encontró una solución documentada.'}\n` +
    (r.fuentes_citadas ? `\nFuentes citadas: ${r.fuentes_citadas}\n` : '') +
    `\nResultado informado por el residente: ${r.resultado || '—'}\n`;
  MailApp.sendEmail({
    to: CENTRAL_MAIL,
    subject: `SILA Ayuda · ${r.caso_id} · ${r.barrio} · Lote ${r.lote}`,
    body,
    replyTo: /@/.test(String(r.correo)) ? String(r.correo) : undefined,
    name: 'SILA Ayuda',
  });
}

// Fase 2 — PENDIENTE: crear un ítem en Monday por cada caso derivado.
function mondayTicket(r) {
  if (!MONDAY_TOKEN || !MONDAY_BOARD_ID) return null;
  const q = 'mutation ($b: ID!, $n: String!) { create_item (board_id: $b, item_name: $n) { id } }';
  const res = UrlFetchApp.fetch('https://api.monday.com/v2', {
    method: 'post', contentType: 'application/json', headers: { Authorization: MONDAY_TOKEN },
    payload: JSON.stringify({ query: q, variables: { b: MONDAY_BOARD_ID, n: `${r.caso_id} · ${r.barrio} · Lote ${r.lote}` } }),
    muteHttpExceptions: true,
  });
  const j = JSON.parse(res.getContentText() || '{}');
  return j.data && j.data.create_item ? j.data.create_item.id : null;
}

function sheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET) || ss.getSheets()[0];
  if (sh.getLastRow() === 0) sh.appendRow(COLS);
  return sh;
}
function findRow(sh, id) {
  const n = sh.getLastRow() - 1;
  if (n < 1) return 0;
  const i = sh.getRange(2, 1, n, 1).getValues().flat().indexOf(id);
  return i === -1 ? 0 : i + 2;
}
function clip(v) {
  const s = String(v).slice(0, 4000);
  return s.replace(/^[=+\-@]/, "'$&"); // evita inyección de fórmulas
}
function throttle(id) {
  const c = CacheService.getScriptCache();
  const k = 't_' + id;
  const n = Number(c.get(k) || 0);
  if (n > 30) return false;
  c.put(k, String(n + 1), 3600);
  return true;
}
function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
