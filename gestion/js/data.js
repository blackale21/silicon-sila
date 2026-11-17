/* Central SILA · datos, motor de SLA y puente con el bot de residentes.
 * DEMO: todo vive en el localStorage de este navegador. No se envía nada a ningún lado.
 *   sila_demo_tickets_v1    tickets propios de la central
 *   sila_demo_encuestas_v1  encuestas CSAT/NPS, reseñas y recuperación de detractores
 *   sila_demo_gestion_v1    configuración (SLA, rol, reloj demo, alertas)
 *   sila_demo_casos_v1      casos del bot (contrato fijo): sólo se lee y se anota monday_ticket
 */
(function () {
  const K = { casos: 'sila_demo_casos_v1', tickets: 'sila_demo_tickets_v1', enc: 'sila_demo_encuestas_v1', cfg: 'sila_demo_gestion_v1' };
  const H = 3600e3, D = 24 * H;

  /* ── catálogo ficticio ── */
  const BARRIOS = [
    { id: 'alamos', nombre: 'Los Álamos', loc: 'Pilar', g: [4.3, 212] },
    { id: 'sangabriel', nombre: 'San Gabriel', loc: 'Tigre', g: [3.6, 148] },
    { id: 'altosol', nombre: 'Altos del Sol', loc: 'Escobar', g: [4.6, 96] },
    { id: 'calandria', nombre: 'La Calandria', loc: 'Canning', g: [4.0, 77] },
    { id: 'ceibo', nombre: 'Puerto Ceibo', loc: 'Nordelta', g: [4.1, 180] },
  ];
  const SIN_BARRIO = { id: 'sin-barrio', nombre: 'Barrio no registrado', loc: '—', g: [0, 0] };

  const PERSONAS = [
    { id: 'dir', rol: 'direccion', nombre: 'Marina Ferreyra', barrios: '*' },
    { id: 'op-alamos', rol: 'operador', nombre: 'Julián Ríos', barrios: ['alamos'] },
    { id: 'op-sg', rol: 'operador', nombre: 'Carla Benítez', barrios: ['sangabriel'] },
    { id: 'op-sur', rol: 'operador', nombre: 'Tomás Aguirre', barrios: ['altosol', 'calandria', 'ceibo'] },
    { id: 'tec-diego', rol: 'tecnico', nombre: 'Diego Suárez', barrios: [] },
    { id: 'tec-lu', rol: 'tecnico', nombre: 'Lucía Ponce', barrios: [] },
  ];
  const ROL_TXT = { direccion: 'Dirección', operador: 'Operador', tecnico: 'Técnico de campo' };

  const CATS_DEF = [
    { id: 'barrera', nombre: 'Barrera caída', h: 2 },
    { id: 'totem', nombre: 'Tótem o lector fuera de servicio', h: 4 },
    { id: 'conect', nombre: 'Guardia sin conectividad', h: 4 },
    { id: 'tag', nombre: 'Tag / control vehicular', h: 8 },
    { id: 'visitas', nombre: 'Visitas y QR', h: 8 },
    { id: 'app', nombre: 'App y credenciales', h: 12 },
    { id: 'datos', nombre: 'Cambio de datos', h: 24 },
    { id: 'admin', nombre: 'Consulta administrativa', h: 48 },
  ];

  // Barrio → Lote → Usuarios (familia). La guardia reporta como usuario del barrio.
  const LOTES = {
    alamos: { '214': [['Paula Medina', 'Titular'], ['Martín Medina', 'Familiar'], ['Sofía Medina', 'Familiar']], '087': [['Gustavo Ibarra', 'Titular'], ['Laura Quiroga', 'Familiar']], '301': [['Hernán Sosa', 'Titular']], '045': [['Valeria Paz', 'Titular'], ['Ignacio Paz', 'Familiar']], '122': [['Carolina Méndez', 'Titular'], ['Bruno Méndez', 'Familiar']], '178': [['Alejandro Rossi', 'Titular']] },
    sangabriel: { '31': [['Romina Castro', 'Titular'], ['Federico Luna', 'Familiar']], '112': [['Ignacio Vera', 'Titular']], '7': [['Agustina Ledesma', 'Inquilina']], '58': [['Pablo Ortiz', 'Titular'], ['Daniela Rey', 'Familiar']], '96': [['Verónica Sala', 'Titular'], ['Matías Sala', 'Familiar']] },
    altosol: { '9': [['Esteban Funes', 'Titular']], '22': [['Mariela Acosta', 'Titular'], ['Lucas Bravo', 'Familiar']], '64': [['Natalia Godoy', 'Titular']], '15': [['Gabriel Ochoa', 'Titular'], ['Lorena Ochoa', 'Familiar']] },
    calandria: { '56': [['Sergio Peralta', 'Titular'], ['Florencia Ruiz', 'Familiar']], '140': [['Diego Molina', 'Titular']], '18': [['Camila Torres', 'Titular']], '233': [['Ramiro Benegas', 'Titular'], ['Silvina Benegas', 'Familiar']] },
    ceibo: { '3': [['Andrés Villalba', 'Titular'], ['Julieta Villalba', 'Familiar']], '76': [['Mónica Herrera', 'Titular']], '201': [['Rodrigo Sáenz', 'Titular']], '44': [['Cecilia Arana', 'Titular'], ['Joaquín Arana', 'Familiar']], '118': [['Hugo Lemos', 'Titular']] },
  };
  const GUARDIA = { alamos: 'Guardia · Puesto 1', sangabriel: 'Guardia · Acceso Norte', altosol: 'Guardia · Puesto central', calandria: 'Guardia · Ingreso', ceibo: 'Guardia · Muelle' };

  /* ── almacenamiento ── */
  const rd = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (_) { return d; } };
  const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } };
  const chG = 'BroadcastChannel' in window ? new BroadcastChannel('sila-gestion') : null;
  const chBot = 'BroadcastChannel' in window ? new BroadcastChannel('sila-demo') : null;

  const S = { tickets: [], enc: [], cfg: null };
  function load() {
    S.tickets = rd(K.tickets, []);
    S.enc = rd(K.enc, []);
    S.cfg = rd(K.cfg, null);
  }
  function save(what) {
    if (!what || what === 'tickets') wr(K.tickets, S.tickets);
    if (!what || what === 'enc') wr(K.enc, S.enc);
    if (!what || what === 'cfg') wr(K.cfg, S.cfg);
    chG && chG.postMessage({ type: 'gestion' });
  }

  /* ── reloj demo: permite adelantar el tiempo para ver el SLA moverse ── */
  const now = () => Date.now() + ((S.cfg && S.cfg.offset) || 0);
  const iso = (ms) => new Date(ms == null ? now() : ms).toISOString();

  /* ── utilidades ── */
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const barrio = (id) => BARRIOS.find((b) => b.id === id) || (id === SIN_BARRIO.id ? SIN_BARRIO : { ...SIN_BARRIO, id });
  const persona = (id) => PERSONAS.find((p) => p.id === id);
  const cats = () => (S.cfg && S.cfg.cats) || CATS_DEF;
  const cat = (id) => cats().find((c) => c.id === id) || cats()[0];
  const umbral = () => (S.cfg && S.cfg.umbral) || 75;
  const loteKey = (t) => t.barrio + '|' + norm(t.lote).replace(/^lote /, '').replace(/^0+(?=\d)/, '');

  function nextId() { S.cfg.seq = (S.cfg.seq || 10000) + 1; return 'TK-' + S.cfg.seq; }

  /* ── motor de SLA ── */
  function sla(t) {
    const c = cat(t.cat);
    const tot = c.h * H;
    const start = +new Date(t.creado);
    const end = t.cerrado ? +new Date(t.cerrado) : now();
    const el = Math.max(0, end - start);
    const pct = el / tot;
    const u = umbral() / 100;
    let st;
    if (t.estado === 'cerrado') st = el <= tot ? 'cumplido' : 'incumplido';
    else st = pct >= 1 ? 'vencido' : pct >= u ? 'riesgo' : 'ok';
    return { pct, st, rest: start + tot - end, limite: start + tot, aviso: start + tot * u, tot, h: c.h };
  }

  function alerta(tipo, t, txt) {
    S.cfg.alertas.unshift({ id: 'AL' + Math.random().toString(36).slice(2, 8), t: iso(), tipo, ticket: t ? t.id : null, barrio: t ? t.barrio : null, txt, leida: false });
    S.cfg.alertas = S.cfg.alertas.slice(0, 120);
  }
  function evento(t, txt, quien) { (t.eventos = t.eventos || []).push({ t: iso(), txt, quien: quien || 'Sistema' }); }

  /** Revisa todos los tickets abiertos. Devuelve las alertas nuevas (75 % y vencido). */
  function revisarSLA() {
    const nuevas = [];
    S.tickets.forEach((t) => {
      if (t.estado === 'cerrado') return;
      const s = sla(t);
      t.alertas = t.alertas || {};
      if (s.pct >= umbral() / 100 && !t.alertas.a75) {
        t.alertas.a75 = iso();
        const txt = `${t.id} llegó al ${umbral()} % del SLA (${s.h} h) · aviso al operador de turno y al supervisor`;
        evento(t, `Alerta automática ${umbral()} % del SLA · aviso SIMULADO al operador y al supervisor`, 'Motor SLA');
        alerta('a75', t, txt);
        nuevas.push({ tipo: 'a75', t, txt });
      }
      if (s.pct >= 1 && !t.alertas.a100) {
        t.alertas.a100 = iso();
        const txt = `${t.id} venció su SLA de ${s.h} h · escalado a Dirección`;
        evento(t, 'SLA vencido · escalado a Dirección (SIMULADO)', 'Motor SLA');
        alerta('a100', t, txt);
        nuevas.push({ tipo: 'a100', t, txt });
      }
    });
    if (nuevas.length) save();
    return nuevas;
  }

  /* ── consolidación por lote: vincula reportes del mismo lote y categoría ── */
  function vincular(t) {
    if (!t.lote) return null;
    const madre = S.tickets.find((x) => x !== t && x.estado !== 'cerrado' && !x.vinculado && loteKey(x) === loteKey(t) && x.cat === t.cat);
    if (madre) {
      t.vinculado = madre.id;
      evento(t, `Vinculado a ${madre.id}: mismo lote y categoría`, 'Consolidación');
      evento(madre, `Nuevo reporte sobre el mismo lote: ${t.id} (${t.reporta.nombre} · ${t.reporta.rol})`, 'Consolidación');
    }
    return madre;
  }

  /* ── puente con el bot SILA Ayuda ── */
  const REGLAS = [
    ['tag', /\btag\b|control remoto|vehicul|patente/],
    ['barrera', /barrera|brazo|porton|molinete/],
    ['totem', /totem|lector|biometr|huella|facial|camara/],
    ['conect', /conectiv|internet|sin senal|wifi|enlace|sin red/],
    ['visitas', /visita|invitad|\bqr\b|delivery|proveedor/],
    ['datos', /cambio de dato|cambiar (mi |el )?(telefono|correo|mail|dato)|actualizar (mis )?dato|domicilio/],
    ['app', /app|aplicacion|contrasena|clave|usuario|login|credencial|ingresar/],
    ['admin', /expensa|factura|administracion|reglamento/],
  ];
  function categorizar(caso) {
    const txt = norm([caso.consulta, caso.aclaraciones, caso.modulo].join(' '));
    const r = REGLAS.find(([, re]) => re.test(txt));
    return r ? r[0] : 'app';
  }
  function matchBarrio(txt) {
    const n = norm(txt).replace(/^(barrio|country|club de campo) /, '');
    if (!n) return SIN_BARRIO.id;
    const b = BARRIOS.find((x) => norm(x.nombre) === n || norm(x.nombre).includes(n) || n.includes(norm(x.nombre)));
    return b ? b.id : SIN_BARRIO.id;
  }

  /** Lee los casos del bot y crea un ticket por cada caso derivado a la central. */
  function syncBot() {
    let casos;
    try { casos = JSON.parse(localStorage.getItem(K.casos) || '[]'); } catch (_) { return []; }
    if (!Array.isArray(casos)) return [];
    S.tickets = rd(K.tickets, S.tickets); // evita duplicar si otra pestaña ya lo tomó
    const nuevos = [];
    let cambios = false;
    casos.forEach((c) => {
      if (!c || c.derivado_central !== 'sí' || !c.caso_id) return;
      let t = S.tickets.find((x) => x.caso_id === c.caso_id);
      const ctx = { consulta: c.consulta || '', aclaraciones: c.aclaraciones || '', modulo: c.modulo || '', fuentes: c.fuentes_citadas || '',
        pasos: c.pasos_intentados || '', resultado: c.resultado || '', estado_bot: c.estado || '', creado_bot: c.creado || '', eventos: c.eventos || [], origen: c.origen || '' };
      if (!t) {
        const b = matchBarrio(c.barrio);
        t = {
          id: nextId(), caso_id: c.caso_id, barrio: b, barrio_txt: c.barrio || '', lote: String(c.lote || '').trim(), cat: categorizar(c),
          titulo: String(c.consulta || 'Caso derivado por el bot').slice(0, 90), origen: 'bot',
          reporta: { nombre: c.residente || 'Residente sin nombre', rol: rolEnLote(b, c.lote, c.residente), cel: c.celular || '', correo: c.correo || '' },
          creado: iso(), estado: 'nuevo', asignado: null, cerrado: null, resuelto_por: null, alertas: {}, eventos: [], ctx,
        };
        evento(t, `Ticket creado desde el bot SILA (${c.caso_id}) con consulta, pasos intentados y fuentes · sin volver a pedirle datos al residente`, 'Bot SILA');
        if (b === SIN_BARRIO.id) evento(t, `Barrio "${c.barrio || '—'}" no coincide con ningún barrio registrado · queda para Dirección`, 'Sistema');
        S.tickets.unshift(t);
        vincular(t);
        alerta('nuevo', t, `Nuevo ticket ${t.id} desde el bot · ${barrio(b).nombre}${t.lote ? ' · Lote ' + t.lote : ''}`);
        nuevos.push(t);
        cambios = true;
      } else if (JSON.stringify(t.ctx) !== JSON.stringify(ctx)) {
        if (t.ctx && t.ctx.estado_bot !== ctx.estado_bot) evento(t, `El caso ${c.caso_id} cambió en el bot: ${ctx.estado_bot}`, 'Bot SILA');
        t.ctx = ctx;
        cambios = true;
      }
    });
    if (cambios) save();
    anotarMonday(casos);
    return nuevos;
  }
  // único campo que se escribe en el registro del bot: monday_ticket = id del ticket
  function anotarMonday(casos) {
    const falta = casos.filter((c) => c && c.derivado_central === 'sí').map((c) => [c, S.tickets.find((t) => t.caso_id === c.caso_id)]).filter(([c, t]) => t && c.monday_ticket !== t.id);
    if (!falta.length) return;
    falta.forEach(([c, t]) => { c.monday_ticket = t.id; });
    try { localStorage.setItem(K.casos, JSON.stringify(casos)); } catch (_) { return; }
    falta.forEach(([c]) => chBot && chBot.postMessage({ type: 'caso', id: c.caso_id }));
  }
  function rolEnLote(b, lote, nombre) {
    const l = (LOTES[b] || {})[String(lote || '').trim()];
    const u = l && l.find(([n]) => norm(n) === norm(nombre));
    return u ? u[1] : 'Residente';
  }

  /* ── encuestas (capa 3) ── */
  const CLASE = (nps) => (nps == null ? null : nps >= 9 ? 'promotor' : nps >= 7 ? 'pasivo' : 'detractor');
  function enviarEncuesta(t) {
    if (t.reporta.rol === 'Guardia') { evento(t, 'Reportado por la guardia: no se envía encuesta de experiencia', 'Experiencia'); return null; }
    const porBot = t.resuelto_por === 'bot';
    const canal = porBot || !t.reporta.correo ? 'whatsapp' : 'email';
    const e = {
      id: 'EN-' + t.id.slice(3), ticket: t.id, barrio: t.barrio, lote: t.lote, nombre: t.reporta.nombre, canal,
      para: canal === 'email' ? t.reporta.correo : (t.reporta.cel || 'mismo chat de WhatsApp'), motivo: canal === 'whatsapp' && !porBot ? 'sin correo registrado' : '',
      enviado: iso(), estado: 'enviada', nps: null, csat: null, comentario: '', resp_t: null, resena: null, recup: null,
    };
    S.enc = S.enc.filter((x) => x.ticket !== t.id);
    S.enc.unshift(e);
    t.encuesta = e.id;
    evento(t, `Encuesta CSAT/NPS enviada por ${canal === 'email' ? 'email formal' : 'WhatsApp'} a ${e.para} · SIMULADO, no salió nada`, 'Experiencia');
    return e;
  }
  function responder(e, nps, csat, comentario) {
    Object.assign(e, { nps, csat, comentario: comentario || '', estado: 'respondida', resp_t: iso() });
    const t = S.tickets.find((x) => x.id === e.ticket);
    const cl = CLASE(nps);
    if (t) evento(t, `Encuesta respondida (simulado): NPS ${nps} · CSAT ${csat}/5 · ${cl}`, 'Experiencia');
    if (cl === 'detractor') {
      e.recup = { estado: 'abierta', pasos: [false, false, false, false], t: iso(), limite: iso(now() + D) };
      alerta('detractor', t || { id: e.ticket, barrio: e.barrio }, `Detractor en ${barrio(e.barrio).nombre}: ${e.nombre} (NPS ${nps}) · protocolo de recuperación abierto, llamar antes de 24 h`);
    }
    if (cl === 'promotor') e.resena = { estado: 'pendiente', t: null };
    return cl;
  }
  function pedirResena(e) {
    e.resena = { estado: 'pedida', t: iso(), canal: e.canal };
  }

  /* ── semilla de demostración ── */
  function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function seed() {
    const r = rng(20261116);
    const pick = (a) => a[Math.floor(r() * a.length)];
    const T0 = Date.now();
    S.cfg = { v: 1, offset: 0, cats: CATS_DEF.map((c) => ({ ...c })), umbral: 75, alertas: [], seq: 10000, sembrado: iso(T0) };
    S.tickets = []; S.enc = [];
    const TECS = ['tec-diego', 'tec-lu'];
    const mail = (n) => norm(n).replace(/ /g, '.') + '@correo-demo.com.ar';
    const cel = () => '11 ' + (4000 + Math.floor(r() * 5999)) + ' ' + (1000 + Math.floor(r() * 8999));
    const rep = (b, lote, i) => {
      if (lote === 'ACCESO' || i === 'g') return { nombre: GUARDIA[b], rol: 'Guardia', cel: '', correo: 'guardia.' + b + '@correo-demo.com.ar' };
      const u = LOTES[b][lote][i || 0];
      return { nombre: u[0], rol: u[1], cel: cel(), correo: mail(u[0]) };
    };

    /* histórico cerrado: 8 semanas, NPS distinto por barrio */
    const PERFIL = { alamos: [0.62, 0.12], sangabriel: [0.3, 0.38], altosol: [0.72, 0.05], calandria: [0.45, 0.22], ceibo: [0.52, 0.15] };
    const TIT = {
      barrera: ['Barrera de ingreso no levanta', 'Brazo de barrera trabado en salida'], totem: ['Tótem de visitas no lee el QR', 'Lector facial no reconoce'],
      conect: ['Guardia sin internet, no valida accesos'], tag: ['Tag del auto no abre', 'Alta de tag para auto nuevo'], visitas: ['Invitación QR no llega al visitante', 'Proveedor frecuente sin autorización'],
      app: ['No puedo ingresar a la app', 'Reinicio de credenciales'], datos: ['Cambio de celular del titular', 'Actualizar correo de la familia'], admin: ['Consulta por reglamento de visitas'],
    };
    const COM = {
      promotor: ['Rapidísimo, gracias.', 'El técnico vino en el día. Excelente.', 'Me resolvieron sin tener que llamar.', 'Muy buena atención.', ''],
      pasivo: ['Se resolvió, pero tardó un poco.', 'Bien, aunque tuve que insistir.', ''],
      detractor: ['Estuve dos días sin poder entrar con el auto.', 'Nadie me avisó que el técnico venía.', 'Tuve que explicar tres veces lo mismo.', 'La barrera sigue fallando de noche.'],
    };
    const bids = BARRIOS.map((b) => b.id);
    for (let i = 0; i < 96; i++) {
      const b = bids[i % bids.length];
      const lotes = Object.keys(LOTES[b]);
      const c = pick(CATS_DEF);
      const infra = ['barrera', 'totem', 'conect'].includes(c.id);
      const lote = infra ? 'ACCESO' : pick(lotes);
      const lv = pick(lotes);
      const who = infra && r() < 0.35 ? rep(b, 'ACCESO') : rep(b, infra ? lv : lote, Math.floor(r() * LOTES[b][infra ? lv : lote].length));
      const porBot = !infra && r() < 0.32;
      const creado = T0 - (1.2 + r() * 54) * D;
      const dur = c.h * H * (porBot ? 0.02 + r() * 0.1 : 0.15 + r() * (b === 'sangabriel' ? 1.5 : 1.08));
      const cerrado = creado + dur;
      const t = {
        id: 'TK-' + (10001 + i), barrio: b, lote, cat: c.id, titulo: pick(TIT[c.id]), origen: porBot ? 'whatsapp' : pick(['telefono', 'whatsapp', 'guardia', 'bot']),
        reporta: who, creado: iso(creado), estado: 'cerrado', asignado: infra ? pick(TECS) : null, cerrado: iso(cerrado), resuelto_por: porBot ? 'bot' : 'persona', alertas: {}, eventos: [],
      };
      t.eventos.push({ t: t.creado, txt: 'Ticket creado', quien: 'Sistema' });
      if (dur > c.h * H * 0.75) t.alertas.a75 = iso(creado + c.h * H * 0.75);
      if (dur > c.h * H) t.alertas.a100 = iso(creado + c.h * H);
      t.eventos.push({ t: t.cerrado, txt: porBot ? 'Resuelto por el bot (Filtro Cero) en el chat' : 'Cerrado por el operador', quien: porBot ? 'Bot SILA' : 'Operador' });
      S.tickets.push(t);
      const e = enviarEncuesta(t);
      t.eventos[t.eventos.length - 1].t = t.cerrado;
      if (!e) continue;
      e.enviado = t.cerrado;
      if (r() < 0.78) {
        const [pp, pd] = PERFIL[b];
        const x = r();
        const late = dur > c.h * H;
        const cl = x < (late ? pd + 0.25 : pd) ? 'detractor' : x < pd + pp ? 'promotor' : 'pasivo';
        const nps = cl === 'promotor' ? 9 + (r() < 0.55 ? 1 : 0) : cl === 'pasivo' ? 7 + (r() < 0.5 ? 1 : 0) : pick([1, 2, 3, 4, 5, 5, 6, 6]);
        const csat = cl === 'promotor' ? (r() < 0.8 ? 5 : 4) : cl === 'pasivo' ? (r() < 0.6 ? 4 : 3) : pick([1, 2, 2, 3]);
        Object.assign(e, { estado: 'respondida', nps, csat, comentario: pick(COM[cl]), resp_t: iso(cerrado + (1 + r() * 20) * H) });
        const edad = (T0 - cerrado) / D;
        if (cl === 'detractor') {
          const ab = edad < 6;
          e.recup = ab ? { estado: 'abierta', pasos: [r() < 0.6, false, false, false], t: e.resp_t, limite: iso(+new Date(e.resp_t) + D) }
            : { estado: r() < 0.6 ? 'recuperado' : 'no_recuperado', pasos: [true, true, true, true], t: e.resp_t, renps: null };
          if (e.recup.estado === 'recuperado') e.recup.renps = 8 + (r() < 0.4 ? 1 : 0);
        }
        if (cl === 'promotor') {
          const y = r();
          e.resena = y < 0.45 && edad > 3 ? { estado: 'publicada', t: iso(cerrado + 2 * D), estrellas: r() < 0.85 ? 5 : 4 } : y < 0.75 ? { estado: 'pedida', t: iso(cerrado + 3 * H) } : { estado: 'pendiente', t: null };
        }
      }
    }
    // asegurar dos detractores con protocolo abierto (uno reciente, otro con pasos)
    S.enc.filter((e) => e.recup && e.recup.estado === 'abierta').length < 2 &&
      S.enc.filter((e) => CLASE(e.nps) === 'detractor').slice(0, 2).forEach((e, i) => { e.recup = { estado: 'abierta', pasos: [i === 1, i === 1, false, false], t: iso(T0 - (i + 1) * 5 * H), limite: iso(T0 + (i ? 14 : 19) * H) }; });

    /* abiertos: cada uno con un % de SLA consumido distinto */
    const BOT_CTX = (consulta, modulo, fuentes, pasos, resultado) => ({ consulta, aclaraciones: '', modulo, fuentes, pasos, resultado, estado_bot: 'pendiente', creado_bot: '', eventos: [], origen: 'index.html' });
    const OPEN = [
      ['alamos', 'ACCESO', 'barrera', 0.9, 'Barrera de salida no baja, quedó levantada', 'guardia', null, 'tec-diego', 'en_campo'],
      ['alamos', '214', 'tag', 0.55, 'El tag del auto no abre la barrera', 'bot', 0, null, 'en_curso',
        BOT_CTX('el tag del auto no me abre la barrera', 'Tags vehiculares', 'Manual de usuario residentes · p. 12', '[Manual de usuario residentes · p. 12]\nVerificá que el tag esté pegado en el parabrisas, del lado del espejo.\nSi el tag es nuevo, la administración debe darlo de alta.', 'No resuelto siguiendo los manuales')],
      ['alamos', '214', 'tag', 0.4, 'Mi marido tampoco puede entrar con el tag', 'telefono', 1, null, 'nuevo'],
      ['alamos', '214', 'tag', 0.3, 'Vecino del 214 ingresó con apertura manual otra vez', 'guardia', 'g', null, 'nuevo'],
      ['alamos', '087', 'datos', 0.3, 'Cambiar el celular del titular', 'bot', 0, null, 'nuevo',
        BOT_CTX('quiero cambiar el número de celular de la cuenta', 'Datos personales', 'Guía rápida de la app · p. 3', '[Guía rápida de la app · p. 3]\nIngresá a Perfil > Mis datos.\nEl cambio de celular titular lo valida la administración.', 'Sin solución documentada')],
      ['sangabriel', 'ACCESO', 'totem', 1.25, 'Tótem de visitas del acceso norte apagado', 'guardia', null, 'tec-lu', 'en_campo'],
      ['sangabriel', '31', 'visitas', 0.735, 'Mis invitados no reciben el QR', 'bot', 0, null, 'nuevo',
        BOT_CTX('mis invitados no reciben el qr de ingreso', 'Visitas', 'Manual de usuario residentes · p. 8 · Instructivo de visitas · p. 2', '[Manual de usuario residentes · p. 8]\nGenerá la invitación desde Visitas > Nueva.\nCompartí el link por WhatsApp desde el mismo celular.', 'No resuelto siguiendo los manuales')],
      ['sangabriel', '112', 'app', 0.5, 'No puedo ingresar a la app desde el cambio de celular', 'whatsapp', 0, null, 'en_curso'],
      ['altosol', 'ACCESO', 'conect', 0.8, 'Guardia sin enlace: valida accesos a mano', 'guardia', null, 'tec-diego', 'en_curso'],
      ['altosol', '9', 'admin', 0.1, 'Consulta por horario de proveedores', 'telefono', 0, null, 'nuevo'],
      ['calandria', '56', 'tag', 1.6, 'Alta de tag para auto nuevo', 'whatsapp', 1, null, 'en_curso'],
      ['calandria', '140', 'datos', 0.65, 'Agregar a mi hijo como usuario', 'telefono', 0, null, 'nuevo'],
      ['ceibo', '3', 'visitas', 0.2, 'Proveedor de pileta sin autorización permanente', 'whatsapp', 1, null, 'nuevo'],
      ['ceibo', 'ACCESO', 'barrera', 0.35, 'Barrera del muelle sube y baja sola', 'guardia', null, null, 'nuevo'],
    ];
    OPEN.forEach(([b, lote, cid, pct, titulo, origen, ui, asig, estado, ctx], i) => {
      const c = CATS_DEF.find((x) => x.id === cid);
      const creado = T0 - pct * c.h * H;
      const t = {
        id: 'TK-' + (10200 + i), barrio: b, lote, cat: cid, titulo, origen, reporta: rep(b, lote, ui), creado: iso(creado), estado, asignado: asig,
        cerrado: null, resuelto_por: null, alertas: {}, eventos: [{ t: iso(creado), txt: origen === 'bot' ? 'Ticket creado desde el bot SILA con el contexto del caso' : 'Ticket creado', quien: origen === 'bot' ? 'Bot SILA' : 'Operador' }],
      };
      if (ctx) { t.ctx = ctx; t.caso_id = 'RES-DEMO' + (i + 1); }
      if (asig) t.eventos.push({ t: iso(creado + 0.1 * c.h * H), txt: 'Asignado a ' + persona(asig).nombre, quien: 'Operador' });
      S.tickets.push(t);
    });
    S.tickets.filter((t) => t.estado !== 'cerrado' && t.lote === '214').slice(1).forEach((t) => { t.vinculado = 'TK-10201'; });
    // las alertas que ya habían ocurrido antes de abrir la demo quedan registradas como históricas
    S.tickets.filter((t) => t.estado !== 'cerrado').forEach((t) => {
      const s = sla(t);
      if (s.pct >= 0.75) { t.alertas.a75 = iso(s.aviso); S.cfg.alertas.push({ id: 'ALh' + t.id, t: iso(s.aviso), tipo: 'a75', ticket: t.id, barrio: t.barrio, txt: `${t.id} llegó al 75 % del SLA (${s.h} h)`, leida: true }); }
      if (s.pct >= 1) { t.alertas.a100 = iso(s.limite); S.cfg.alertas.push({ id: 'ALv' + t.id, t: iso(s.limite), tipo: 'a100', ticket: t.id, barrio: t.barrio, txt: `${t.id} venció su SLA de ${s.h} h`, leida: true }); }
    });
    S.cfg.alertas.sort((a, b) => (a.t < b.t ? 1 : -1));
    S.cfg.seq = 10300;
    S.tickets.sort((a, b) => (a.creado < b.creado ? 1 : -1));
    save();
  }

  function init() {
    load();
    if (!S.cfg || !S.cfg.sembrado || !S.tickets.length) seed();
    S.cfg.alertas = S.cfg.alertas || [];
  }

  function onChange(cb) {
    chG && chG.addEventListener('message', () => { load(); cb('gestion'); });
    chBot && chBot.addEventListener('message', (e) => e.data && e.data.type === 'caso' && cb('bot'));
    addEventListener('storage', (e) => {
      if (e.key === K.casos) cb('bot');
      else if ([K.tickets, K.enc, K.cfg].includes(e.key)) { load(); cb('gestion'); }
    });
  }

  window.G = { K, S, H, D, BARRIOS, SIN_BARRIO, PERSONAS, ROL_TXT, LOTES, GUARDIA, CLASE, init, load, save, seed, now, iso, sla, revisarSLA, syncBot, barrio, persona, cats, cat, umbral,
    loteKey, norm, nextId, evento, alerta, vincular, enviarEncuesta, responder, pedirResena, onChange };
})();
