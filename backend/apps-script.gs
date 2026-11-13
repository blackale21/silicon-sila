/**
 * SILA — backend gratis con Google Sheets + aviso por mail.
 * 1) Crear una Google Sheet → Extensiones → Apps Script → pegar este archivo.
 * 2) Completar NOTIFY (mails que reciben el aviso, separados por coma).
 * 3) Implementar → Nueva implementación → Aplicación web
 *    Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario.
 * 4) Copiar la URL /exec en js/config.js → appsScriptUrl.
 */
const NOTIFY = ''; // ej: 'comercial@silicon-access.com'
const SHEET = 'Leads';
const COLS = ['fecha', 'id', 'temperatura', 'score', 'vertical', 'cuenta', 'nombre', 'apellido', 'rol', 'localidad',
  'email', 'telefono', 'necesidad', 'etapa', 'resumen', 'utm_source', 'utm_medium', 'utm_campaign', 'pagina', 'segundos'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const p = JSON.parse(e.postData.contents);
    if (!p || !p.id || (!p.email && !p.telefono)) return out({ ok: false, error: 'payload' });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET);
    if (sh.getLastRow() === 0) sh.appendRow(COLS);

    // idempotente: si el id ya está, no duplica (reintentos de la cola)
    const ids = sh.getLastRow() > 1 ? sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues().flat() : [];
    if (ids.indexOf(p.id) === -1) {
      const o = p.origen || {};
      const row = COLS.map((c) => {
        const v = c in p ? p[c] : o[c === 'pagina' ? 'pagina' : c];
        return v == null ? '' : String(v).replace(/^[=+\-@]/, "'$&"); // evita inyección de fórmulas
      });
      sh.appendRow(row);
      if (NOTIFY) notify(p);
    }
    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function notify(p) {
  const t = { caliente: '🔥 CALIENTE', tibio: 'TIBIO', 'frío': 'frío' }[p.temperatura] || p.temperatura;
  const body =
    `Nuevo lead SILA ${p.id} · ${t}\n\n` +
    `${p.cuenta} — ${p.vertical}\n${p.nombre} ${p.apellido} (${p.rol}) · ${p.localidad}\n` +
    `${p.email || ''} ${p.telefono || ''}\n\nNecesidad: ${p.necesidad}\nEtapa: ${p.etapa}\n\n${p.resumen}`;
  MailApp.sendEmail({ to: NOTIFY, subject: `SILA · ${t} · ${p.cuenta} (${p.vertical})`, body, replyTo: p.email || undefined });
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
