/* SILA Ayuda — base de conocimiento (SQLite en el navegador con sql.js) y búsqueda.
 * Sólo recupera fragmentos LITERALES de los manuales; no genera texto.
 * Ranking BM25 con normalización en español, sin servicios externos.
 */
(function () {
  const ROOT = (document.currentScript && document.currentScript.src) ? new URL('../../', document.currentScript.src).href : './';

  const STOP = new Set(('a al algo algun alguna alguno ante antes aqui asi aun bien cada como con contra cual cuales cuando de del desde donde dos e el ella ellas ellos en entre era es esa ese eso esta estan este esto estos estas fue ha han hay hasta la las le les lo los mas me mi mia mis mucho muy nada ni no nos nosotros o otra otro otros para pero poco por porque que quien quienes se sea ser si sin sobre su sus tal tambien te ti tu tus un una uno unos unas y ya yo vos usted ustedes ' +
    'hola buenas buen dia tardes noches gracias porfa favor por favor necesito quiero queria quisiera tengo tenemos tiene puedo puede podes pueden hacer hago hice ' +
    'saber sabe ver veo dice dicen esta estoy estamos sale aparece pasa paso me le lo eh ok cuanto cuanta cuantos cuantas cual cuales').split(/\s+/));
  // palabras que describen "que hay un problema" pero no QUÉ: no alcanzan para buscar
  const VAGUE = new Set('problema problemas ayuda ayudame error errores falla fallas anda andar funciona funcionan funcionar sirve consulta consultas duda dudas tema temas cosa algo app aplicacion celular telefono sistema nuevo nueva mal'.split(' '));
  // verbos de acción genéricos: ayudan a ordenar pero casi no cuentan para la cobertura
  const ACTION = new Set('cargo cargar subo subir envio enviar mando mandar crear creo generar genero hacer hago usar uso uso utilizar poner pongo agregar agrego'.split(' '));
  // equivalencias de vocabulario (sólo para ENCONTRAR; la respuesta es siempre el texto del manual)
  const SYN = {
    encomienda: ['paquet', 'correspondencia'], paquete: ['paquet'], correo: ['correspondencia'], delivery: ['paquet'],
    portero: ['timbre'], timbrar: ['timbre'], llamada: ['llamad', 'timbre'], invitado: ['invita', 'visita', 'autorizacion'], invito: ['autorizacion'], invitar: ['autorizacion'], visita: ['visita', 'invita'],
    sos: ['emergencia', 'panico'], panico: ['emergencia'], robo: ['emergencia', 'intrusion'], incendio: ['emergencia'],
    multa: ['infracciones'], multas: ['infracciones'], sancion: ['infracciones'], pileta: ['amenit'], sum: ['amenit'], quincho: ['amenit'], cancha: ['amenit', 'cancha'], tenis: ['amenit'], reserva: ['reserv', 'amenit'],
    luz: ['luces', 'encendido'], luces: ['encendido'], prender: ['encendido'], prendo: ['encendido'], encender: ['encendido'], cara: ['selfie', 'face'], facial: ['selfie', 'face'], rostro: ['selfie', 'face'],
    registrarme: ['regist', 'inscri'], inscribirme: ['inscri', 'regist'], alta: ['regist', 'inscri'], empadronar: ['empadr'],
    reclamo: ['reclam', 'consul'], expensa: ['expens'], pagar: ['pago', 'pagos', 'inform'], comprobante: ['comprob', 'pago'],
    obra: ['obras'], albanil: ['obras', 'responsable'], contratista: ['obras', 'responsable'], seguro: ['seguro', 'art'],
    llegando: ['llegan'], notificacion: ['notifi', 'push'], aviso: ['notifi'],
  };

  const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ñ/g, 'n');
  // stemmer liviano: saca terminaciones comunes del español y corta a 6 letras
  const ENDS = ['aciones', 'iciones', 'ciones', 'siones', 'amiento', 'imiento', 'acion', 'icion', 'cion', 'sion', 'mente', 'ando', 'iendo',
    'adas', 'ados', 'idas', 'idos', 'ada', 'ado', 'ida', 'ido', 'ar', 'er', 'ir', 'as', 'es', 'os', 'a', 'e', 'o', 's'];
  const stem = (t) => {
    for (const e of ENDS) if (t.endsWith(e) && t.length - e.length >= 3) { t = t.slice(0, -e.length); break; }
    return t.slice(0, 6);
  };
  const words = (s) => fold(s).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  const tokens = (s) => words(s).filter((w) => w.length > 1 && !STOP.has(w)).map(stem);

  const syn = (x) => (SYN[x] || SYN[stem(x)] || []).map((y) => stem(y));
  const related = (x, hit) => hit.has(stem(x)) || syn(x).some((y) => hit.has(y)) || [...hit].some((h) => h.length >= 4 && (h.startsWith(stem(x)) || stem(x).startsWith(h)));

  let ready = null;
  const K = { docs: {}, chunks: [], df: new Map(), avg: 0, modules: [] };

  function load() {
    if (ready) return ready;
    ready = (async () => {
      const SQL = await window.initSqlJs({ locateFile: (f) => ROOT + 'js/vendor/' + f });
      const cfg = (window.SILA_CONFIG && window.SILA_CONFIG.ayuda) || {};
      const buf = await fetch(ROOT + (cfg.kbUrl || 'kb/sila_kb.sqlite'), { cache: 'no-cache' }).then((r) => {
        if (!r.ok) throw new Error('kb ' + r.status);
        return r.arrayBuffer();
      });
      const db = new SQL.Database(new Uint8Array(buf));
      const rows = (sql) => { const r = db.exec(sql)[0]; return r ? r.values.map((v) => Object.fromEntries(r.columns.map((c, i) => [c, v[i]]))) : []; };
      rows('SELECT * FROM documents').forEach((d) => { d.drive_ids = JSON.parse(d.drive_ids); K.docs[d.id] = d; });
      K.meta = Object.fromEntries(rows('SELECT key, value FROM kb_meta').map((r) => [r.key, r.value]));
      K.chunks = rows('SELECT id, doc_id, page, section, ord, text, image FROM chunks ORDER BY ord').map((c) => {
        const d = K.docs[c.doc_id];
        const body = tokens(c.text);
        const head = tokens(`${d.title} ${d.module} ${c.section || ''}`);
        const tf = new Map();
        body.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
        head.forEach((t) => tf.set(t, (tf.get(t) || 0) + 2)); // título/módulo pesan doble
        const len = body.length + head.length * 2;
        const steps = c.text.split(/\n/).filter((l) => /^(\d+[.)]|•)\s/.test(l)).length;
        return { ...c, doc: d, tf, len, steps, set: new Set(body) };
      });
      K.chunks.forEach((c) => c.tf.forEach((_, t) => K.df.set(t, (K.df.get(t) || 0) + 1)));
      // fichas en tono humano (redactadas desde los manuales, cada paso con su cita validada)
      const hasCards = rows("SELECT name FROM sqlite_master WHERE type='table' AND name='cards'").length;
      K.cdf = new Map();
      K.cards = (hasCards ? rows('SELECT * FROM cards') : []).map((c) => {
        const body = JSON.parse(c.body);
        const card = { ...c, ask: JSON.parse(c.ask), steps: body.steps || [], tips: body.tips || [] };
        const tf = new Map();
        const put = (s, w) => tokens(s).forEach((t) => tf.set(t, (tf.get(t) || 0) + w));
        card.ask.forEach((a) => put(a, 3));
        put(card.title, 3); put(card.module, 2);
        card.steps.concat(card.tips).forEach((s) => put(s.say, 1));
        card.tf = tf;
        card.len = [...tf.values()].reduce((a, b) => a + b, 0);
        card.steps.concat(card.tips).forEach((s) => { s.chunkObj = K.chunks.find((x) => x.id === s.chunk); });
        return card;
      });
      K.cards.forEach((c) => c.tf.forEach((_, t) => K.cdf.set(t, (K.cdf.get(t) || 0) + 1)));
      K.cavg = K.cards.length ? K.cards.reduce((a, c) => a + c.len, 0) / K.cards.length : 1;
      K.vocab = [...new Set([...K.df.keys(), ...K.cdf.keys()])];
      const pc = new Map();
      K.prefix = (t) => {
        if (!pc.has(t)) pc.set(t, K.vocab.filter((v) => v !== t && v.length >= 4 && (v.startsWith(t) || t.startsWith(v))));
        return pc.get(t);
      };
      K.avg = K.chunks.reduce((a, c) => a + c.len, 0) / K.chunks.length;
      K.modules = [...new Set(Object.values(K.docs).map((d) => d.module))].sort((a, b) => a.localeCompare(b, 'es'));
      db.close();
      return K;
    })();
    ready.catch(() => { ready = null; });
    return ready;
  }

  const AUD = { residente: 1.25, general: 1, admin_guardia: 0.55, administracion: 0.55 };

  /** Analiza una consulta. Cada palabra útil forma un GRUPO con sus variantes de raíz (peso 1)
   *  y sus sinónimos (peso 0.6); el grupo puntúa como un solo término (no se infla por variantes raras). */
  function analyze(q) {
    const w = words(q).filter((x) => x.length > 1 && !STOP.has(x));
    const content = w.filter((x) => !VAGUE.has(x));
    const terms = new Set(content.map(stem));
    const groups = new Map();
    const pre = (t) => (K.prefix && t.length >= 4 ? K.prefix(t) : []);
    content.forEach((x) => {
      const st = stem(x);
      if (groups.has(st)) return;
      const vs = new Map([[st, 1]]);
      pre(st).forEach((v) => vs.set(v, 1));
      syn(x).forEach((y) => { if (!vs.has(y)) vs.set(y, 0.6); pre(y).forEach((v) => { if (!vs.has(v)) vs.set(v, 0.6); }); });
      groups.set(st, { x, st, vs });
    });
    const expanded = new Set();
    groups.forEach((g) => g.vs.forEach((_, v) => expanded.add(v)));
    return { raw: q, content, terms: [...terms], expanded: [...expanded], groups: [...groups.values()] };
  }

  /** BM25 por grupos sobre una colección (items con tf/len). Devuelve score y cobertura ponderada por rareza. */
  function bm25(items, A, avg) {
    const N = items.length, k1 = 1.2, b = 0.75;
    const gdf = A.groups.map((g) => items.reduce((n, it) => n + ([...g.vs.keys()].some((v) => it.tf.has(v)) ? 1 : 0), 0));
    const out = [];
    for (const it of items) {
      let s = 0, tot = 0, got = 0;
      const hit = new Set();
      A.groups.forEach((g, i) => {
        let f = 0;
        g.vs.forEach((w, v) => { const k = it.tf.get(v); if (k) { f += w * k; hit.add(v); } });
        const idf = Math.log(1 + (N - gdf[i] + 0.5) / (gdf[i] + 0.5));
        const wc = idf * (ACTION.has(g.x) ? 0.25 : 1); // una palabra rara que NO está (ej. "contraseña") pesa mucho
        tot += wc;
        if (!f) return;
        got += wc;
        s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * it.len / avg));
      });
      if (s) out.push({ it, s, coverage: tot ? got / tot : 0, hit });
    }
    return out;
  }

  /** Búsqueda en las páginas de los manuales. opts.module filtra por módulo. */
  function search(q, opts = {}) {
    const A = typeof q === 'string' ? analyze(q) : q;
    const items = opts.module ? K.chunks.filter((c) => c.doc.module === opts.module) : K.chunks;
    return bm25(items, A, K.avg).map(({ it: c, s, coverage, hit }) => {
      s *= AUD[c.doc.audience] || 1;
      if (c.steps >= 2) s *= 1.15; // páginas con pasos numerados o viñetas
      return { chunk: c, score: s * (0.6 + 0.4 * coverage), coverage, hit };
    }).sort((x, y) => y.score - x.score);
  }

  /** Líneas del fragmento más relevantes (ventana contigua), sin modificar el texto. */
  function excerpt(chunk, A, max = 9) {
    const lines = chunk.text.split('\n');
    if (lines.length <= max) return { lines, cut: false };
    const sc = lines.map((l) => { const ts = new Set(tokens(l)); return A.expanded.reduce((n, t) => n + (ts.has(t) ? 1 : 0), 0); });
    let best = 0, at = 0;
    for (let i = 0; i + max <= lines.length; i++) {
      const v = sc.slice(i, i + max).reduce((a, x) => a + x, 0);
      if (v > best) { best = v; at = i; }
    }
    return { lines: lines.slice(at, at + max), cut: true };
  }

  const similarity = (a, b) => { let i = 0; a.set.forEach((t) => b.set.has(t) && i++); return i / (a.set.size + b.set.size - i || 1); };
  const baseTitle = (t) => fold(t).replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();

  const MIN_COV = 0.6, MIN_SCORE = 3.5;
  const isAdmin = (h) => /^admin/.test(h.chunk.doc.audience);

  /**
   * Decide qué hacer con una consulta, sin inventar nada:
   *  vague   → no dice sobre qué (pedir módulo / más detalle)
   *  choose  → coincide igual de bien con varios módulos (pedir cuál)
   *  narrow  → sabemos el módulo pero no el problema (pedir detalle)
   *  answer  → fragmentos con respaldo (frags) + posible discrepancia entre versiones (conflict)
   *  none    → no hay respaldo suficiente en los manuales
   */
  function decideChunks(text, ctx = {}) {
    const A = analyze(text);
    if (!A.content.length) return { type: 'vague', A };
    const hits = search(A, { module: ctx.module });
    let good = hits.filter((h) => h.coverage >= MIN_COV && h.score >= MIN_SCORE);
    if (!good.length) return { type: 'none', A };
    const forResidents = good.filter((h) => !isAdmin(h));
    const adminOnly = !forResidents.length;
    if (!adminOnly) good = forResidents;
    const best = good[0];
    // si sólo hay manuales de administración, se exige un respaldo mucho más fuerte
    if (adminOnly && !(best.coverage >= 0.9 && best.score >= 6)) return { type: 'none', A };
    const close = good.filter((h) => h.score >= 0.9 * best.score);
    const mods = [...new Set(close.map((h) => h.chunk.doc.module))];
    if (!ctx.module && !ctx.clarified && mods.length > 1) return { type: 'choose', A, modules: mods.slice(0, 4) };
    if (!ctx.clarified && A.terms.length === 1 && words(text).length <= 3) return { type: 'narrow', A, module: best.chunk.doc.module, best };
    // hasta 2 fragmentos del mismo módulo
    const frags = [best];
    for (const h of good) {
      if (frags.length >= 2) break;
      if (h === best || h.score < 0.6 * best.score || h.chunk.doc.module !== best.chunk.doc.module) continue;
      if (frags.some((f) => f.chunk.doc.id === h.chunk.doc.id && f.chunk.page === h.chunk.page)) continue;
      if (frags.some((f) => similarity(f.chunk, h.chunk) > 0.8)) continue; // mismo contenido repetido en otro manual
      frags.push(h);
    }
    // discrepancia: dos VERSIONES del mismo manual que dicen cosas distintas sobre esto
    let conflict = null;
    for (const h of good) {
      if (h.score < 0.7 * best.score || h.chunk.doc.id === best.chunk.doc.id) continue;
      const same = baseTitle(h.chunk.doc.title) === baseTitle(best.chunk.doc.title) && h.chunk.doc.audience === best.chunk.doc.audience;
      if (same && similarity(h.chunk, best.chunk) < 0.85) { conflict = [best, h]; break; }
    }
    return { type: 'answer', A, frags, adminOnly, conflict };
  }

  /** Búsqueda en las fichas humanas; si la consulta nombra el módulo, sus fichas suman. */
  function searchCards(A, opts = {}) {
    const items = opts.module ? K.cards.filter((c) => c.module === opts.module) : K.cards;
    return bm25(items, A, K.cavg).map(({ it: c, s, coverage }) => {
      const modT = tokens(c.module);
      if (modT.length && modT.every((t) => A.expanded.includes(t))) s *= 1.3;
      return { card: c, score: s * (0.6 + 0.4 * coverage), coverage };
    }).sort((x, y) => y.score - x.score);
  }

  const CARD_COV = 0.8, CARD_SCORE = 2.5;
  /**
   * Decide qué hacer, sin inventar nada:
   *  vague  → no dice sobre qué (ofrecer temas)
   *  narrow → sabemos el tema pero no qué necesita (ofrecer las fichas de ese tema)
   *  choose → dos o tres fichas igual de probables (preguntar cuál)
   *  card   → ficha en tono humano (pasos validados contra los manuales)
   *  page   → no hay ficha pero sí una página del manual muy clara (se muestra la imagen)
   *  none   → no hay respaldo en la documentación
   */
  function decide(text, ctx = {}) {
    const A = analyze(text);
    if (!A.content.length) return { type: 'vague', A };
    const hits = searchCards(A, { module: ctx.module }).filter((h) => h.coverage >= CARD_COV && h.score >= CARD_SCORE);
    if (hits.length) {
      const best = hits[0];
      if (!ctx.clarified && A.terms.length === 1 && words(text).length <= 3) {
        const mod = best.card.module;
        return { type: 'narrow', A, module: mod, cards: K.cards.filter((c) => c.module === mod).slice(0, 5) };
      }
      const close = hits.filter((h) => h !== best && h.score >= 0.93 * best.score).slice(0, 2);
      if (!ctx.clarified && close.length) return { type: 'choose', A, cards: [best, ...close].map((h) => h.card) };
      return { type: 'card', A, card: best.card, score: best.score };
    }
    // sin ficha: sólo si una página para residentes coincide con mucha claridad
    const ch = search(A, { module: ctx.module }).filter((h) => !isAdmin(h) && h.coverage >= 0.85 && h.score >= 8);
    if (ch.length) return { type: 'page', A, hit: ch[0] };
    return { type: 'none', A };
  }
  const cardsOf = (module) => K.cards.filter((c) => c.module === module);
  const cardModules = () => [...new Set(K.cards.map((c) => c.module))].sort((a, b) => a.localeCompare(b, 'es'));

  window.SILA_KB = { load, analyze, search, searchCards, decide, decideChunks, cardsOf, cardModules, excerpt, similarity, baseTitle, tokens, fold, stem, get K() { return K; }, ROOT };
})();
