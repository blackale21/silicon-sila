/* SILA Ayuda — Jev (TypeSafe AI) para ENTENDER la consulta del vecino.
 * Jev sólo ELIGE qué ficha corresponde (o "ninguna"); el texto que ve el vecino sale siempre de las
 * fichas validadas contra los manuales. Se llama a través del Apps Script del proyecto
 * (backend/ayuda-casos.gs): la clave nunca está en la web.
 * Candado: si la consulta no tiene nada que ver con la app/los manuales, NO se llama a Jev.
 */
(function () {
  const KB = window.SILA_KB;
  const cfg = () => (window.SILA_CONFIG && window.SILA_CONFIG.ayuda) || {};
  const url = () => cfg().backendUrl || '';
  const cache = new Map();
  const GENERICAS = /^(escrib|cont[aá]|dec[ií]|dime|ignor|olvid[aá] (tus|las)|habl|explic|mostr|pas[aá]me|dame|hac[eé]me|arm[aá]|gener|cre[aá]|inventa|resum|traduc|respond|instruc)/i;
  let sid = '';
  try { sid = sessionStorage.getItem('sila_sid') || ''; } catch (_) { /* nada */ }
  if (!sid) {
    sid = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
    try { sessionStorage.setItem('sila_sid', sid); } catch (_) { /* nada */ }
  }

  /** Candado: ¿la consulta habla de la app o de los manuales? Al menos la mitad de sus palabras
   *  con contenido (sin contar "app", "iphone"…) tienen que existir en las fichas o en los manuales,
   *  ya sea tal cual, con un error de tipeo corregido o por sinónimo. Si no, Jev no se usa. */
  function relevante(q) {
    if (!KB || !KB.K.cards) return false;
    const K = KB.K, A = KB.analyze(q);
    const gs = (A.groups || []).filter((g) => !g.ctx);
    if (!gs.length) return false;
    const conocida = (g) => [...g.vs.keys()].some((v) => v.length >= 3 && (K.cdf.has(v) || K.df.has(v)));
    // verbos de pedido genéricos ("escribime", "contame", "decime"…) no alcanzan para habilitar a Jev
    const generica = (g) => GENERICAS.test(g.x);
    const ok = gs.filter(conocida);
    return ok.length / gs.length >= 0.5 && ok.some((g) => !generica(g));
  }

  /** → { ok, choice, confidence, top: [[id, prob]] } · nunca lanza: si falla, ok:false */
  async function elegir(q) {
    if (!url()) return { ok: false, error: 'sin_backend' };
    const k = q.trim().toLowerCase();
    if (cache.has(k)) return cache.get(k);
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(url(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // sin preflight CORS
        body: JSON.stringify({ action: 'jev', q: q.slice(0, 400), sid }),
        signal: ctl.signal,
      });
      const j = await r.json();
      if (j && j.ok) cache.set(k, j);
      return j && typeof j === 'object' ? j : { ok: false, error: 'respuesta' };
    } catch (e) {
      return { ok: false, error: e.name === 'AbortError' ? 'tiempo' : 'red' };
    } finally {
      clearTimeout(t);
    }
  }

  window.SILA_JEV = { activo: () => !!url(), relevante, elegir };
})();
