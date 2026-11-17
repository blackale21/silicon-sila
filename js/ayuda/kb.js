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
  const VAGUE = new Set('problema problemas ayuda ayudame error errores falla fallas anda andar funciona funcionan funcionar sirve consulta consultas duda dudas tema temas cosa algo sistema nuevo nueva mal'.split(' '));
  // palabras de CONTEXTO (dispositivo, sistema, marca, "app"): dicen DÓNDE, no QUÉ. Si aparecen en una ficha suman
  // un poco, pero nunca bajan la cobertura (antes "iphone", que no está en ningún manual, hundía la consulta).
  const CONTEXT = new Set(('app apps aplicacion aplicaciones aplicativo celular celu cel telefono telefonos movil smartphone ' +
    'iphone ios apple ipad android samsung galaxy motorola moto xiaomi redmi huawei lg nokia tablet tableta ' +
    'compu computadora pc notebook laptop web pagina navegador chrome safari internet silicon access').split(' '));
  // verbos de acción genéricos: ayudan a ordenar pero casi no cuentan para la cobertura
  const ACTION = new Set('cargo cargar subo subir envio enviar mando mandar crear creo generar genero hacer hago usar uso uso utilizar poner pongo agregar agrego pide piden pidio pedir solicita entrar entre entro ingresar ingrese acceder pasar'.split(' '));
  // frases hechas que cambian el sentido de sus palabras sueltas ("me doy de alta" es registrarme, no dar de alta a otro)
  const PHRASES = [
    [/\b(me|nos) (doy|di|damos|dimos|puedo dar|quiero dar|tengo que dar) de alta\b/g, 'registrarme'],
    [/\bdarme de alta\b/g, 'registrarme'],
    [/\bfin(es)? de semana\b/g, 'dias'],
    [/\b(dejar|dejo|dejen|deja) (pasar|entrar)\b/g, 'autorizar'],
    [/\b(doy|dar|darle|dale|dejar|dejarle) (permiso|acceso|ingreso)\b/g, 'autorizar'],
    [/\b(entrar|entro|ingresar|ingreso|acceder|accedo|loguearme|loguear|logearme|logear) (a|en|desde) (la )?(app|aplicacion)\b/g, 'iniciar sesion app'],
  ];
  // equivalencias de vocabulario (sólo para ENCONTRAR; la respuesta es siempre el texto del manual)
  const SYN = {
    encomienda: ['paquet', 'correspondencia'], paquete: ['paquet'], correo: ['correspondencia'], delivery: ['paquet'],
    pedido: ['paquet'], compra: ['paquet'], mercadolibre: ['paquet'], amazon: ['paquet'], cadete: ['paquet'], cartero: ['correspondencia', 'paquet'],
    portero: ['timbre'], timbrar: ['timbre'], llamada: ['llamad', 'timbre'], llamador: ['timbre'], invitado: ['invita', 'visita', 'autorizacion'], invito: ['autorizacion'], invitar: ['autorizacion'], visita: ['visita', 'invita'],
    sonar: ['suena'], sono: ['suena'], suenan: ['suena'], suene: ['suena'], sonando: ['suena'],
    sos: ['emergencia', 'panico'], panico: ['emergencia'], robo: ['emergencia', 'intrusion'], incendio: ['emergencia'],
    ambulancia: ['emergencia'], asalto: ['emergencia', 'intrusion'], ladron: ['emergencia', 'intrusion'], ladrones: ['emergencia', 'intrusion'], intruso: ['intrusion', 'emergencia'],
    auxilio: ['emergencia'], urgencia: ['emergencia'], fuego: ['incendio', 'emergencia'],
    multa: ['infracciones'], multas: ['infracciones'], sancion: ['infracciones'], multaron: ['infracciones'], apelar: ['apel', 'descargo'],
    pileta: ['amenit'], piscina: ['pileta', 'amenit'], sum: ['amenit'], salon: ['amenit'], quincho: ['amenit'], parrilla: ['amenit'], asador: ['parrilla', 'amenit'],
    cancha: ['amenit', 'cancha'], tenis: ['amenit'], padel: ['cancha', 'amenit'], futbol: ['cancha', 'amenit'], gimnasio: ['amenit'], gym: ['amenit'],
    reserva: ['reserv', 'amenit'], turno: ['reserv', 'turnos'], amenity: ['amenit'],
    luz: ['luces', 'encendido'], luces: ['encendido'], prender: ['encendido'], prendo: ['encendido'], encender: ['encendido'], iluminacion: ['luces', 'encendido'], reflector: ['luces', 'encendido'], reflectores: ['luces', 'encendido'],
    cara: ['selfie', 'face'], facial: ['selfie', 'face'], rostro: ['selfie', 'face'], faceid: ['face', 'selfie'],
    registrarme: ['regist', 'inscri'], regist: ['regist', 'inscri'], inscribirme: ['inscri', 'regist'], alta: ['regist', 'inscri'], empadronar: ['empadr'],
    anot: ['inscri', 'regist'], anotarme: ['inscri', 'regist'], login: ['logue', 'sesion'], loguear: ['logue', 'sesion'], loguearme: ['logue', 'sesion'],
    mail: ['correo'], email: ['correo', 'mail'], gmail: ['correo', 'mail'], hotmail: ['correo', 'mail'], clave: ['contrasena'], password: ['contrasena'],
    reclamo: ['reclam', 'consul'], queja: ['reclamo'], quejarme: ['reclamo'], quejar: ['reclamo'], denuncia: ['reclamo', 'denuncio'], denunciar: ['reclamo', 'denuncio'], ticket: ['reclamo'],
    expensa: ['expens'], cuota: ['expensa'], deuda: ['saldo', 'debo'], debo: ['saldo'], adeudo: ['saldo', 'debo'], boleta: ['cupon'], boleto: ['cupon'], factura: ['cupon', 'resumen'], liquidacion: ['resumen'],
    pagar: ['pago', 'pagos', 'inform'], pague: ['pago'], abonar: ['pago'], abone: ['pago'], transferi: ['transferencia', 'pago'], deposito: ['pago', 'comprobante'], comprobante: ['comprob', 'pago'], recibo: ['comprobante'],
    obra: ['obras'], albanil: ['obras', 'responsable'], contratista: ['obras', 'responsable'], constructor: ['obras', 'responsable'], arquitecto: ['obras', 'responsable'], construccion: ['obras'], plano: ['documentacion', 'obras'], planos: ['documentacion', 'obras'], seguro: ['seguro', 'art'],
    empleada: ['trabajador'], empleado: ['trabajador'], domestica: ['trabajador'], jardinero: ['trabajador'], plomero: ['trabajador'],
    electricista: ['trabajador'], pintor: ['trabajador'], ninera: ['trabajador'], mucama: ['trabajador'], amigo: ['visita', 'invitar'], amiga: ['visita', 'invitar'], amigos: ['visita', 'invitar'],
    pasar: ['ingreso', 'autorizacion'], semana: ['dias'], finde: ['dias'], gente: ['visita', 'personas'],
    toma: ['sacate', 'foto'], tomar: ['sacate', 'foto'], saca: ['sacate', 'foto'],
    llegando: ['llegan'], llego: ['llegando'], notificacion: ['notifi', 'push'], aviso: ['notifi'],
    wifi: ['conexion', 'internet'], senal: ['conexion'], offline: ['conexion'], conexion: ['conexion', 'internet'],
    votar: ['encuesta', 'vot'], votacion: ['encuesta'],
    ingresar: ['entrar', 'sesion'], ingreso: ['entrar'], iniciar: ['entrar', 'sesion'], logueo: ['sesion', 'entrar'], loguea: ['sesion', 'entrar'],
    proveedor: ['trabajador'], proveedores: ['trabajador'], cuenta: ['usuario'], face: ['selfie', 'face'],
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
  const CONTEXT_ST = new Set([...CONTEXT].map(stem));

  const syn = (x) => (SYN[x] || SYN[stem(x)] || []).map((y) => stem(y));
  const related = (x, hit) => hit.has(stem(x)) || syn(x).some((y) => hit.has(y)) || [...hit].some((h) => h.length >= 4 && (h.startsWith(stem(x)) || stem(x).startsWith(h)));

  /* ── tolerancia a errores de tipeo ──
   * Clave fonética del español rioplatense: ll=y, b=v, c(e/i)=s=z, qu=k, h muda, n antes de b/p = m.
   * Después, distancia de edición (con transposición) sobre esas claves; n↔m e i↔y cuestan medio. */
  const phon = (w) => w.replace(/ch/g, '#').replace(/ll/g, 'y').replace(/qu/g, 'k').replace(/c(?=[ei])/g, 's').replace(/c/g, 'k')
    .replace(/z/g, 's').replace(/v/g, 'b').replace(/h/g, '').replace(/#/g, 'ch').replace(/n(?=[bp])/g, 'm').replace(/gu(?=[ei])/g, 'g').replace(/y$/, 'i');
  const CHEAP = new Set(['nm', 'mn', 'iy', 'yi']);
  function editDist(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return Infinity;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      let rowMin = Infinity;
      for (let j = 1; j <= b.length; j++) {
        const sub = a[i - 1] === b[j - 1] ? 0 : CHEAP.has(a[i - 1] + b[j - 1]) ? 0.5 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + sub);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        rowMin = Math.min(rowMin, d[i][j]);
      }
      if (rowMin > max) return Infinity;
    }
    return d[a.length][b.length];
  }
  // ¿la palabra ya existe en el vocabulario (por raíz, prefijo o sinónimo)?
  const known = (x) => {
    const st = stem(x);
    return K.cdf.has(st) || K.df.has(st) || !!(SYN[x] || SYN[st]) || (st.length >= 4 && K.prefix(st).length > 0);
  };
  /** Corrige una palabra desconocida a la más parecida del vocabulario. Hasta 4 letras sólo equivalencias
   *  fonéticas exactas (yega→llega); 5-7 letras, 1 cambio; 8 o más, 2. Misma inicial (fonética). Si no hay, queda igual. */
  function fixWord(x) {
    if (!K.dict || /\d/.test(x) || x.length < 4 || known(x)) return x;
    if (K.fixCache.has(x)) return K.fixCache.get(x);
    const k = phon(x), max = x.length <= 4 ? 0 : x.length <= 7 ? 1 : 2;
    let best = null, bd = Infinity;
    for (const e of K.dict) {
      if (e.k[0] !== k[0]) continue;
      const dd = editDist(k, e.k, max);
      if (dd > max) continue;
      if (dd < bd || (dd === bd && e.n > best.n)) { best = e; bd = dd; }
    }
    const out = best ? best.w : x;
    K.fixCache.set(x, out);
    return out;
  }

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
        const card = { ...c, ask: JSON.parse(c.ask), steps: body.steps || [], tips: body.tips || [], video: body.video || null };
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
      // vocabulario de palabras enteras (manuales + fichas + sinónimos) para corregir errores de tipeo
      const wc = new Map();
      const addW = (s) => words(s).forEach((x) => { if (x.length >= 4 && !STOP.has(x) && !VAGUE.has(x) && !CONTEXT.has(x) && !/\d/.test(x)) wc.set(x, (wc.get(x) || 0) + 1); });
      K.chunks.forEach((c) => addW(c.text));
      K.cards.forEach((c) => { c.ask.forEach(addW); addW(c.title); c.steps.concat(c.tips).forEach((s) => addW(s.say)); });
      Object.keys(SYN).forEach(addW);
      K.dict = [...wc].map(([w, n]) => ({ w, n, k: phon(w) }));
      K.fixCache = new Map();
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
    let fq = fold(q);
    PHRASES.forEach(([re, to]) => { fq = fq.replace(re, to); });
    const w = words(fq).filter((x) => x.length > 1 && !STOP.has(x));
    const fixes = [];
    const content = w.filter((x) => !VAGUE.has(x) && !CONTEXT.has(x)).map((x) => {
      const y = fixWord(x);
      if (y !== x) fixes.push([x, y]);
      return y;
    }).filter((x) => !STOP.has(x) && !VAGUE.has(x));
    const context = w.filter((x) => CONTEXT.has(x));
    const terms = new Set(content.map(stem));
    const groups = new Map();
    const pre = (t) => (K.prefix && t.length >= 4 ? K.prefix(t) : []);
    const addGroup = (x, ctx) => {
      const st = stem(x);
      if (groups.has(st)) return;
      const vs = new Map([[st, 1]]);
      pre(st).forEach((v) => vs.set(v, 1));
      syn(x).forEach((y) => { if (!vs.has(y)) vs.set(y, 0.6); pre(y).forEach((v) => { if (!vs.has(v)) vs.set(v, 0.6); }); });
      groups.set(st, { x, st, vs, ctx });
    };
    content.forEach((x) => addGroup(x, false));
    context.forEach((x) => addGroup(x, true));
    const expanded = new Set();
    groups.forEach((g) => g.vs.forEach((_, v) => expanded.add(v)));
    return { raw: q, content, context, fixes, terms: [...terms], expanded: [...expanded], groups: [...groups.values()] };
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
        // una palabra rara que NO está (ej. "contraseña") pesa mucho; las de contexto ("iphone", "app") no cuentan
        const wc = g.ctx ? 0 : idf * (ACTION.has(g.x) ? 0.25 : 1);
        tot += wc;
        if (!f) return;
        got += wc;
        s += (g.ctx ? 0.5 : 1) * idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * it.len / avg));
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
  const GUARDIA_RE = /guardia|operador|garita|web de guardia|lector|servidor|nube|excedid|migrar|egreso|salida|barrera|cámara|camara|webcam|display|tele|tv|monitor|pc|computadora de/i;
  function searchCards(A, opts = {}) {
    const items = opts.module ? K.cards.filter((c) => c.module === opts.module) : K.cards;
    const qs = new Set(A.content.map(stem)), qc = new Set(A.context.map(stem));
    return bm25(items, A, K.cavg).map(({ it: c, s, coverage }) => {
      const modT = tokens(c.module);
      if (modT.length && modT.every((t) => A.expanded.includes(t))) s *= 1.3;
      // la consulta se parece a una de las formas de preguntar de la ficha: suma (no cambia la cobertura)
      s *= 1 + 0.5 * askMatch(c, qs, qc);
      // fichas de la guardia: un poco menos de peso salvo que la consulta hable de la guardia (el chat es sobre todo de residentes)
      if (/^Guardia/.test(c.module) && !GUARDIA_RE.test(A.raw || '')) s *= 0.8;
      return { card: c, score: s * (0.6 + 0.4 * coverage), coverage };
    }).sort((x, y) => y.score - x.score);
  }

  /** Parecido (Jaccard por raíces) entre la consulta y la mejor de las formas de preguntar de la ficha.
   *  Las palabras de contexto sólo cuentan si están en las dos. */
  function askMatch(card, qs, qc) {
    if (!qs.size) return 0;
    if (!card.askSets) card.askSets = card.ask.map((a) => new Set(words(a).filter((x) => x.length > 1 && !STOP.has(x) && !VAGUE.has(x)).map(stem)));
    let best = 0;
    for (const as of card.askSets) {
      let inter = 0, uni = qs.size;
      as.forEach((t) => {
        if (qs.has(t)) inter++;
        else if (qc.has(t)) { inter++; uni++; }
        else if (!CONTEXT_ST.has(t)) uni++;
      });
      best = Math.max(best, inter / (uni || 1));
    }
    return best;
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
    const ch = search(A, { module: ctx.module }).filter((h) => !isAdmin(h) && h.chunk.image && h.coverage >= 0.85 && h.score >= 8);
    if (ch.length) return { type: 'page', A, hit: ch[0] };
    return { type: 'none', A };
  }
  const cardsOf = (module) => K.cards.filter((c) => c.module === module);
  const cardModules = () => [...new Set(K.cards.map((c) => c.module))].sort((a, b) => a.localeCompare(b, 'es'));

  window.SILA_KB = { load, analyze, search, searchCards, decide, decideChunks, cardsOf, cardModules, excerpt, similarity, baseTitle, tokens, fold, stem, get K() { return K; }, ROOT };
})();
