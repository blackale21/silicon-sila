/**
 * SILA Ayuda — casos de residentes → Google Sheet + correo a la central (gratis).
 *
 * INSTALACIÓN (una vez):
 *  1) Abrir la planilla "SILA Ayuda · Casos de residentes" → Extensiones → Apps Script → pegar este archivo.
 *  2) Completar CENTRAL_MAIL (a quién le llega el correo de cada derivación).
 *  3) Ejecutar la función setup() una vez (pide permisos de Sheets y Gmail: aceptar).
 *  4) Implementar → Nueva implementación → Aplicación web
 *       Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario  → copiar la URL /exec
 *  5) Pegar esa URL en js/config.js → ayuda.casosUrl  y poner ayuda.demo = false.
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

function doPost(e) {
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
