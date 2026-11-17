/* Central SILA · datos, motor de SLA y puente con el chat de residentes.
 * Fuente de verdad: el backend de Apps Script (SILA_CONFIG.ayuda.backendUrl). Sin datos de ejemplo.
 * Usuarios reales: login con usuario y clave → token (6 h sin uso, se renueva en cada llamada). El rol y los barrios los da el servidor.
 *   sila_central_cfg                    categorías, umbral, barrios {id, nombre, alias, google} y directorio del equipo (lo escribe Dirección)
 *   sila_central_b_<barrio>_tickets     tickets del barrio      ┐ los leen y escriben Dirección
 *   sila_central_b_<barrio>_encuestas   encuestas del barrio    │ y quien tenga ese barrio asignado
 *   sila_central_b_<barrio>_alertas     alertas del barrio      ┘
 *   casos_listar / caso_actualizar      casos del chat (la central sólo escribe monday_ticket, estado y resultado)
 * Los envíos (WhatsApp, email, reseña) siguen SIMULADOS.
 */
(function () {
  const H = 3600e3, D = 24 * H;
  const LS_TOKEN = 'sila_central_token';
  const CFG = 'sila_central_cfg';
  const SUFS = ['tickets', 'encuestas', 'alertas'];
  const VACIO_CFG = { cats: [], umbral: 75, barrios: [], equipo: [] };
  const SIN = 'sinbarrio';
  const SIN_BARRIO = { id: SIN, nombre: 'Barrio no informado', loc: '', alias: [] };
  const ROL_TXT = { direccion: 'Dirección', operador: 'Operador', tecnico: 'Técnico de campo' };
  // Los dos plazos que fija SiliconAccess_2. No se cargan solos: Dirección decide.
  const CATS_DOC = [
    { id: 'barrera', nombre: 'Barrera caída', h: 2, claves: 'barrera, brazo, porton, molinete' },
    { id: 'datos', nombre: 'Cambio de datos', h: 24, claves: 'cambio de datos, cambiar mi telefono, cambiar el celular, cambiar el correo, actualizar mis datos, domicilio' },
  ];
  const VIEJAS = { tickets: 'sila_central_tickets', enc: 'sila_central_encuestas', cfg: 'sila_central_config', equipo: 'sila_central_equipo', barrios: 'sila_central_barrios', alertas: 'sila_central_alertas' };

  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const url = () => ((window.SILA_CONFIG && window.SILA_CONFIG.ayuda) || {}).backendUrl || '';
  const chG = 'BroadcastChannel' in window ? new BroadcastChannel('sila-gestion') : null;
  const chBot = 'BroadcastChannel' in window ? new BroadcastChannel('sila-demo') : null;
  const ls = { get: (k) => { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } }, set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (_) { /* privado */ } } };
  ls.set('sila_central_clave', ''); // versión anterior: la clave ya no se guarda

  /* ── red y sesión ── */
  let token = ls.get(LS_TOKEN);
  let yo = null;
  const net = { ok: null, t: 0, err: '' };
  const hooks = { change: () => {}, salir: () => {}, nuevos: () => {}, red: () => {}, aviso: () => {} };
  const fallo = (code) => Object.assign(new Error(code), { code });
  async function call(body, publico) {
    let j;
    try {
      const r = await fetch(url(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
      j = await r.json();
    } catch (e) { net.ok = false; net.err = 'red'; hooks.red(); throw fallo('red'); }
    if (!j || typeof j !== 'object') { net.ok = false; net.err = 'respuesta'; hooks.red(); throw fallo('respuesta'); }
    net.ok = true; net.t = Date.now(); net.err = ''; hooks.red();
    if (!publico && j.ok === false && j.error === 'sesion') { salir('sesion'); throw fallo('sesion'); }
    return j;
  }
  const conToken = (o) => call({ ...o, token });
  const estado = () => call({ action: 'central_estado' }, true);
  const crearClave = (c) => call({ action: 'central_crear_clave', clave: c }, true);
  async function login(usuario, clave) {
    const j = await call({ action: 'login', usuario: String(usuario || '').trim().toLowerCase(), clave }, true);
    if (j.ok && j.token) { token = j.token; yo = j.yo; ls.set(LS_TOKEN, token); }
    return j;
  }
  /** Retoma la sesión guardada. → true si el token sigue valiendo. */
  async function retomar() {
    if (!token) return false;
    const j = await call({ action: 'yo', token }, true);
    if (j.ok && j.yo) { yo = j.yo; return true; }
    if (j.error === 'sesion' || j.error === 'inactivo') { token = ''; ls.set(LS_TOKEN, ''); return false; }
    throw fallo(j.error || 'yo');
  }
  async function refrescarYo() {
    const j = await conToken({ action: 'yo' });
    if (j.ok && j.yo) { const antes = JSON.stringify(yo); yo = j.yo; return antes !== JSON.stringify(yo); }
    return false;
  }
  const cambiarClave = (actual, nueva) => conToken({ action: 'clave_cambiar', actual, nueva });
  async function salir(motivo) {
    const t = token;
    token = ''; yo = null; ls.set(LS_TOKEN, '');
    parar(); reset();
    if (motivo === 'fuera' && t) call({ action: 'logout', token: t }, true).catch(() => {});
    hooks.salir(motivo || '');
  }
  const esDir = () => !!yo && yo.rol === 'direccion';

  /* ── usuarios (sólo Dirección) ── */
  let usuarios = null;
  async function usuariosListar() {
    const j = await conToken({ action: 'usuarios_listar' });
    if (j.ok) { usuarios = j.usuarios || []; publicarEquipo(); }
    return j;
  }
  async function usuarioGuardar(u) {
    const j = await conToken({ action: 'usuario_guardar', ...u });
    if (j.ok) await usuariosListar();
    return j;
  }
  async function usuarioBaja(usuario) {
    const j = await conToken({ action: 'usuario_baja', usuario });
    if (j.ok) await usuariosListar();
    return j;
  }
  // los operadores no pueden listar usuarios: Dirección publica en la config un directorio sin claves (para asignar técnicos)
  function publicarEquipo() {
    if (!esDir() || !usuarios || !listo) return;
    const eq = usuarios.filter((u) => u.activo !== false && u.rol !== 'direccion').map((u) => ({ usuario: u.usuario, nombre: u.nombre, rol: u.rol, barrios: (u.barrios || []).slice() }))
      .sort((a, b) => (a.usuario < b.usuario ? -1 : 1));
    if (JSON.stringify(eq) !== JSON.stringify(S.cfg.equipo || [])) mut(CFG, (d) => { d.equipo = clone(eq); });
  }

  /* ── estado compartido: copia remota + operaciones pendientes, que se re-aplican si otra PC escribió antes ── */
  const docs = new Map();
  const casos = new Map();
  let desde = null, listo = false, ocupado = false, ciclo = 0, migrado = false;
  const vacio = (k) => (k === CFG ? clone(VACIO_CFG) : { list: [] });
  function doc(k) { if (!docs.has(k)) docs.set(k, { remoto: null, version: 0, local: vacio(k), ops: [], vuelo: null, timer: null, leido: false }); return docs.get(k); }
  function reset() {
    docs.forEach((d) => clearTimeout(d.timer));
    docs.clear(); casos.clear(); desde = null; listo = false; ciclo = 0; migrado = false; usuarios = null;
  }
  function base(k) {
    const v = clone(doc(k).remoto) || vacio(k);
    const V = vacio(k);
    Object.keys(V).forEach((p) => { if (v[p] == null) v[p] = V[p]; });
    return v;
  }
  function rehacer(k) { const d = doc(k); const v = base(k); (d.vuelo || []).concat(d.ops).forEach((f) => f(v)); d.local = v; }

  /** Cambia un documento compartido. fn recibe el documento y no debe guardar objetos de afuera sin clonarlos. */
  function mut(k, fn) {
    const d = doc(k);
    fn(d.local);
    d.ops.push(fn);
    clearTimeout(d.timer);
    d.timer = setTimeout(() => flush(k), 900);
  }
  async function flush(k) {
    const d = doc(k);
    if (d.vuelo || !d.ops.length || !token) return;
    d.vuelo = d.ops; d.ops = [];
    const v = base(k);
    d.vuelo.forEach((f) => f(v));
    let j;
    try { j = await conToken({ action: 'kv_set', key: k, valor: v, version: d.version }); }
    catch (e) { if (docs.get(k) === d && token) { d.ops = d.vuelo.concat(d.ops); d.vuelo = null; d.timer = setTimeout(() => flush(k), 4000); } return; }
    if (docs.get(k) !== d) return; // se cerró la sesión mientras tanto
    const ops = d.vuelo; d.vuelo = null;
    if (j.ok) {
      d.remoto = v; d.version = j.version; d.leido = true;
      rehacer(k);
      chG && chG.postMessage({ type: 'kv' });
      if (/_tickets$/.test(k)) anotarMonday();
    } else if (j.error === 'conflicto' && j.actual) {
      d.remoto = j.actual.valor; d.version = j.actual.version; d.leido = true;
      d.ops = ops.concat(d.ops);
      rehacer(k);
      hooks.change('kv');
    } else if (j.error === 'permiso') {
      // sin permiso para esa key: se descartan los cambios (no se van a poder guardar nunca)
      rehacer(k);
      hooks.aviso('permiso');
      hooks.change('kv');
      return;
    } else {
      d.ops = ops.concat(d.ops);
      d.timer = setTimeout(() => flush(k), 4000);
      return;
    }
    if (d.ops.length) flush(k);
  }
  async function leerKeys(keys) {
    if (!keys.length) return false;
    const j = await conToken({ action: 'kv_get', keys });
    if (!j.ok) throw fallo(j.error || 'kv');
    // el servidor lee sólo lo permitido y avisa el resto en `denegadas` (p. ej. Dirección le sacó un barrio)
    if ((j.denegadas || []).length) throw fallo('permiso');
    let cambio = false;
    keys.forEach((key) => {
      const r = (j.valores || {})[key];
      const d = doc(key);
      d.leido = true;
      if (!r || d.vuelo || r.version === d.version) return;
      d.remoto = r.valor; d.version = r.version; rehacer(key); cambio = true;
    });
    return cambio;
  }
  const bid = (txt) => norm(txt).replace(/^(barrio|country|club de campo|cc) /, '').replace(/[^a-z0-9]/g, '').slice(0, 28);
  const bkey = (b, s) => `sila_central_b_${b}_${s}`;
  /** Barrios cuyo estado carga esta sesión: Dirección todos (y los sin barrio); el resto, los suyos. */
  function barriosCarga() {
    if (!yo) return [];
    if (esDir()) return [...(S.cfg.barrios || []).map((b) => b.id), SIN];
    return (yo.barrios || []).slice();
  }
  const keysCarga = () => [CFG, ...barriosCarga().flatMap((b) => SUFS.map((s) => bkey(b, s)))];
  async function leerKV() {
    const k1 = keysCarga();
    let cambio = await leerKeys(k1);
    const k2 = keysCarga().filter((k) => !k1.includes(k)); // barrios nuevos que trajo la config
    if (k2.length) cambio = (await leerKeys(k2)) || cambio;
    return cambio;
  }
  const pendientes = () => [...docs.values()].reduce((a, d) => a + d.ops.length + (d.vuelo ? d.vuelo.length : 0), 0);

  /* ── migración única: claves de la versión anterior → config + claves por barrio (la hace Dirección) ── */
  async function migrar() {
    migrado = true;
    if (!esDir() || doc(CFG).remoto) return false;
    const j = await conToken({ action: 'kv_get', keys: Object.values(VIEJAS) });
    if (!j.ok) return false;
    const v = (k) => (j.valores && j.valores[VIEJAS[k]] && j.valores[VIEJAS[k]].valor) || null;
    const oc = v('cfg') || {}, ob = (v('barrios') || {}).list || [], ot = (v('tickets') || {}).list || [], oe = (v('enc') || {}).list || [], oa = (v('alertas') || {}).list || [];
    const mapa = {}; // id viejo (con guiones) → id nuevo
    const barrios = [];
    ob.forEach((b) => {
      const id = bid(b.nombre) || bid(String(b.id).replace(/-/g, ' '));
      mapa[b.id] = id;
      (b.alias || []).forEach((a) => { mapa[a] = id; });
      const alias = [...new Set([String(b.id).replace(/-/g, ' '), ...(b.alias || []).map((a) => String(a).replace(/-/g, ' '))])].filter((a) => norm(a) !== norm(b.nombre));
      const ex = barrios.find((x) => x.id === id);
      if (ex) ex.alias = [...new Set([...ex.alias, b.nombre, ...alias])];
      else barrios.push({ id, nombre: b.nombre, loc: b.loc || '', alias, google: b.google || null });
    });
    const nb = (old) => (old === 'sin-barrio' || !old ? SIN : mapa[old] || bid(String(old).replace(/-/g, ' ')) || SIN);
    mut(CFG, (d) => {
      d.cats = clone(oc.cats || []); d.umbral = oc.umbral || 75; d.barrios = clone(barrios); d.equipo = d.equipo || [];
      d.migrado = { t: iso(), tickets: ot.length, encuestas: oe.length };
    });
    const por = (l, f) => l.reduce((m, x) => { const k = nb(x.barrio); (m[k] = m[k] || []).push({ ...clone(x), barrio: k }); return m; }, {});
    [[por(ot), 'tickets'], [por(oe), 'encuestas'], [por(oa), 'alertas']].forEach(([m, s]) => Object.entries(m).forEach(([b, l]) => {
      mut(bkey(b, s), (d) => l.forEach((x) => { if (!d.list.some((y) => y.id === x.id)) d.list.push(clone(x)); }));
    }));
    return ot.length + oe.length > 0;
  }

  /* ── casos del chat ── */
  async function leerCasos() {
    const j = await conToken(desde ? { action: 'casos_listar', desde } : { action: 'casos_listar' });
    if (!j.ok) throw fallo(j.error || 'casos');
    (j.casos || []).forEach((c) => c && c.caso_id && casos.set(c.caso_id, c));
    if (j.ahora) desde = j.ahora;
    return (j.casos || []).length;
  }
  /** Un ciclo: sesión + casos nuevos + estado compartido → tickets. */
  async function refrescar() {
    if (ocupado || !token) return null;
    ocupado = true;
    try {
      let rol = false;
      if (listo && ++ciclo % 4 === 0) rol = await refrescarYo(); // barrios o rol cambiados por Dirección
      if (rol) { desde = null; casos.clear(); }
      const n = await leerCasos();
      let cambio = await leerKV();
      const primero = !listo;
      listo = true;
      if (!migrado) cambio = (await migrar()) || cambio;
      if (esDir() && !usuarios) usuariosListar().catch(() => {});
      const nuevos = procesarCasos();
      anotarMonday();
      if (primero || rol || n || cambio || nuevos.length) hooks.change('remoto');
      if (nuevos.length && !primero) hooks.nuevos(nuevos);
      return nuevos;
    } catch (e) {
      if (e.code === 'permiso') { try { if (await refrescarYo()) { desde = null; casos.clear(); hooks.change('remoto'); } } catch (_) { /* */ } }
      hooks.red(); return null;
    } finally { ocupado = false; }
  }

  /* ── accesos ── */
  const junta = (s) => barriosCarga().flatMap((b) => doc(bkey(b, s)).local.list);
  const S = {
    get tickets() { return junta('tickets'); },
    get enc() { return junta('encuestas').sort((a, b) => (a.enviado < b.enviado ? 1 : -1)); },
    get alertas() { return junta('alertas').sort((a, b) => (a.t < b.t ? 1 : -1)); },
    get cfg() { return doc(CFG).local; },
    get barrios() { return doc(CFG).local.barrios || []; },
    get equipo() { return doc(CFG).local.equipo || []; },
    get casos() { return [...casos.values()]; },
  };
  const now = () => Date.now();
  const iso = (ms) => new Date(ms == null ? now() : ms).toISOString();
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
  const titulo = (s) => String(s || '').trim().replace(/\s+/g, ' ').replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).slice(0, 60);
  const barrio = (id) => S.barrios.find((b) => b.id === id) || (id === SIN || !id ? SIN_BARRIO : { ...SIN_BARRIO, id, nombre: id });
  const cats = () => S.cfg.cats || [];
  const SIN_CAT = { id: '', nombre: 'Sin categoría', h: 0, claves: '' };
  const cat = (id) => cats().find((c) => c.id === id) || SIN_CAT;
  const umbral = () => S.cfg.umbral || 75;
  const loteKey = (t) => t.barrio + '|' + norm(t.lote).replace(/^lote /, '').replace(/^0+(?=\d)/, '');
  const puedeBarrio = (b) => esDir() || (!!yo && (yo.barrios || []).includes(b));
  /** Persona por usuario: el que está conectado o alguien del directorio que publica Dirección. */
  function persona(u) {
    if (!u) return null;
    if (yo && yo.usuario === u) return { usuario: yo.usuario, nombre: yo.nombre, rol: yo.rol, barrios: yo.barrios || [] };
    return S.equipo.find((p) => p.usuario === u) || (usuarios || []).find((p) => p.usuario === u) || null;
  }
  /** Barrio de un caso según la config (nombre, alias o mismo id). */
  function barrioDeCaso(txt) {
    const n = norm(txt);
    if (!n) return { id: SIN, conocido: true };
    const id = bid(txt);
    const b = S.barrios.find((x) => norm(x.nombre) === n || (x.alias || []).some((a) => norm(a) === n)) || S.barrios.find((x) => x.id === id);
    return b ? { id: b.id, conocido: true, alias: norm(b.nombre) !== n && !(b.alias || []).some((a) => norm(a) === n) } : { id, conocido: false };
  }
  const tkKey = (id) => { for (const b of barriosCarga()) { if (doc(bkey(b, 'tickets')).local.list.some((t) => t.id === id)) return bkey(b, 'tickets'); } return null; };
  const enKey = (id) => { for (const b of barriosCarga()) { if (doc(bkey(b, 'encuestas')).local.list.some((e) => e.id === id)) return bkey(b, 'encuestas'); } return null; };

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
    const b = (ref && ref.barrio) || SIN;
    if (!puedeBarrio(b)) return;
    const a = { id, t: iso(), tipo, ticket: ref ? ref.id : null, barrio: b, txt, leida: false };
    mut(bkey(b, 'alertas'), (d) => {
      if (d.list.some((x) => x.id === id)) return;
      d.list.unshift(clone(a));
      d.list = d.list.slice(0, 150);
    });
  }
  function marcarLeidas(ids) {
    const set = new Set(ids);
    barriosCarga().forEach((b) => {
      const k = bkey(b, 'alertas');
      if (doc(k).local.list.some((a) => set.has(a.id) && !a.leida)) mut(k, (d) => d.list.forEach((a) => { if (set.has(a.id)) a.leida = true; }));
    });
  }
  function tk(id, fn) { const k = tkKey(id); if (k) mut(k, (d) => { const t = d.list.find((x) => x.id === id); if (t) fn(t, d); }); }
  function en(id, fn) { const k = enKey(id); if (k) mut(k, (d) => { const e = d.list.find((x) => x.id === id); if (e) fn(e, d); }); }

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
  const ctxDe = (c) => ({ consulta: c.consulta || '', aclaraciones: c.aclaraciones || '', modulo: c.modulo || '', fuentes: c.fuentes_citadas || '',
    pasos: c.pasos_intentados || '', resultado: c.resultado || '', estado_bot: c.estado || '', creado_bot: c.creado || '', eventos: c.eventos || [], origen: c.origen || '' });
  const resueltoPorBot = (c) => c.derivado_central !== 'sí' && norm(c.estado) === 'resuelto';
  const idTicket = (c) => 'TK-' + String(c.caso_id).replace(/^RES-/i, '');

  /** Registra barrios nuevos (Dirección), crea tickets de casos derivados y encuestas de lo que resolvió el bot. */
  function procesarCasos() {
    const lista = S.casos.sort((a, b) => ((a.creado || '') < (b.creado || '') ? -1 : 1));
    // barrios: salen de lo que escribe el residente; el servidor los ubica por nombre o alias, así que se guarda cómo lo escribió
    if (esDir()) {
      const altas = [], alias = [];
      lista.forEach((c) => {
        const r = barrioDeCaso(c.barrio);
        if (r.id === SIN) return;
        if (!r.conocido && !altas.some((b) => b.id === r.id)) altas.push({ id: r.id, nombre: titulo(c.barrio), loc: '', alias: [], google: null, alta: iso() });
        else if (r.conocido && r.alias && !alias.some(([i, t]) => i === r.id && norm(t) === norm(c.barrio))) alias.push([r.id, String(c.barrio).trim()]);
        else if (!r.conocido) { const b = altas.find((x) => x.id === r.id); if (norm(b.nombre) !== norm(c.barrio) && !b.alias.some((a) => norm(a) === norm(c.barrio))) b.alias.push(String(c.barrio).trim()); }
      });
      if (altas.length || alias.length) mut(CFG, (d) => {
        altas.forEach((b) => { if (!d.barrios.some((x) => x.id === b.id)) d.barrios.push(clone(b)); });
        alias.forEach(([i, t]) => { const b = d.barrios.find((x) => x.id === i); if (b && !(b.alias || []).some((a) => norm(a) === norm(t))) b.alias = [...(b.alias || []), t]; });
      });
    }

    const creados = [];
    lista.filter((c) => c.derivado_central === 'sí').forEach((c) => {
      const id = idTicket(c);
      const t = S.tickets.find((x) => x.caso_id === c.caso_id || x.id === id);
      const ctx = ctxDe(c);
      if (!t) {
        const b = barrioDeCaso(c.barrio).id;
        if (!puedeBarrio(b)) return;
        const k = categorizar(c);
        const entro = c.actualizado || c.creado || iso();
        mut(bkey(b, 'tickets'), (d) => {
          if (d.list.some((x) => x.caso_id === c.caso_id || x.id === id)) return;
          const nt = {
            id, caso_id: c.caso_id, barrio: b, barrio_txt: c.barrio || '', lote: String(c.lote || '').trim(), cat: k,
            titulo: String(c.consulta || 'Caso derivado por el chat').slice(0, 90), origen: 'bot',
            reporta: { nombre: c.residente || 'Residente sin nombre', rol: 'Residente', cel: c.celular || '', correo: c.correo || '' },
            creado: entro, estado: 'nuevo', asignado: null, cerrado: null, resuelto_por: null, alertas: {}, eventos: [], ctx: clone(ctx),
          };
          evento(nt, `Ticket creado desde el chat (${c.caso_id}) con consulta, pasos intentados y fuentes · sin volver a pedirle datos al residente`, 'Bot SILA');
          if (b === SIN) evento(nt, 'El residente no informó el barrio · queda para Dirección', 'Sistema');
          if (!k) evento(nt, 'Ninguna categoría coincide: el semáforo se activa cuando se categoriza', 'Motor SLA');
          const madre = nt.lote && nt.cat && d.list.find((x) => x.estado !== 'cerrado' && !x.vinculado && x.cat === nt.cat && loteKey(x) === loteKey(nt));
          if (madre) {
            nt.vinculado = madre.id;
            evento(nt, `Vinculado a ${madre.id}: mismo lote y categoría`, 'Consolidación');
            evento(madre, `Nuevo reporte sobre el mismo lote: ${nt.id} (${nt.reporta.nombre})`, 'Consolidación');
          }
          d.list.unshift(nt);
        });
        const nt = S.tickets.find((x) => x.id === id);
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
      const b = barrioDeCaso(c.barrio).id;
      if (!puedeBarrio(b) || S.enc.some((e) => e.id === id)) return;
      const e = {
        id, ticket: null, caso_id: c.caso_id, barrio: b, lote: String(c.lote || '').trim(), nombre: c.residente || 'Residente del chat',
        canal: 'whatsapp', para: c.celular || 'mismo chat', motivo: '', resuelto_por: 'bot', consulta: String(c.consulta || '').slice(0, 90),
        enviado: c.actualizado || c.creado || iso(), estado: 'enviada', nps: null, csat: null, comentario: '', resp_t: null, resena: null, recup: null,
      };
      mut(bkey(b, 'encuestas'), (d) => { if (!d.list.some((x) => x.id === id)) d.list.unshift(clone(e)); });
    });
    return creados;
  }

  // al caso del chat la central sólo le escribe el id del ticket (y el cierre)
  const anotando = new Set();
  function anotarMonday() {
    if (!listo) return;
    barriosCarga().forEach((b) => {
      const r = doc(bkey(b, 'tickets')).remoto;
      ((r && r.list) || []).forEach((t) => {
        const c = t.caso_id && casos.get(t.caso_id);
        if (!c || c.monday_ticket === t.id || anotando.has(c.caso_id)) return;
        anotando.add(c.caso_id);
        actualizarCaso(c.caso_id, { monday_ticket: t.id }).finally(() => anotando.delete(c.caso_id));
      });
    });
  }
  async function actualizarCaso(caso_id, campos) {
    try {
      const j = await conToken({ action: 'caso_actualizar', caso_id, campos });
      if (j.ok) {
        const c = casos.get(caso_id);
        if (c) Object.assign(c, campos);
        chBot && chBot.postMessage({ type: 'caso', id: caso_id });
      }
      return !!j.ok;
    } catch (_) { return false; }
  }

  /** Pasa un ticket (y su encuesta) a otro barrio: cambia de clave compartida. Sólo Dirección. */
  function moverTicket(id, nuevo, quien) {
    const k = tkKey(id);
    const t = S.tickets.find((x) => x.id === id);
    if (!k || !t || t.barrio === nuevo || !puedeBarrio(nuevo)) return;
    const copia = clone(t);
    const de = barrio(t.barrio).nombre, a = barrio(nuevo).nombre;
    copia.barrio = nuevo;
    evento(copia, `Barrio reasignado: ${de} → ${a}`, quien);
    mut(k, (d) => { d.list = d.list.filter((x) => x.id !== id); });
    mut(bkey(nuevo, 'tickets'), (d) => { if (!d.list.some((x) => x.id === id)) d.list.unshift(clone(copia)); });
    S.enc.filter((e) => e.ticket === id).forEach((e) => {
      const ek = enKey(e.id), ec = { ...clone(e), barrio: nuevo };
      mut(ek, (d) => { d.list = d.list.filter((x) => x.id !== e.id); });
      mut(bkey(nuevo, 'encuestas'), (d) => { if (!d.list.some((x) => x.id === ec.id)) d.list.unshift(clone(ec)); });
    });
  }
  /** Une un barrio duplicado con otro: alias, tickets, encuestas y usuarios que lo tenían. */
  async function unirBarrios(src, dst, quien) {
    const s = barrio(src);
    S.tickets.filter((t) => t.barrio === src).forEach((t) => moverTicket(t.id, dst, quien));
    S.enc.filter((e) => e.barrio === src && !e.ticket).forEach((e) => {
      mut(bkey(src, 'encuestas'), (d) => { d.list = d.list.filter((x) => x.id !== e.id); });
      mut(bkey(dst, 'encuestas'), (d) => { if (!d.list.some((x) => x.id === e.id)) d.list.unshift({ ...clone(e), barrio: dst }); });
    });
    mut(CFG, (d) => {
      const a = d.barrios.find((x) => x.id === src), b = d.barrios.find((x) => x.id === dst);
      if (!a || !b) return;
      b.alias = [...new Set([...(b.alias || []), a.nombre, ...(a.alias || [])])].filter((x) => norm(x) !== norm(b.nombre));
      d.barrios = d.barrios.filter((x) => x.id !== src);
    });
    for (const u of (usuarios || []).filter((x) => (x.barrios || []).includes(src))) {
      await usuarioGuardar({ usuario: u.usuario, nombre: u.nombre, rol: u.rol, barrios: [...new Set(u.barrios.map((b) => (b === src ? dst : b)))] });
    }
    return s;
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
    const k = tkKey(id);
    if (!t0 || !k || t0.estado === 'cerrado') return null;
    const ids = [id, ...S.tickets.filter((x) => x.vinculado === id && x.estado !== 'cerrado' && x.barrio === t0.barrio).map((x) => x.id)];
    const cuando = iso();
    const encs = ids.map((tid) => encuestaDe(S.tickets.find((x) => x.id === tid), rp));
    mut(k, (d) => {
      ids.forEach((tid, i) => {
        const t = d.list.find((x) => x.id === tid);
        if (!t || t.estado === 'cerrado') return;
        t.estado = 'cerrado'; t.cerrado = cuando; t.resuelto_por = rp; t.encuesta = 'EN-' + t.id.slice(3);
        const s = sla(t);
        evento(t, i === 0 ? `Cerrado · resolvió ${rp === 'bot' ? 'el bot SILA' : quien} · SLA ${s.st === 'cumplido' ? 'cumplido' : s.st === 'sin' ? 'sin categoría' : 'incumplido'}${nota ? ' · ' + nota : ''}` : `Cerrado junto con ${id} (mismo lote y categoría)`, i === 0 ? quien : 'Consolidación');
        evento(t, `Encuesta CSAT/NPS por ${encs[i].canal === 'email' ? 'email formal' : 'WhatsApp'} a ${encs[i].para} · SIMULADO, no salió nada`, 'Experiencia');
      });
    });
    mut(bkey(t0.barrio, 'encuestas'), (d) => encs.forEach((e) => { d.list = d.list.filter((x) => x.id !== e.id); d.list.unshift(clone(e)); }));
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

  window.G = {
    H, D, S, CFG, SIN, SIN_BARRIO, SIN_CAT, ROL_TXT, CATS_DOC, CLASE, net,
    url, token: () => token, yo: () => yo, esDir, estado, crearClave, login, retomar, cambiarClave, salir, arrancar, parar, refrescar, on, listo: () => listo, pendientes,
    usuarios: () => usuarios, usuariosListar, usuarioGuardar, usuarioBaja,
    mut, tk, en, now, iso, sla, revisarSLA, barrio, persona, cats, cat, umbral, loteKey, norm, bid, titulo, evento, alerta, marcarLeidas, puedeBarrio, barrioDeCaso,
    categorizar, cerrar, responder, pedirResena, actualizarCaso, moverTicket, unirBarrios,
  };
})();
