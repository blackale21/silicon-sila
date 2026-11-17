/* Central SILA · datos, motor de SLA y puente con el chat de residentes.
 * Fuente de verdad: el backend de Apps Script (SILA_CONFIG.ayuda.backendUrl). Sin datos de ejemplo:
 * barrios, lotes, tickets y encuestas salen de los casos que entran por el chat.
 *   casos_listar / caso_actualizar   casos del chat (de la central sólo se escriben monday_ticket, estado y resultado)
 *   kv_get / kv_set                  estado compartido de la central, con versión: dos PCs ven lo mismo
 * Los envíos (WhatsApp, email, reseña) siguen SIMULADOS.
 */
(function () {
  const H = 3600e3, D = 24 * H;
  const CLAVE_LS = 'sila_central_clave';
  const KEYS = { tickets: 'sila_central_tickets', enc: 'sila_central_encuestas', cfg: 'sila_central_config', equipo: 'sila_central_equipo', barrios: 'sila_central_barrios', alertas: 'sila_central_alertas' };
  const VACIO = { tickets: { seq: 10000, list: [] }, enc: { list: [] }, cfg: { cats: [], umbral: 75 }, equipo: { list: [] }, barrios: { list: [] }, alertas: { list: [] } };
  const SIN_BARRIO = { id: 'sin-barrio', nombre: 'Barrio no informado', loc: '' };
  const ROL_TXT = { direccion: 'Dirección', operador: 'Operador', tecnico: 'Técnico de campo' };
  const DIR = { id: 'dir', rol: 'direccion', nombre: 'Dirección', barrios: '*' };
  // Los dos plazos que fija SiliconAccess_2. No se cargan solos: Dirección decide.
  const CATS_DOC = [
    { id: 'barrera', nombre: 'Barrera caída', h: 2, claves: 'barrera, brazo, porton, molinete' },
    { id: 'datos', nombre: 'Cambio de datos', h: 24, claves: 'cambio de datos, cambiar mi telefono, cambiar el celular, cambiar el correo, actualizar mis datos, domicilio' },
  ];

  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const url = () => ((window.SILA_CONFIG && window.SILA_CONFIG.ayuda) || {}).backendUrl || '';
  const chG = 'BroadcastChannel' in window ? new BroadcastChannel('sila-gestion') : null;
  const chBot = 'BroadcastChannel' in window ? new BroadcastChannel('sila-demo') : null;

  /* ── red ── */
  let clave = (() => { try { return localStorage.getItem(CLAVE_LS) || ''; } catch (_) { return ''; } })();
  const net = { ok: null, t: 0, err: '' };
  const hooks = { change: () => {}, salir: () => {}, nuevos: () => {}, red: () => {} };
  const fallo = (code) => Object.assign(new Error(code), { code });
  async function call(body, login) {
    let j;
    try {
      const r = await fetch(url(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
      j = await r.json();
    } catch (e) { net.ok = false; net.err = 'red'; hooks.red(); throw fallo('red'); }
    if (!j || typeof j !== 'object') { net.ok = false; net.err = 'respuesta'; hooks.red(); throw fallo('respuesta'); }
    net.ok = true; net.t = Date.now(); net.err = ''; hooks.red();
    if (j.ok === false && (j.error === 'clave' || j.error === 'bloqueado') && body.clave && !login) { salir(j.error); throw fallo(j.error); }
    return j;
  }
  const estado = () => call({ action: 'central_estado' }, true);
  const crearClave = (c) => call({ action: 'central_crear_clave', clave: c }, true);
  /** Prueba una clave contra el backend. → {ok} | {ok:false, error:'clave'|'bloqueado'} */
  const probarClave = (c) => call({ action: 'kv_get', clave: c, keys: [KEYS.cfg] }, true);
  function guardarClave(c) { clave = c; try { localStorage.setItem(CLAVE_LS, c); } catch (_) { /* navegación privada */ } }
  function salir(motivo) {
    if (motivo !== 'bloqueado') { try { localStorage.removeItem(CLAVE_LS); } catch (_) { /* */ } }
    clave = '';
    parar();
    reset();
    hooks.salir(motivo || '');
  }

  /* ── estado compartido: copia remota + operaciones pendientes, que se re-aplican si otra PC escribió antes ── */
  const docs = {};
  const casos = new Map();
  let desde = null, listo = false, ocupado = false;
  function reset() {
    Object.keys(KEYS).forEach((k) => { if (docs[k]) clearTimeout(docs[k].timer); docs[k] = { remoto: null, version: 0, local: clone(VACIO[k]), ops: [], vuelo: null, timer: null }; });
    casos.clear(); desde = null; listo = false;
  }
  function base(k) {
    const v = clone(docs[k].remoto) || clone(VACIO[k]);
    Object.keys(VACIO[k]).forEach((p) => { if (v[p] == null) v[p] = clone(VACIO[k][p]); });
    return v;
  }
  function rehacer(k) { const d = docs[k]; const v = base(k); (d.vuelo || []).concat(d.ops).forEach((f) => f(v)); d.local = v; }

  /** Cambia un documento compartido. fn recibe el documento y no debe guardar objetos de afuera sin clonarlos. */
  function mut(k, fn) {
    const d = docs[k];
    fn(d.local);
    d.ops.push(fn);
    clearTimeout(d.timer);
    d.timer = setTimeout(() => flush(k), 900);
  }
  async function flush(k) {
    const d = docs[k];
    if (d.vuelo || !d.ops.length || !clave) return;
    d.vuelo = d.ops; d.ops = [];
    const v = base(k);
    d.vuelo.forEach((f) => f(v));
    let j;
    try { j = await call({ action: 'kv_set', clave, key: KEYS[k], valor: v, version: d.version }); }
    catch (e) { if (docs[k] === d && clave) { d.ops = d.vuelo.concat(d.ops); d.vuelo = null; d.timer = setTimeout(() => flush(k), 4000); } return; }
    if (docs[k] !== d) return; // se cerró la sesión mientras tanto
    const ops = d.vuelo; d.vuelo = null;
    if (j.ok) {
      d.remoto = v; d.version = j.version;
      rehacer(k);
      chG && chG.postMessage({ type: 'kv' });
      if (k === 'tickets') anotarMonday();
    } else if (j.error === 'conflicto' && j.actual) {
      d.remoto = j.actual.valor; d.version = j.actual.version;
      d.ops = ops.concat(d.ops);
      rehacer(k);
      hooks.change('kv');
    } else {
      d.ops = ops.concat(d.ops);
      d.timer = setTimeout(() => flush(k), 4000);
      return;
    }
    if (d.ops.length) flush(k);
  }
  async function leerKV() {
    const j = await call({ action: 'kv_get', clave, keys: Object.values(KEYS) });
    if (!j.ok) throw fallo(j.error || 'kv');
    let cambio = false;
    Object.entries(KEYS).forEach(([k, key]) => {
      const r = (j.valores || {})[key];
      const d = docs[k];
      if (!r || d.vuelo || r.version === d.version) return;
      d.remoto = r.valor; d.version = r.version; rehacer(k); cambio = true;
    });
    return cambio;
  }
  const pendientes = () => Object.values(docs).reduce((a, d) => a + d.ops.length + (d.vuelo ? d.vuelo.length : 0), 0);

  /* ── casos del chat ── */
  async function leerCasos() {
    const j = await call(desde ? { action: 'casos_listar', clave, desde } : { action: 'casos_listar', clave });
    if (!j.ok) throw fallo(j.error || 'casos');
    (j.casos || []).forEach((c) => c && c.caso_id && casos.set(c.caso_id, c));
    if (j.ahora) desde = j.ahora;
    return (j.casos || []).length;
  }
  /** Un ciclo: casos nuevos + estado compartido → tickets. */
  async function refrescar() {
    if (ocupado || !clave) return null;
    ocupado = true;
    try {
      const n = await leerCasos();
      const cambio = await leerKV();
      const primero = !listo;
      listo = true;
      const nuevos = procesarCasos();
      anotarMonday();
      if (primero || n || cambio || nuevos.length) hooks.change('remoto');
      if (nuevos.length && !primero) hooks.nuevos(nuevos);
      return nuevos;
    } catch (e) { hooks.red(); return null; }
    finally { ocupado = false; }
  }

  /* ── accesos ── */
  const S = {
    get tickets() { return docs.tickets.local.list; },
    get enc() { return docs.enc.local.list; },
    get cfg() { return docs.cfg.local; },
    get equipo() { return docs.equipo.local.list; },
    get barrios() { return docs.barrios.local.list; },
    get alertas() { return docs.alertas.local.list; },
    get casos() { return [...casos.values()]; },
  };
  const now = () => Date.now();
  const iso = (ms) => new Date(ms == null ? now() : ms).toISOString();
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const slug = (s) => norm(s).replace(/^(barrio|country|club de campo|cc) /, '').replace(/ /g, '-').slice(0, 40);
  const titulo = (s) => String(s || '').trim().replace(/\s+/g, ' ').replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).slice(0, 60);
  const barrio = (id) => S.barrios.find((b) => b.id === id) || (id === SIN_BARRIO.id || !id ? SIN_BARRIO : { ...SIN_BARRIO, id, nombre: id });
  const PERSONAS = () => [DIR, ...S.equipo];
  const persona = (id) => PERSONAS().find((p) => p.id === id);
  const cats = () => S.cfg.cats || [];
  const SIN_CAT = { id: '', nombre: 'Sin categoría', h: 0, claves: '' };
  const cat = (id) => cats().find((c) => c.id === id) || SIN_CAT;
  const umbral = () => S.cfg.umbral || 75;
  const loteKey = (t) => t.barrio + '|' + norm(t.lote).replace(/^lote /, '').replace(/^0+(?=\d)/, '');

  /* ── motor de SLA ── */
  function sla(t) {
    const c = cat(t.cat);
    const start = +new Date(t.creado);
    const end = t.cerrado ? +new Date(t.cerrado) : now();
    const el = Math.max(0, end - start);
    if (!c.h) return { pct: 0, st: 'sin', rest: 0, limite: null, aviso: null, tot: 0, h: 0, el };
    const tot = c.h * H;
    const pct = el / tot;
    let st;
    if (t.estado === 'cerrado') st = el <= tot ? 'cumplido' : 'incumplido';
    else st = pct >= 1 ? 'vencido' : pct >= umbral() / 100 ? 'riesgo' : 'ok';
    return { pct, st, rest: start + tot - end, limite: start + tot, aviso: start + tot * (umbral() / 100), tot, h: c.h, el };
  }
  function evento(t, txt, quien) { (t.eventos = t.eventos || []).push({ t: iso(), txt, quien: quien || 'Sistema' }); }
  // id fijo por hecho: si dos PCs detectan la misma alerta, queda una sola
  function alerta(tipo, ref, txt, id) {
    const a = { id, t: iso(), tipo, ticket: ref ? ref.id : null, barrio: ref ? ref.barrio : null, txt, leida: false };
    mut('alertas', (d) => {
      if (d.list.some((x) => x.id === id)) return;
      d.list.unshift(clone(a));
      d.list = d.list.slice(0, 150);
    });
  }
  function tk(id, fn) { mut('tickets', (d) => { const t = d.list.find((x) => x.id === id); if (t) fn(t, d); }); }
  function en(id, fn) { mut('enc', (d) => { const e = d.list.find((x) => x.id === id); if (e) fn(e, d); }); }

  /** Revisa los tickets abiertos y dispara la alerta del umbral y la de vencido. Devuelve las nuevas. */
  function revisarSLA() {
    if (!listo) return [];
    const nuevas = [];
    S.tickets.forEach((t) => {
      if (t.estado === 'cerrado' || !t.cat) return;
      const s = sla(t);
      if (s.st === 'sin') return;
      const a = t.alertas || {};
      if (s.pct >= umbral() / 100 && !a.a75) nuevas.push({ tipo: 'a75', t, txt: `${t.id} llegó al ${umbral()} % del SLA (${s.h} h) · aviso al operador de turno y al supervisor` });
      if (s.pct >= 1 && !a.a100) nuevas.push({ tipo: 'a100', t, txt: `${t.id} venció su SLA de ${s.h} h · escalado a Dirección` });
    });
    const u = umbral();
    nuevas.forEach((n) => {
      tk(n.t.id, (t) => {
        t.alertas = t.alertas || {};
        if (t.alertas[n.tipo]) return;
        t.alertas[n.tipo] = iso();
        evento(t, n.tipo === 'a75' ? `Alerta automática ${u} % del SLA · aviso SIMULADO al operador y al supervisor` : 'SLA vencido · escalado a Dirección (SIMULADO)', 'Motor SLA');
      });
      alerta(n.tipo, n.t, n.txt, `${n.tipo}:${n.t.id}:${n.t.cat}`);
    });
    return nuevas;
  }

  /* ── del chat a la central ── */
  function categorizar(c) {
    const txt = ' ' + norm([c.consulta, c.aclaraciones, c.modulo].join(' ')) + ' ';
    const hit = cats().find((k) => String(k.claves || '').split(',').map(norm).filter(Boolean).some((w) => txt.includes(' ' + w)));
    return hit ? hit.id : '';
  }
  function idBarrio(txt) {
    const s = slug(txt);
    if (!s) return SIN_BARRIO.id;
    const b = S.barrios.find((x) => x.id === s || (x.alias || []).includes(s));
    return b ? b.id : s;
  }
  const ctxDe = (c) => ({ consulta: c.consulta || '', aclaraciones: c.aclaraciones || '', modulo: c.modulo || '', fuentes: c.fuentes_citadas || '',
    pasos: c.pasos_intentados || '', resultado: c.resultado || '', estado_bot: c.estado || '', creado_bot: c.creado || '', eventos: c.eventos || [], origen: c.origen || '' });
  const resueltoPorBot = (c) => c.derivado_central !== 'sí' && norm(c.estado) === 'resuelto';

  /** Registra barrios nuevos, crea tickets de casos derivados y encuestas de lo que resolvió el bot. */
  function procesarCasos() {
    const lista = S.casos.sort((a, b) => ((a.creado || '') < (b.creado || '') ? -1 : 1));
    const nuevosB = [];
    lista.forEach((c) => {
      const id = idBarrio(c.barrio);
      if (id !== SIN_BARRIO.id && !S.barrios.some((b) => b.id === id) && !nuevosB.some((b) => b.id === id)) nuevosB.push({ id, nombre: titulo(c.barrio), loc: '', alias: [], google: null, alta: iso() });
    });
    if (nuevosB.length) mut('barrios', (d) => nuevosB.forEach((b) => { if (!d.list.some((x) => x.id === b.id || (x.alias || []).includes(b.id))) d.list.push(clone(b)); }));

    const creados = [];
    lista.filter((c) => c.derivado_central === 'sí').forEach((c) => {
      const t = S.tickets.find((x) => x.caso_id === c.caso_id);
      const ctx = ctxDe(c);
      if (!t) {
        const b = idBarrio(c.barrio);
        const k = categorizar(c);
        const desdeChat = c.actualizado || c.creado || iso();
        mut('tickets', (d) => {
          if (d.list.some((x) => x.caso_id === c.caso_id)) return;
          d.seq = (d.seq || 10000) + 1;
          const nt = {
            id: 'TK-' + d.seq, caso_id: c.caso_id, barrio: b, barrio_txt: c.barrio || '', lote: String(c.lote || '').trim(), cat: k,
            titulo: String(c.consulta || 'Caso derivado por el chat').slice(0, 90), origen: 'bot',
            reporta: { nombre: c.residente || 'Residente sin nombre', rol: 'Residente', cel: c.celular || '', correo: c.correo || '' },
            creado: desdeChat, estado: 'nuevo', asignado: null, cerrado: null, resuelto_por: null, alertas: {}, eventos: [], ctx: clone(ctx),
          };
          evento(nt, `Ticket creado desde el chat (${c.caso_id}) con consulta, pasos intentados y fuentes · sin volver a pedirle datos al residente`, 'Bot SILA');
          if (b === SIN_BARRIO.id) evento(nt, 'El residente no informó el barrio · queda para Dirección', 'Sistema');
          if (!k) evento(nt, 'Ninguna categoría coincide: el semáforo se activa cuando se categoriza', 'Motor SLA');
          const madre = nt.lote && nt.cat && d.list.find((x) => x.estado !== 'cerrado' && !x.vinculado && x.cat === nt.cat && loteKey(x) === loteKey(nt));
          if (madre) {
            nt.vinculado = madre.id;
            evento(nt, `Vinculado a ${madre.id}: mismo lote y categoría`, 'Consolidación');
            evento(madre, `Nuevo reporte sobre el mismo lote: ${nt.id} (${nt.reporta.nombre})`, 'Consolidación');
          }
          d.list.unshift(nt);
        });
        const nt = S.tickets.find((x) => x.caso_id === c.caso_id);
        if (nt) { creados.push(nt); alerta('nuevo', nt, `Nuevo ticket ${nt.id} desde el chat · ${barrio(nt.barrio).nombre}${nt.lote ? ' · Lote ' + nt.lote : ''}`, 'nuevo:' + c.caso_id); }
      } else if (JSON.stringify(t.ctx) !== JSON.stringify(ctx)) {
        const antes = t.ctx && t.ctx.estado_bot;
        tk(t.id, (x) => {
          if (JSON.stringify(x.ctx) === JSON.stringify(ctx)) return;
          if (antes !== ctx.estado_bot) evento(x, `El caso ${c.caso_id} cambió en el chat: ${ctx.estado_bot || '—'}`, 'Bot SILA');
          x.ctx = clone(ctx);
        });
      }
    });
    // tickets sin categoría: si Dirección cargó una que coincide, se categorizan solos
    S.tickets.filter((t) => !t.cat && t.estado !== 'cerrado' && t.ctx).forEach((t) => {
      const k = categorizar(t.ctx);
      if (k) { const c = cat(k); tk(t.id, (x) => { if (x.cat) return; x.cat = k; evento(x, `Categorizado automáticamente: ${c.nombre} (${c.h} h)`, 'Motor SLA'); }); }
    });
    // lo que resolvió el bot sin pasar por la central: encuesta por WhatsApp en el mismo chat (simulada)
    lista.filter(resueltoPorBot).forEach((c) => {
      const id = 'EN-' + c.caso_id;
      if (S.enc.some((e) => e.id === id)) return;
      const e = {
        id, ticket: null, caso_id: c.caso_id, barrio: idBarrio(c.barrio), lote: String(c.lote || '').trim(), nombre: c.residente || 'Residente del chat',
        canal: 'whatsapp', para: c.celular || 'mismo chat', motivo: '', resuelto_por: 'bot', consulta: String(c.consulta || '').slice(0, 90),
        enviado: c.actualizado || c.creado || iso(), estado: 'enviada', nps: null, csat: null, comentario: '', resp_t: null, resena: null, recup: null,
      };
      mut('enc', (d) => { if (!d.list.some((x) => x.id === id)) d.list.unshift(clone(e)); });
    });
    return creados;
  }

  // al caso del chat la central sólo le escribe el id del ticket (y el cierre)
  const anotando = new Set();
  function anotarMonday() {
    if (!listo) return;
    const remotos = (docs.tickets.remoto && docs.tickets.remoto.list) || [];
    remotos.forEach((t) => {
      const c = t.caso_id && casos.get(t.caso_id);
      if (!c || c.monday_ticket === t.id || anotando.has(c.caso_id)) return;
      anotando.add(c.caso_id);
      actualizarCaso(c.caso_id, { monday_ticket: t.id }).finally(() => anotando.delete(c.caso_id));
    });
  }
  async function actualizarCaso(caso_id, campos) {
    try {
      const j = await call({ action: 'caso_actualizar', clave, caso_id, campos });
      if (j.ok) {
        const c = casos.get(caso_id);
        if (c) Object.assign(c, campos);
        chBot && chBot.postMessage({ type: 'caso', id: caso_id });
      }
      return !!j.ok;
    } catch (_) { return false; }
  }

  /* ── encuestas (capa 3), simuladas ── */
  const CLASE = (nps) => (nps == null ? null : nps >= 9 ? 'promotor' : nps >= 7 ? 'pasivo' : 'detractor');
  function encuestaDe(t, rp) {
    const porBot = rp === 'bot';
    const canal = porBot || !t.reporta.correo ? 'whatsapp' : 'email';
    return {
      id: 'EN-' + t.id.slice(3), ticket: t.id, caso_id: t.caso_id || null, barrio: t.barrio, lote: t.lote, nombre: t.reporta.nombre, canal, resuelto_por: rp, consulta: t.titulo,
      para: canal === 'email' ? t.reporta.correo : (t.reporta.cel || 'mismo chat de WhatsApp'), motivo: canal === 'whatsapp' && !porBot ? 'sin correo registrado' : '',
      enviado: iso(), estado: 'enviada', nps: null, csat: null, comentario: '', resp_t: null, resena: null, recup: null,
    };
  }
  /** Cierra un ticket y sus vinculados, envía la encuesta (simulada) y marca el caso del chat como resuelto. */
  function cerrar(id, rp, nota, quien) {
    const t0 = S.tickets.find((x) => x.id === id);
    if (!t0 || t0.estado === 'cerrado') return null;
    const ids = [id, ...S.tickets.filter((x) => x.vinculado === id && x.estado !== 'cerrado').map((x) => x.id)];
    const cuando = iso();
    const encs = ids.map((tid) => encuestaDe(S.tickets.find((x) => x.id === tid), rp));
    mut('tickets', (d) => {
      ids.forEach((tid, i) => {
        const t = d.list.find((x) => x.id === tid);
        if (!t || t.estado === 'cerrado') return;
        t.estado = 'cerrado'; t.cerrado = cuando; t.resuelto_por = rp; t.encuesta = 'EN-' + t.id.slice(3);
        const s = sla(t);
        evento(t, i === 0 ? `Cerrado · resolvió ${rp === 'bot' ? 'el bot SILA' : quien} · SLA ${s.st === 'cumplido' ? 'cumplido' : s.st === 'sin' ? 'sin categoría' : 'incumplido'}${nota ? ' · ' + nota : ''}` : `Cerrado junto con ${id} (mismo lote y categoría)`, i === 0 ? quien : 'Consolidación');
        evento(t, `Encuesta CSAT/NPS por ${encs[i].canal === 'email' ? 'email formal' : 'WhatsApp'} a ${encs[i].para} · SIMULADO, no salió nada`, 'Experiencia');
      });
    });
    mut('enc', (d) => encs.forEach((e) => { d.list = d.list.filter((x) => x.id !== e.id); d.list.unshift(clone(e)); }));
    ids.forEach((tid) => {
      const t = S.tickets.find((x) => x.id === tid);
      if (t && t.caso_id) actualizarCaso(t.caso_id, { estado: 'resuelto', resultado: `Resuelto por la central · ${t.id}${rp === 'bot' ? ' (lo resolvió el bot)' : ''}${nota ? ' · ' + nota : ''}`.slice(0, 300) });
    });
    return S.enc.find((e) => e.id === encs[0].id);
  }
  function responder(eid, nps, csat, comentario) {
    const e0 = S.enc.find((x) => x.id === eid);
    if (!e0) return null;
    const cl = CLASE(nps);
    const lim = iso(now() + D);
    en(eid, (e) => {
      Object.assign(e, { nps, csat, comentario: comentario || '', estado: 'respondida', resp_t: iso() });
      if (cl === 'detractor') e.recup = { estado: 'abierta', pasos: [false, false, false, false], t: iso(), limite: lim };
      if (cl === 'promotor' && !e.resena) e.resena = { estado: 'pendiente', t: null };
    });
    if (e0.ticket) tk(e0.ticket, (t) => evento(t, `Encuesta respondida (simulado): NPS ${nps} · CSAT ${csat}/5 · ${cl}`, 'Experiencia'));
    if (cl === 'detractor') alerta('detractor', { id: e0.ticket, barrio: e0.barrio }, `Detractor en ${barrio(e0.barrio).nombre}: ${e0.nombre} (NPS ${nps}) · protocolo de recuperación abierto, llamar antes de 24 h`, 'detractor:' + eid);
    return cl;
  }
  function pedirResena(eid) {
    const e0 = S.enc.find((x) => x.id === eid);
    if (!e0) return;
    en(eid, (e) => { e.resena = { estado: 'pedida', t: iso(), canal: e.canal }; });
    if (e0.ticket) tk(e0.ticket, (t) => evento(t, `Pedido de reseña de Google por ${e0.canal === 'email' ? 'email' : 'WhatsApp'} · SIMULADO`, 'Experiencia'));
  }

  /* ── ciclo ── */
  let timer = null;
  function arrancar() { parar(); refrescar(); timer = setInterval(refrescar, 9000); }
  function parar() { clearInterval(timer); timer = null; }
  function on(h) { Object.assign(hooks, h); }
  chG && chG.addEventListener('message', (e) => { if (e.data && e.data.type === 'kv') setTimeout(refrescar, 250); });
  // el chat avisa en vivo cuando hay un caso nuevo: sólo sirve para refrescar antes
  chBot && chBot.addEventListener('message', (e) => { if (e.data && e.data.type === 'caso') setTimeout(refrescar, 800); });
  addEventListener('online', () => refrescar());
  reset();

  window.G = {
    H, D, S, KEYS, SIN_BARRIO, SIN_CAT, ROL_TXT, DIR, CATS_DOC, CLASE, net,
    url, clave: () => clave, estado, crearClave, probarClave, guardarClave, salir, arrancar, parar, refrescar, on, listo: () => listo, pendientes,
    mut, tk, en, now, iso, sla, revisarSLA, barrio, persona, PERSONAS, cats, cat, umbral, loteKey, norm, slug, titulo, evento, alerta,
    categorizar, cerrar, responder, pedirResena, actualizarCaso,
  };
})();
