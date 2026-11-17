/* SILA Ayuda — registro de casos.
 * DEMO (ayuda.demo = true o sin casosUrl): se guardan SOLO en este navegador (localStorage) y se avisan
 * en vivo a otras pestañas (BroadcastChannel 'sila-demo'). No se envía nada.
 * PRODUCCIÓN: POST al Apps Script (backend/ayuda-casos.gs) → fila en la Google Sheet y, al derivar, correo a la central.
 * Sólo devuelve ok:true si la acción ocurrió de verdad; el bot usa eso para no afirmar nada falso.
 */
(function () {
  const KEY = 'sila_demo_casos_v1';
  const ch = 'BroadcastChannel' in window ? new BroadcastChannel('sila-demo') : null;
  const cfg = () => (window.SILA_CONFIG && window.SILA_CONFIG.ayuda) || { demo: true };
  const casosUrl = () => cfg().casosUrl || cfg().backendUrl || '';
  const isDemo = () => cfg().demo !== false || !casosUrl();

  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; } };
  const write = (l) => { try { localStorage.setItem(KEY, JSON.stringify(l.slice(0, 300))); return true; } catch (_) { return false; } };

  function nuevoId() {
    const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const r = new Uint8Array(6);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(r) : r.forEach((_, i) => (r[i] = Math.random() * 255));
    return 'RES-' + [...r].map((x) => a[x % a.length]).join('');
  }

  function guardarLocal(caso, evento) {
    const l = read();
    const i = l.findIndex((x) => x.caso_id === caso.caso_id);
    const prev = i >= 0 ? l[i] : { eventos: [] };
    const rec = { ...prev, ...caso, eventos: prev.eventos || [] };
    if (evento) rec.eventos.push({ t: new Date().toISOString(), txt: evento });
    if (i >= 0) l[i] = rec; else l.unshift(rec);
    const ok = write(l);
    ch && ch.postMessage({ type: 'caso', id: caso.caso_id });
    return ok;
  }

  /**
   * action: 'upsert' (registrar/actualizar) | 'derivar' (planilla + correo a la central)
   * → { ok, simulated, mail, error }
   */
  async function enviar(action, caso, evento) {
    const fila = { ...caso, actualizado: new Date().toISOString() };
    if (isDemo()) {
      const ok = guardarLocal(fila, evento);
      return ok ? { ok: true, simulated: true, mail: false } : { ok: false, simulated: true, error: 'el navegador bloqueó el almacenamiento' };
    }
    try {
      const r = await fetch(casosUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // sin preflight CORS
        body: JSON.stringify({ action, caso: fila, evento: evento || '' }),
      });
      const j = await r.json();
      if (j && j.ok) {
        guardarLocal(fila, evento); // copia local para retomar la conversación
        return { ok: true, simulated: false, mail: !!j.mail, central: !!j.central };
      }
      return { ok: false, simulated: false, error: (j && j.error) || 'respuesta inválida' };
    } catch (e) {
      return { ok: false, simulated: false, error: 'sin conexión con el registro' };
    }
  }

  function onChange(cb) {
    ch && ch.addEventListener('message', (e) => e.data && e.data.type === 'caso' && cb(e.data));
    addEventListener('storage', (e) => { if (e.key === KEY) cb({ type: 'caso' }); });
  }
  function clear() { write([]); ch && ch.postMessage({ type: 'caso', id: null }); }

  window.SILA_CASOS = { KEY, read, enviar, nuevoId, onChange, clear, isDemo };
})();
