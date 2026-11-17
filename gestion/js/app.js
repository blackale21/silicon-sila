/* Central SILA · interfaz: tickets con SLA, lotes, experiencia y reputación.
 * Los datos vienen del backend (casos del chat + estado compartido). Los envíos son SIMULADOS. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const S = G.S;

  /* ── estado de la pestaña (cada pestaña puede mirar con otro rol) ── */
  const UI_KEY = 'sila_gestion_ui';
  const ui = Object.assign({ rol: 'dir', vista: 'tickets', barrio: '*', filtro: 'abiertos', cat: '', q: '', lote: null, encF: 'todas' }, (() => { try { return JSON.parse(sessionStorage.getItem(UI_KEY)) || {}; } catch (_) { return {}; } })());
  const keep = () => { try { sessionStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (_) { /* privado */ } };
  let openId = null;
  const fresh = new Set();

  /* ── formato ── */
  const pad = (n) => String(n).padStart(2, '0');
  const fdt = (v) => { const d = new Date(v); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const fhm = (v) => { const d = new Date(v); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  function dur(ms) {
    const m = Math.round(Math.abs(ms) / 60000);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    if (h < 48) return `${h} h ${pad(m % 60)} m`;
    return `${Math.floor(h / 24)} d ${h % 24} h`;
  }
  const ago = (v) => { const ms = G.now() - new Date(v); return ms < 60000 ? 'recién' : 'hace ' + dur(ms); };
  const plural = (n, s, p) => `${n} ${n === 1 ? s : p || s + 's'}`;
  const EST = { nuevo: 'Nuevo', en_curso: 'En curso', en_campo: 'En campo', cerrado: 'Cerrado' };
  const SLA_TXT = { ok: 'En término', riesgo: 'En riesgo', vencido: 'Vencido', cumplido: 'Cumplido', incumplido: 'Fuera de SLA', sin: 'Sin SLA' };
  const loteTxt = (l) => (!l ? 'Sin lote' : 'Lote ' + l);
  const ICON = {
    wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1.3-3.8A8 8 0 1 1 8 19z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 9.5c.5 2 2.2 3.8 4.5 4.6" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
    mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v12H3z M3 6l9 7 9-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  };
  const resueltoPorBot = (c) => c.derivado_central !== 'sí' && G.norm(c.estado) === 'resuelto';
  const idBarrioCaso = (c) => { const s = G.slug(c.barrio); if (!s) return G.SIN_BARRIO.id; const b = S.barrios.find((x) => x.id === s || (x.alias || []).includes(s)); return b ? b.id : s; };

  /* ── alcance (multi-tenant): qué ve cada rol ── */
  const me = () => G.persona(ui.rol) || G.DIR;
  function barriosRol() {
    const p = me();
    if (p.rol === 'direccion') return [...S.barrios.map((b) => b.id), G.SIN_BARRIO.id];
    if (p.rol === 'operador') return (p.barrios || []).slice();
    return [];
  }
  const enAlcance = (bid) => barriosRol().includes(bid) && (ui.barrio === '*' || ui.barrio === bid);
  function vis(t) { const p = me(); return p.rol === 'tecnico' ? t.asignado === p.id : enAlcance(t.barrio); }
  const visEnc = (e) => me().rol !== 'tecnico' && enAlcance(e.barrio);
  const barriosVis = () => S.barrios.filter((b) => enAlcance(b.id));
  const puede = (accion) => {
    const r = me().rol;
    return { gestionar: r !== 'tecnico', configurar: r === 'direccion', reasignarBarrio: r === 'direccion', campo: r === 'tecnico' }[accion];
  };
  const quienSoy = () => (me().rol === 'direccion' ? 'Dirección' : `${me().nombre} (${G.ROL_TXT[me().rol]})`);

  /* ── avisos ── */
  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.innerHTML = msg;
    $('#toasts').appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 5200);
  }

  /* ════════ acceso: clave de la central ════════ */
  function gate(modo, msg) {
    document.body.classList.add('locked');
    cerrarFicha(); cerrarModal();
    $('#view').innerHTML = ''; $('#tabs').innerHTML = ''; $('#scope').innerHTML = ''; $('#role').innerHTML = '';
    const g = $('#gate');
    g.hidden = false;
    const err = msg ? `<p class="gerr" role="alert">${esc(msg)}</p>` : '';
    const head = (h, p) => `<span class="eyebrow">Central SILA</span><h1>${h}</h1>${p ? `<p class="sub">${p}</p>` : ''}`;
    let body;
    if (modo === 'sinBackend') body = `${head('Falta conectar el backend', 'La central no muestra nada hasta tener de dónde leer los casos del chat.')}
      <p class="mini">Completá <code>js/config.js → ayuda.backendUrl</code> con la URL <code>/exec</code> del Apps Script publicado.</p>`;
    else if (modo === 'sinRed') body = `${head('Sin conexión con el backend', 'No se pudo consultar el estado de la central.')}${err}
      <button type="button" class="primary cut" data-g="reintentar">Reintentar</button>`;
    else if (modo === 'cargando') body = `${head('Conectando…')}<p class="mini">Consultando el backend.</p>`;
    else if (modo === 'crear') body = `${head('Crear la clave de la central', 'Es la primera vez: la clave protege los casos de los residentes. Se pide una sola vez por PC.')}${err}
      <form data-g="crear" autocomplete="off" novalidate><label>Clave nueva<input type="password" id="gk1" minlength="8" required autocomplete="new-password" placeholder="Mínimo 8 caracteres"></label>
      <label>Repetila<input type="password" id="gk2" minlength="8" required autocomplete="new-password"></label>
      <button type="submit" class="primary cut">Crear clave y entrar</button></form>`;
    else body = `${head('Ingresar clave', 'Clave de la central. Queda guardada en esta PC hasta que toques “Salir”.')}${err}
      <form data-g="ingresar" autocomplete="off" novalidate><label>Clave<input type="password" id="gk1" required autocomplete="current-password"></label>
      <button type="submit" class="primary cut">Entrar</button></form>`;
    g.innerHTML = `<div class="gbox cut">${body}</div>`;
    const f = $('#gk1');
    f && f.focus();
    renderNet();
  }
  const ERR = { clave: 'Clave incorrecta.', bloqueado: 'Demasiados intentos fallidos. Esperá 10 minutos y volvé a probar.', ya_existe: 'Ya hay una clave creada para la central: ingresala.', red: 'Sin conexión con el backend.', corta: 'La clave tiene que tener al menos 8 caracteres.', distintas: 'Las dos claves no coinciden.' };
  async function iniciar(msg) {
    if (!G.url()) return gate('sinBackend');
    if (G.clave()) return entrar();
    gate('cargando');
    try { const j = await G.estado(); gate(j.tieneClave ? 'ingresar' : 'crear', msg); }
    catch (_) { gate('sinRed', ERR.red); }
  }
  function entrar() {
    $('#gate').hidden = true;
    $('#gate').innerHTML = '';
    document.body.classList.remove('locked');
    render();
    G.arrancar();
  }
  async function enviarGate(form) {
    const btn = $('button[type=submit]', form);
    const k1 = $('#gk1').value;
    btn.disabled = true;
    try {
      if (form.dataset.g === 'crear') {
        const k2 = $('#gk2').value;
        if (k1.length < 8) return gate('crear', ERR.corta);
        if (k1 !== k2) return gate('crear', ERR.distintas);
        const j = await G.crearClave(k1);
        if (!j.ok) return gate(j.error === 'ya_existe' ? 'ingresar' : 'crear', ERR[j.error] || 'No se pudo crear la clave.');
        G.guardarClave(k1);
        entrar();
        toast('Clave creada · queda guardada en esta PC');
      } else {
        const j = await G.probarClave(k1);
        if (!j.ok) return gate('ingresar', ERR[j.error] || 'No se pudo entrar.');
        G.guardarClave(k1);
        entrar();
      }
    } catch (_) { gate(form.dataset.g, ERR.red); }
    finally { btn.disabled = false; }
  }

  /* ════════ barra superior ════════ */
  function renderTop() {
    $('#role').innerHTML = G.PERSONAS().map((p) => {
      const bs = p.rol === 'operador' ? ((p.barrios || []).length > 1 ? `${p.barrios.length} barrios` : (p.barrios || []).length ? G.barrio(p.barrios[0]).nombre : 'sin barrios') : '';
      const nom = p.rol === 'direccion' ? 'Dirección (todo)' : `${G.ROL_TXT[p.rol]}${bs ? ' · ' + bs : ''} — ${p.nombre}`;
      return `<option value="${esc(p.id)}" ${p.id === me().id ? 'selected' : ''}>${esc(nom)}</option>`;
    }).join('');
    const p = me();
    let h;
    if (p.rol === 'tecnico') h = '<span class="lock">AISLADO</span> Sólo tickets asignados a vos';
    else {
      const bs = barriosRol();
      if (p.rol === 'operador' && bs.length <= 1) h = `<span class="lock">AISLADO</span> ${bs.length ? esc(G.barrio(bs[0]).nombre) + ' · otros barrios ocultos' : 'Sin barrios asignados'}`;
      else h = `${p.rol === 'operador' ? '<span class="lock">AISLADO</span>' : ''}<select id="tenant" aria-label="Barrio">
        <option value="*">${p.rol === 'direccion' ? 'Todos los barrios' : 'Mis barrios'}</option>
        ${bs.map((b) => `<option value="${esc(b)}" ${ui.barrio === b ? 'selected' : ''}>${esc(G.barrio(b).nombre)}</option>`).join('')}</select>`;
    }
    $('#scope').innerHTML = h;
    renderBell();
  }
  function alertasVis() {
    return S.alertas.filter((a) => {
      if (me().rol === 'tecnico') { const t = S.tickets.find((x) => x.id === a.ticket); return t && vis(t) && a.tipo !== 'detractor'; }
      return a.barrio ? enAlcance(a.barrio) : me().rol === 'direccion';
    });
  }
  function renderBell() {
    const n = alertasVis().filter((a) => !a.leida).length;
    $('#bellN').hidden = !n;
    $('#bellN').textContent = n > 99 ? '99+' : n;
    if (!$('#pop').hidden) renderPop();
  }
  function renderPop() {
    const l = alertasVis().slice(0, 40);
    const TIPO = { a75: ['riesgo', `${G.umbral()} % SLA`], a100: ['vencido', 'Vencido'], nuevo: ['nuevo', 'Nuevo'], detractor: ['det', 'Detractor'] };
    $('#pop').innerHTML = `<header><b>Alertas</b><button type="button" data-a="leer">Marcar leídas</button></header>
      <ol>${l.map((a) => `<li class="${a.leida ? '' : 'unread'}"><button type="button" data-a="al" data-id-al="${esc(a.id)}" data-t="${esc(a.ticket || '')}" data-k="${esc(a.tipo)}">
        <span class="k k-${(TIPO[a.tipo] || TIPO.nuevo)[0]}">${(TIPO[a.tipo] || TIPO.nuevo)[1]}</span><span class="tx">${esc(a.txt)}</span><small>${fdt(a.t)} · ${ago(a.t)}</small></button></li>`).join('') || '<li class="none">Sin alertas en tu alcance.</li>'}</ol>
      <p class="note">Avisos internos de la central · los avisos a operadores y supervisores son SIMULADOS.</p>`;
  }
  function renderNet() {
    const el = $('#net');
    if (!G.url()) { el.className = 'net off'; el.innerHTML = '<i></i><span>Sin backend</span>'; return; }
    const pend = G.pendientes();
    if (G.net.ok === false) { el.className = 'net off'; el.innerHTML = `<i></i><span>Sin conexión${pend ? ` · ${pend} cambio${pend === 1 ? '' : 's'} sin guardar` : ''}</span>`; return; }
    if (!G.net.t) { el.className = 'net wait'; el.innerHTML = '<i></i><span>Conectando…</span>'; return; }
    const s = Math.max(0, Math.round((Date.now() - G.net.t) / 1000));
    el.className = 'net on';
    el.innerHTML = `<i></i><span>Conectado · <span class="nx">actualizado </span>hace ${s < 60 ? s + ' s' : dur(s * 1000)}${pend ? ' · guardando…' : ''}</span>`;
  }

  /* ════════ pestañas ════════ */
  const TABS = [
    ['tickets', 'Tickets', 'M4 6h16M4 12h16M4 18h10'],
    ['lotes', 'Lotes', 'M4 20V9l8-5 8 5v11zM9 20v-6h6v6'],
    ['exp', 'Experiencia', 'M5 5h14v10H9l-4 4z M9 10h.01M12 10h.01M15 10h.01'],
    ['rep', 'Reputación', 'M12 3l2.7 5.6 6.1.8-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1L3.2 9.4l6.1-.8z'],
    ['sla', 'Config.', 'M12 7v5l3 2M12 3a9 9 0 1 0 .01 0'],
  ];
  const tabsRol = () => (me().rol === 'tecnico' ? ['tickets'] : TABS.map((t) => t[0]));
  function renderTabs() {
    if (!tabsRol().includes(ui.vista)) ui.vista = 'tickets';
    const det = S.enc.filter((e) => visEnc(e) && e.recup && e.recup.estado === 'abierta').length;
    $('#tabs').innerHTML = TABS.filter((t) => tabsRol().includes(t[0])).map(([id, txt, d]) => {
      const lbl = me().rol === 'tecnico' && id === 'tickets' ? 'Mis visitas' : txt;
      const badge = id === 'exp' && det ? `<i class="bd">${det}</i>` : id === 'sla' && !G.cats().length && puede('configurar') ? '<i class="bd warn">!</i>' : '';
      return `<button type="button" role="tab" data-v="${id}" class="${ui.vista === id ? 'on' : ''}" aria-selected="${ui.vista === id}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${lbl}</span>${badge}</button>`;
    }).join('');
  }

  /* ════════ vista: tickets ════════ */
  function slaCell(t) {
    const s = G.sla(t);
    const w = Math.min(100, s.pct * 100);
    const rem = s.st === 'sin' ? (t.estado === 'cerrado' ? `en ${dur(s.el)}` : 'categorizar') : t.estado === 'cerrado' ? `en ${dur(+new Date(t.cerrado) - +new Date(t.creado))}` : s.rest >= 0 ? `quedan ${dur(s.rest)}` : `+${dur(s.rest)}`;
    return `<div class="sla s-${s.st}" data-sla="${t.id}">
      <i class="lamp" aria-hidden="true"></i>
      <div class="fuse" title="${G.umbral()} % del SLA = alerta automática"><b style="width:${w.toFixed(1)}%"></b>${s.st === 'sin' ? '' : `<u style="left:${G.umbral()}%"></u>`}</div>
      <span class="st">${SLA_TXT[s.st]}</span><span class="rem">${rem}</span></div>`;
  }
  const quienTxt = (t) => esc(t.reporta.nombre) + (t.reporta.rol ? ' · ' + esc(t.reporta.rol) : '') + ' · chat';
  function rowT(t) {
    const hijos = S.tickets.filter((x) => x.vinculado === t.id && vis(x)).length;
    const tp = t.asignado && G.persona(t.asignado);
    return `<article class="tk ${t.estado === 'cerrado' ? 'closed' : ''} ${fresh.has(t.id) ? 'fresh' : ''} ${t.vinculado ? 'linked' : ''}" data-id="${t.id}" tabindex="0" role="button" aria-label="${esc(t.id + ' ' + t.titulo)}">
      ${slaCell(t)}
      <div class="m"><span class="id">${t.id}${t.vinculado ? `<em class="o-link">↳ ${t.vinculado}</em>` : ''}</span>
        <b>${esc(t.titulo)}</b>
        <small>${quienTxt(t)}</small></div>
      <div class="w"><b>${esc(G.barrio(t.barrio).nombre)}</b><small>${esc(loteTxt(t.lote))}${hijos ? ` · <span class="more">+${hijos} reporte${hijos > 1 ? 's' : ''}</span>` : ''}</small></div>
      <div class="c">${esc(G.cat(t.cat).nombre)}<small>${t.cat ? 'SLA ' + G.cat(t.cat).h + ' h' : 'sin plazo'}</small></div>
      <div class="a">${esc(tp ? tp.nombre : '—')}</div>
      <div class="e"><span class="chip e-${t.estado}">${EST[t.estado]}</span></div>
    </article>`;
  }
  function vTickets() {
    const all = S.tickets.filter(vis);
    const open = all.filter((t) => t.estado !== 'cerrado');
    const ss = new Map(all.map((t) => [t.id, G.sla(t)]));
    const riesgo = open.filter((t) => ss.get(t.id).st === 'riesgo');
    const venc = open.filter((t) => ss.get(t.id).st === 'vencido');
    const c30 = all.filter((t) => t.estado === 'cerrado' && G.now() - new Date(t.cerrado) < 30 * G.D && ss.get(t.id).st !== 'sin');
    const cumpl = c30.length ? Math.round((c30.filter((t) => ss.get(t.id).st === 'cumplido').length / c30.length) * 100) : null;
    const F = { abiertos: open, riesgo, vencidos: venc, cerrados: all.filter((t) => t.estado === 'cerrado') };
    if (!F[ui.filtro]) ui.filtro = 'abiertos';
    const q = G.norm(ui.q);
    let list = F[ui.filtro].filter((t) => (!ui.cat || t.cat === ui.cat || (ui.cat === '_sin' && !t.cat)) && (!q || G.norm([t.id, t.titulo, t.reporta.nombre, t.lote, G.barrio(t.barrio).nombre, t.caso_id].join(' ')).includes(q)));
    if (ui.filtro === 'cerrados') list = list.sort((a, b) => (a.cerrado < b.cerrado ? 1 : -1)).slice(0, 80);
    else list = list.sort((a, b) => (ss.get(b.id).st === 'sin') - (ss.get(a.id).st === 'sin') || ss.get(b.id).pct - ss.get(a.id).pct);
    const casos = S.casos;
    const der = casos.filter((c) => c.derivado_central === 'sí').length;
    const tec = me().rol === 'tecnico';
    const sinCat = open.filter((t) => !t.cat).length;
    const vacio = !S.tickets.length
      ? `<div class="empty"><b>Todavía no entró ningún caso derivado por el chat.</b><br>Cuando el bot derive uno a la central, aparece acá solo, con su contexto.${casos.length ? `<br><span class="mini">${plural(casos.length, 'caso')} en el chat, ninguno derivado.</span>` : ''}</div>`
      : `<p class="empty">${tec ? 'No tenés visitas asignadas.' : 'No hay tickets con este filtro.'}</p>`;
    return `
      ${!G.cats().length && !tec ? `<div class="banner cut"><b>Sin categorías de SLA</b><span>El semáforo no corre hasta que Dirección cargue las categorías y sus plazos.</span>${puede('configurar') ? '<button type="button" class="ghost sm" data-v2="sla">Ir a Config.</button>' : ''}</div>` : ''}
      <section class="kpis">
        <div class="kpi cut"><span>${tec ? 'Mis visitas abiertas' : 'Abiertos'}</span><b>${open.length}</b><small>${open.filter((t) => t.estado === 'nuevo').length} sin tomar${sinCat ? ` · ${sinCat} sin categoría` : ''}</small></div>
        <div class="kpi cut k-riesgo"><span>En riesgo · ≥ ${G.umbral()} %</span><b>${riesgo.length}</b><small>alerta automática</small></div>
        <div class="kpi cut k-vencido"><span>Vencidos</span><b>${venc.length}</b><small>escalados a Dirección</small></div>
        <div class="kpi cut"><span>SLA cumplido · 30 d</span><b>${cumpl == null ? '—' : cumpl + ' %'}</b><small>${plural(c30.length, 'cerrado')}</small></div>
      </section>
      <div class="live"><i></i>EN VIVO · ${tec ? 'tickets asignados a vos' : `conectado al chat · ${plural(casos.length, 'caso')} · ${der} derivado${der === 1 ? '' : 's'} a la central`}</div>
      <div class="filters">
        <div class="seg" role="group" aria-label="Filtro">
          ${[['abiertos', 'Abiertos', open.length], ['riesgo', 'En riesgo', riesgo.length], ['vencidos', 'Vencidos', venc.length], ['cerrados', 'Cerrados', F.cerrados.length]]
            .map(([k, l, n]) => `<button type="button" data-f="${k}" class="${ui.filtro === k ? 'on' : ''} f-${k}">${l} <i>${n}</i></button>`).join('')}
        </div>
        <select id="fcat" aria-label="Categoría"><option value="">Todas las categorías</option>${G.cats().map((c) => `<option value="${esc(c.id)}" ${ui.cat === c.id ? 'selected' : ''}>${esc(c.nombre)} · ${c.h} h</option>`).join('')}<option value="_sin" ${ui.cat === '_sin' ? 'selected' : ''}>Sin categoría</option></select>
        <input id="fq" type="search" placeholder="Buscar ticket, lote, vecino…" value="${esc(ui.q)}" aria-label="Buscar">
      </div>
      <div class="grid" role="list">
        <div class="gh" aria-hidden="true"><span>Semáforo SLA</span><span>Ticket</span><span>Barrio · lote</span><span>Categoría</span><span>Técnico</span><span>Estado</span></div>
        ${list.map(rowT).join('') || vacio}
      </div>`;
  }
  // el semáforo se actualiza segundo a segundo sin redibujar la grilla
  function tickSLA() {
    $$('[data-sla]').forEach((el) => {
      const t = S.tickets.find((x) => x.id === el.dataset.sla);
      if (!t || t.estado === 'cerrado') return;
      const s = G.sla(t);
      if (s.st === 'sin') return;
      el.className = 'sla s-' + s.st + (el.classList.contains('big') ? ' big' : '');
      $('.fuse b', el).style.width = Math.min(100, s.pct * 100).toFixed(1) + '%';
      $('.st', el).textContent = SLA_TXT[s.st];
      $('.rem', el).textContent = s.rest >= 0 ? `quedan ${dur(s.rest)}` : `+${dur(s.rest)}`;
    });
  }

  /* ════════ ficha del ticket ════════ */
  function dTicket(t) {
    const s = G.sla(t);
    const c = G.cat(t.cat);
    const mismos = S.tickets.filter((x) => x !== t && vis(x) && t.lote && G.loteKey(x) === G.loteKey(t));
    const enc = t.encuesta && S.enc.find((e) => e.id === t.encuesta);
    const tecs = S.equipo.filter((p) => p.rol === 'tecnico');
    const gest = puede('gestionar') && t.estado !== 'cerrado';
    const x = t.ctx;
    return `
      <div class="dh">
        <div class="r1"><span class="id">${t.id}${t.caso_id ? ` · caso ${esc(t.caso_id)}` : ''}</span><button type="button" class="x" data-a="cerrarFicha" aria-label="Cerrar ficha">✕</button></div>
        <h2>${esc(t.titulo)}</h2>
        <div class="tags"><span class="chip e-${t.estado}">${EST[t.estado]}</span><span class="chip">${esc(G.barrio(t.barrio).nombre)} · ${esc(loteTxt(t.lote))}</span><span class="chip">Chat SILA</span></div>
      </div>
      <div class="db">
        <section class="slabox cut s-${s.st}">
          ${slaCell(t).replace('class="sla ', 'class="sla big ')}
          ${s.st === 'sin' ? `<p class="mini">Sin categoría: no hay plazo que medir. ${puede('gestionar') && t.estado !== 'cerrado' ? 'Elegí una categoría abajo y el semáforo arranca desde que entró el caso.' : ''}</p>`
            : `<dl><div><dt>Categoría</dt><dd>${esc(c.nombre)} · ${c.h} h</dd></div>
            <div><dt>Entró</dt><dd>${fdt(t.creado)}</dd></div>
            <div><dt>Alerta ${G.umbral()} %</dt><dd>${fdt(s.aviso)}${t.alertas && t.alertas.a75 ? ' · enviada' : ''}</dd></div>
            <div><dt>Vence</dt><dd>${fdt(s.limite)}</dd></div></dl>`}
        </section>
        ${x ? `<h4>Contexto que trajo el bot <span class="mini">no se le volvió a pedir nada al residente</span></h4>
          <div class="ctx cut">
            <p class="q">“${esc(x.consulta)}”</p>
            ${x.aclaraciones ? `<p><span>Aclaraciones</span>${esc(x.aclaraciones)}</p>` : ''}
            ${x.modulo ? `<p><span>Módulo</span>${esc(x.modulo)}</p>` : ''}
            ${x.fuentes ? `<p><span>Fuentes citadas</span>${esc(x.fuentes)}</p>` : ''}
            <p><span>Pasos que ya intentó</span></p><pre>${esc(x.pasos || '— El bot no encontró una solución documentada.')}</pre>
            ${x.resultado ? `<p><span>Resultado informado</span>${esc(x.resultado)}</p>` : ''}
            ${x.estado_bot ? `<p><span>Estado en el chat</span>${esc(x.estado_bot)}</p>` : ''}
          </div>` : ''}
        <h4>Quién reporta</h4>
        <dl class="kv"><dt>Nombre</dt><dd>${esc(t.reporta.nombre)}</dd>
          <dt>Celular</dt><dd>${esc(t.reporta.cel || '—')}</dd><dt>Correo</dt><dd>${esc(t.reporta.correo || '—')}</dd>
          <dt>Barrio informado</dt><dd>${t.barrio_txt ? '“' + esc(t.barrio_txt) + '”' : '—'}</dd></dl>
        ${t.lote ? `<button type="button" class="link" data-a="verLote" data-k="${esc(G.loteKey(t))}">Historial de ${esc(loteTxt(t.lote))} · ${plural(mismos.length + 1, 'reporte')} →</button>` : ''}
        ${gest ? `<h4>Gestión</h4>
          <div class="estados">${['nuevo', 'en_curso', 'en_campo'].map((e) => `<button type="button" data-a="estado" data-k="${e}" class="${t.estado === e ? 'on' : ''}">${EST[e]}</button>`).join('')}</div>
          <div class="form2">
            <label>Técnico de campo<select data-a="asignar"><option value="">${tecs.length ? 'Sin asignar' : 'Sin técnicos cargados'}</option>${tecs.map((p) => `<option value="${esc(p.id)}" ${t.asignado === p.id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></label>
            <label>Categoría (define el SLA)<select data-a="cat"><option value="" ${t.cat ? '' : 'selected'}>Sin categoría</option>${G.cats().map((k) => `<option value="${esc(k.id)}" ${t.cat === k.id ? 'selected' : ''}>${esc(k.nombre)} · ${k.h} h</option>`).join('')}</select></label>
            ${puede('reasignarBarrio') ? `<label>Barrio<select data-a="barrio">${[...S.barrios, G.SIN_BARRIO].map((b) => `<option value="${esc(b.id)}" ${t.barrio === b.id ? 'selected' : ''}>${esc(b.nombre)}</option>`).join('')}</select></label>` : ''}
          </div>` : ''}
        ${puede('campo') && t.estado !== 'cerrado' ? `<h4>En campo</h4><div class="estados"><button type="button" data-a="estado" data-k="en_campo" class="${t.estado === 'en_campo' ? 'on' : ''}">Llegué al lugar</button></div>` : ''}
        ${t.estado !== 'cerrado' ? `<div class="nota"><input id="nota" placeholder="Agregar nota a la bitácora…" maxlength="300"><button type="button" data-a="nota">Agregar</button></div>
          <button type="button" class="primary cut" data-a="cerrar">${puede('campo') ? 'Resuelto en campo · cerrar' : 'Cerrar ticket'} y enviar encuesta</button>` : ''}
        ${enc ? `<h4>Encuesta de experiencia</h4><div class="encbox cut">${encResumen(enc)}</div>` : ''}
        <h4>Bitácora</h4>
        <ol class="tl">${(t.eventos || []).slice().reverse().map((e) => `<li><small>${fdt(e.t)} · ${esc(e.quien)}</small>${esc(e.txt)}</li>`).join('')}</ol>
      </div>`;
  }
  function encResumen(e) {
    const cl = G.CLASE(e.nps);
    return `<div class="er"><span class="canal c-${e.canal}">${e.canal === 'email' ? ICON.mail + 'Email formal' : ICON.wa + 'WhatsApp'}</span><span class="simtag">SIMULADO</span></div>
      <p>Enviada a <b>${esc(e.para)}</b> el ${fdt(e.enviado)}${e.motivo ? ` · ${esc(e.motivo)}` : ''}.</p>
      ${e.estado === 'respondida' ? `<p class="npsline"><span class="nps n-${cl}">NPS ${e.nps}</span><span>CSAT ${e.csat}/5</span><span class="mini">${cl}</span></p>${e.comentario ? `<p class="com">“${esc(e.comentario)}”</p>` : ''}`
        : `<p class="mini">Sin respuesta todavía.</p><button type="button" class="ghost" data-a="responder" data-k="${esc(e.id)}">Simular respuesta del residente</button>`}`;
  }

  function abrirFicha(id) {
    const t = S.tickets.find((x) => x.id === id);
    if (!t || !vis(t)) return;
    openId = id;
    const d = $('#drawer');
    d.innerHTML = dTicket(t);
    d.classList.add('open');
    d.setAttribute('aria-hidden', 'false');
    $('#scrim').classList.add('show');
  }
  function cerrarFicha() {
    openId = null;
    $('#drawer').classList.remove('open');
    $('#drawer').setAttribute('aria-hidden', 'true');
    $('#scrim').classList.remove('show');
  }
  function refreshFicha() {
    if (!openId) return;
    if (!S.tickets.some((x) => x.id === openId)) return cerrarFicha();
    const sc = $('#drawer').scrollTop; const nota = $('#nota') ? $('#nota').value : '';
    abrirFicha(openId);
    $('#drawer').scrollTop = sc; if ($('#nota')) $('#nota').value = nota;
  }

  function accionFicha(a, k, val) {
    const id = openId;
    const t = S.tickets.find((x) => x.id === id);
    if (!t) return;
    const quien = quienSoy();
    if (a === 'estado' && t.estado !== k) {
      G.tk(id, (x) => { if (x.estado === 'cerrado' || x.estado === k) return; G.evento(x, `Estado: ${EST[x.estado]} → ${EST[k]}`, quien); x.estado = k; });
    } else if (a === 'asignar') {
      const p = val && G.persona(val);
      G.tk(id, (x) => {
        x.asignado = val || null;
        G.evento(x, p ? `Asignado a ${p.nombre} · aviso SIMULADO al técnico` : 'Sin técnico asignado', quien);
        if (p && x.estado === 'nuevo') x.estado = 'en_curso';
      });
    } else if (a === 'cat') {
      const prev = G.cat(t.cat), nueva = G.cat(val);
      const u = G.umbral() / 100;
      G.tk(id, (x) => {
        x.cat = val;
        const s = G.sla(x);
        x.alertas = x.alertas || {};
        if (s.st === 'sin' || s.pct < u) delete x.alertas.a75;
        if (s.st === 'sin' || s.pct < 1) delete x.alertas.a100;
        G.evento(x, `Categoría: ${prev.nombre}${prev.h ? ` (${prev.h} h)` : ''} → ${nueva.nombre}${nueva.h ? ` (${nueva.h} h)` : ''} · SLA recalculado`, quien);
      });
    } else if (a === 'barrio') {
      const de = G.barrio(t.barrio).nombre, a2 = G.barrio(val).nombre;
      G.tk(id, (x) => { G.evento(x, `Barrio reasignado: ${de} → ${a2}`, quien); x.barrio = val; });
    } else if (a === 'nota') {
      const v = $('#nota').value.trim();
      if (!v) return;
      $('#nota').value = '';
      G.tk(id, (x) => G.evento(x, v, quien));
    } else return;
    render();
    refreshFicha();
  }

  /* ════════ cierre → encuesta ════════ */
  function modal(html) {
    const m = $('#modal');
    m.innerHTML = `<div class="mbox cut">${html}</div>`;
    m.hidden = false;
    const f = m.querySelector('button, input, textarea');
    f && f.focus();
  }
  const cerrarModal = () => { $('#modal').hidden = true; $('#modal').innerHTML = ''; };

  function modalCerrar(t) {
    if (!t) return;
    const tecnico = puede('campo');
    const vinc = S.tickets.filter((x) => x.vinculado === t.id && x.estado !== 'cerrado').length;
    modal(`<h3>Cerrar ${t.id}</h3><p class="sub">${esc(t.titulo)}${vinc ? ` · se cierran también ${plural(vinc, 'reporte vinculado', 'reportes vinculados')}` : ''}</p>
      <fieldset class="who-res"><legend>¿Quién lo resolvió?</legend>
        <label><input type="radio" name="rp" value="persona" checked><span><b>Una persona</b> (operador o técnico)<small>${ICON.mail} Encuesta por <b>email formal</b> a ${esc(t.reporta.correo || 'sin correo → WhatsApp')}</small></span></label>
        ${tecnico ? '' : `<label><input type="radio" name="rp" value="bot"><span><b>El bot SILA</b> en el chat (Filtro Cero)<small>${ICON.wa} Encuesta por <b>WhatsApp</b> en el mismo chat</small></span></label>`}
      </fieldset>
      <label class="ta">Nota de cierre<textarea id="ncierre" rows="2" maxlength="300" placeholder="Qué se hizo"></textarea></label>
      <p class="mini">El caso del chat queda marcado como resuelto.</p>
      <div class="mact"><button type="button" class="ghost" data-m="cancel">Cancelar</button><button type="button" class="primary cut" data-m="close" data-k="${t.id}">Cerrar y enviar encuesta</button></div>`);
  }
  function cerrarTicket(id) {
    const rp = ($('#modal input[name=rp]:checked') || {}).value || 'persona';
    const nota = (($('#ncierre') || {}).value || '').trim();
    const e = G.cerrar(id, rp, nota, quienSoy());
    if (!e) { cerrarModal(); return; }
    render();
    refreshFicha();
    modalMensaje(e, S.tickets.find((x) => x.id === id));
  }
  function mensaje(e, t, tipo) {
    const b = G.barrio(e.barrio);
    const nom = (e.nombre || '').split(' ')[0];
    const g = b.google && b.google.url;
    const link = tipo === 'resena' ? (g || 'perfil de Google sin cargar') : `encuesta.silicon-access/${e.id}`;
    if (e.canal === 'whatsapp') {
      const txt = tipo === 'resena'
        ? `¡Gracias por tu ${e.nps}, ${esc(nom)}! Si tenés un minuto, ¿nos dejás tu reseña de ${esc(b.nombre)} en Google? Nos ayuda muchísimo.`
        : `Listo, ${esc(nom)}: ${e.ticket ? `tu caso ${esc(e.ticket)}` : 'tu consulta'} quedó resuelt${e.ticket ? 'o' : 'a'}. ¿Nos contás cómo te atendimos? Son 2 preguntas.`;
      return `<div class="wa-msg"><div class="wa-head">${ICON.wa}<span>Silicon Access · WhatsApp</span><span class="to">${esc(e.para)}</span></div>
        <div class="bubble">${txt}<span class="lnk">${esc(link)}</span><small>${fhm(G.now())} ✓✓</small></div></div>`;
    }
    return `<div class="mail-msg"><div class="mh"><p><span>Para</span>${esc(e.nombre)} &lt;${esc(e.para)}&gt;</p>
      <p><span>Asunto</span>${tipo === 'resena' ? `Su opinión sobre ${esc(b.nombre)} en Google` : `Su caso ${esc(e.ticket)} fue resuelto · ¿Cómo lo atendimos?`}</p></div>
      <div class="mb"><p>Estimada/o ${esc(e.nombre)}:</p>
      ${tipo === 'resena' ? `<p>Gracias por su valoración. Si lo desea, puede publicar su opinión sobre el servicio de acceso de ${esc(b.nombre)} en Google:</p>`
        : `<p>Le informamos que el caso <b>${esc(e.ticket)}</b>${t ? ` («${esc(t.titulo)}»)` : ''}${e.lote ? `, correspondiente al ${esc(loteTxt(e.lote).toLowerCase())}` : ''} de ${esc(b.nombre)}, fue resuelto el ${fdt(G.now())}.</p>
      <p>Su opinión nos ayuda a mejorar. Responder la encuesta lleva menos de un minuto:</p>`}
      <p class="btnl">${tipo === 'resena' ? 'Dejar reseña' : 'Responder encuesta'} · <u>${esc(link)}</u></p>
      <p>Atentamente,<br>Equipo de Atención · Silicon Access</p></div></div>`;
  }
  function formRespuesta(e) {
    return `<div class="resp cut"><h4>Respuesta del residente <span class="simtag">SIMULADA</span></h4>
      <p class="mini">En producción la carga el residente desde el link. Acá la elegís vos para ver el efecto.</p>
      <div class="lbl">¿Qué tan probable es que nos recomiende? (NPS 0–10)</div>
      <div class="npspick" role="radiogroup">${Array.from({ length: 11 }, (_, i) => `<button type="button" data-nps="${i}" class="n-${G.CLASE(i)}">${i}</button>`).join('')}</div>
      <div class="lbl">¿Qué tan satisfecho quedó con la atención? (CSAT 1–5)</div>
      <div class="csatpick" role="radiogroup">${[1, 2, 3, 4, 5].map((i) => `<button type="button" data-csat="${i}">${i}</button>`).join('')}</div>
      <input id="rcom" placeholder="Comentario (opcional)" maxlength="200">
      <div class="mact"><button type="button" class="ghost" data-m="cancel">Más tarde</button><button type="button" class="primary cut" data-m="resp" data-k="${esc(e.id)}" disabled>Guardar respuesta</button></div></div>`;
  }
  function modalMensaje(e, t) {
    modal(`<div class="stamp">SIMULADO · no se envió nada</div>
      <h3>Encuesta enviada por ${e.canal === 'email' ? 'email formal' : 'WhatsApp'}</h3>
      <p class="sub">${e.canal === 'email' ? 'Resolvió una persona → email formal a quien abrió el caso.' : e.motivo ? 'Sin correo registrado → por WhatsApp.' : 'Resolvió el bot → el link llega en el mismo chat de WhatsApp.'}</p>
      ${mensaje(e, t)}
      ${formRespuesta(e)}`);
  }
  function modalResponder(id) {
    const e = S.enc.find((x) => x.id === id);
    if (!e) return;
    modal(`<h3>Encuesta ${esc(e.id)}</h3><p class="sub">${esc(e.nombre)} · ${esc(G.barrio(e.barrio).nombre)} · ${e.ticket ? 'ticket ' + esc(e.ticket) : 'resuelto por el bot en el chat'}</p>${formRespuesta(e)}`);
  }
  function guardarRespuesta(id) {
    const nps = +($('#modal .npspick .on') || {}).dataset?.nps;
    const csat = +($('#modal .csatpick .on') || {}).dataset?.csat;
    if (Number.isNaN(nps) || Number.isNaN(csat)) return;
    const e = S.enc.find((x) => x.id === id);
    const cl = G.responder(id, nps, csat, $('#rcom').value.trim());
    if (!cl) return;
    render();
    refreshFicha();
    if (cl === 'detractor') {
      modal(`<div class="stamp bad">ALERTA DE DETRACTOR</div><h3>${esc(e.nombre)} puso ${nps}</h3>
        <p class="sub">Se abrió el protocolo de recuperación: llamar antes de 24 h, revisar la causa, ofrecer una acción y re-encuestar a los 7 días.</p>
        <div class="mact"><button type="button" class="ghost" data-m="cancel">Cerrar</button><button type="button" class="primary cut" data-m="goexp">Ver protocolo</button></div>`);
    } else if (cl === 'promotor') {
      modal(`<div class="stamp ok">PROMOTOR</div><h3>${esc(e.nombre)} puso ${nps}</h3>
        <p class="sub">Es el momento de pedirle la reseña de Google de ${esc(G.barrio(e.barrio).nombre)}.</p>
        <div class="mact"><button type="button" class="ghost" data-m="cancel">Ahora no</button><button type="button" class="primary cut" data-m="resena" data-k="${esc(e.id)}">Pedir reseña (simulado)</button></div>`);
    } else { cerrarModal(); toast(`Respuesta registrada: NPS ${nps} · ${cl}`); }
  }
  function pedirResena(id, silencioso) {
    const e = S.enc.find((x) => x.id === id);
    if (!e) return;
    G.pedirResena(id);
    render();
    if (!silencioso) modal(`<div class="stamp">SIMULADO · no se envió nada</div><h3>Pedido de reseña · ${esc(G.barrio(e.barrio).nombre)}</h3>${mensaje(e, S.tickets.find((x) => x.id === e.ticket), 'resena')}
      <div class="mact"><button type="button" class="primary cut" data-m="cancel">Listo</button></div>`);
  }

  /* ════════ vista: lotes (historial consolidado, sólo con lo que entró) ════════ */
  function lotesDe(bid) {
    const m = new Map();
    const lote = (lt) => { const k = G.loteKey({ barrio: bid, lote: lt }); if (!m.has(k)) m.set(k, { barrio: bid, lote: lt, usuarios: [], tickets: [], chat: [] }); return m.get(k); };
    const usuario = (L, n, extra) => { if (n && !L.usuarios.some((u) => G.norm(u.n) === G.norm(n))) L.usuarios.push({ n, r: extra }); };
    S.tickets.filter((t) => t.barrio === bid && t.lote && vis(t)).forEach((t) => { const L = lote(t.lote); L.tickets.push(t); usuario(L, t.reporta.nombre, 'reportó por el chat'); });
    S.casos.filter((c) => c.lote && c.derivado_central !== 'sí' && idBarrioCaso(c) === bid).forEach((c) => { const L = lote(String(c.lote).trim()); L.chat.push(c); usuario(L, c.residente, 'consultó al bot'); });
    const ab = (L) => L.tickets.filter((t) => t.estado !== 'cerrado').length;
    return [...m.values()].sort((a, b) => ab(b) - ab(a) || b.tickets.length + b.chat.length - a.tickets.length - a.chat.length);
  }
  function vLotes() {
    const bs = barriosVis();
    if (!bs.length) return `<p class="empty">${S.barrios.length ? 'Elegí un barrio.' : 'Todavía no hay barrios: aparecen solos cuando un residente los informa en el chat.'}</p>`;
    let todos = bs.flatMap((b) => lotesDe(b.id));
    if (!todos.length) return '<p class="empty">Todavía no hay lotes: salen de los casos del chat que informan número de lote.</p>';
    const q = G.norm(ui.q);
    if (q) todos = todos.filter((L) => G.norm([L.lote, G.barrio(L.barrio).nombre, ...L.usuarios.map((u) => u.n)].join(' ')).includes(q));
    if (!ui.lote || !todos.some((L) => G.loteKey(L) === ui.lote)) ui.lote = todos[0] ? G.loteKey(todos[0]) : null;
    const L = todos.find((x) => G.loteKey(x) === ui.lote);
    return `<div class="lotes">
      <aside class="llist cut">
        <input id="fq" type="search" placeholder="Buscar lote o vecino…" value="${esc(ui.q)}" aria-label="Buscar lote">
        <ol>${todos.map((x) => {
          const ab = x.tickets.filter((t) => t.estado !== 'cerrado').length;
          return `<li><button type="button" data-lote="${esc(G.loteKey(x))}" class="${G.loteKey(x) === ui.lote ? 'on' : ''}">
            <b>${esc(loteTxt(x.lote))}</b><small>${esc(G.barrio(x.barrio).nombre)} · ${plural(x.usuarios.length, 'usuario')}</small>
            <span class="cnt">${x.tickets.length + x.chat.length}${ab ? `<i>${ab} abiertos</i>` : ''}</span></button></li>`;
        }).join('')}</ol>
      </aside>
      <section class="ldet">${L ? loteDetalle(L) : '<p class="empty">Sin lotes con ese filtro.</p>'}</section></div>`;
  }
  function loteDetalle(L) {
    const ts = L.tickets.slice().sort((a, b) => (a.creado < b.creado ? 1 : -1));
    const items = [];
    ts.forEach((t) => (t.eventos || []).forEach((e, i) => { if (i === 0 || /Cerrado|Asignado|Encuesta respondida|Vinculado|Alerta|vencido/i.test(e.txt)) items.push({ t: e.t, txt: e.txt, tk: t, first: i === 0 }); }));
    L.chat.forEach((c) => items.push({ t: c.actualizado || c.creado, chat: c }));
    items.sort((a, b) => (a.t < b.t ? 1 : -1));
    return `<header class="lh"><div><span class="eyebrow">Historial consolidado</span><h2>${esc(G.barrio(L.barrio).nombre)} · ${esc(loteTxt(L.lote))}</h2>
        <p class="mini">${plural(ts.length, 'ticket')} · ${plural(L.chat.length, 'consulta resuelta', 'consultas resueltas')} o en curso en el chat · ${plural(L.usuarios.length, 'persona')} de la misma propiedad</p></div></header>
      <div class="users">${L.usuarios.map((u) => `<span class="u"><b>${esc(u.n)}</b><small>${esc(u.r)}</small></span>`).join('')}</div>
      <h4>Tickets del lote</h4>
      <div class="ltk">${ts.map((t) => `<button type="button" class="lt ${t.vinculado ? 'linked' : ''}" data-open="${t.id}"><span class="chip e-${t.estado}">${EST[t.estado]}</span><b>${t.id}</b><span class="tt">${esc(t.titulo)}</span><small>${esc(t.reporta.nombre)} · ${fdt(t.creado)}${t.vinculado ? ' · vinculado a ' + t.vinculado : ''}</small></button>`).join('') || '<p class="mini">Ningún caso de este lote llegó a la central.</p>'}</div>
      <h4>Línea de tiempo</h4>
      <ol class="tl lt2">${items.slice(0, 60).map((i) => i.chat
        ? `<li class="rep"><small>${fdt(i.t)} · ${esc(i.chat.caso_id)} · ${esc(i.chat.residente || 'Residente')} en el chat</small><b>${resueltoPorBot(i.chat) ? 'Resuelto por el bot:' : 'Consulta en el chat:'}</b> ${esc(String(i.chat.consulta || '').slice(0, 120))}</li>`
        : `<li class="${i.first ? 'rep' : ''}"><small>${fdt(i.t)} · <button type="button" class="tkl" data-open="${i.tk.id}">${i.tk.id}</button>${i.first ? ' · ' + esc(i.tk.reporta.nombre) + ' por el chat' : ''}</small>${i.first ? '<b>Reporte:</b> ' + esc(i.tk.titulo) : esc(i.txt)}</li>`).join('')}</ol>`;
  }

  /* ════════ vista: experiencia ════════ */
  const PASOS = ['Llamar al residente antes de 24 h', 'Revisar la causa en la bitácora del ticket', 'Ofrecer una acción concreta (visita, seguimiento)', 'Re-encuestar a los 7 días'];
  function npsDe(l) {
    const r = l.filter((e) => e.estado === 'respondida');
    if (!r.length) return null;
    const p = r.filter((e) => e.nps >= 9).length, d = r.filter((e) => e.nps <= 6).length;
    return { nps: Math.round(((p - d) / r.length) * 100), n: r.length, p, d, pa: r.length - p - d, csat: r.reduce((a, e) => a + e.csat, 0) / r.length };
  }
  const refEnc = (e) => (e.ticket ? `<button type="button" class="tkl" data-open="${esc(e.ticket)}">${esc(e.ticket)}</button>` : `<span class="mono">${esc(e.caso_id)}</span> · resuelto por el bot`);
  function vExp() {
    const enc = S.enc.filter(visEnc);
    if (!enc.length) return `<p class="empty"><b>Todavía no hay encuestas.</b><br>Se generan cuando la central cierra un ticket o cuando el bot resuelve una consulta en el chat. Los envíos son SIMULADOS.</p>`;
    const e30 = enc.filter((e) => G.now() - new Date(e.enviado) < 30 * G.D);
    const N = npsDe(e30);
    const resp = e30.filter((e) => e.estado === 'respondida').length;
    const det = enc.filter((e) => e.recup && e.recup.estado === 'abierta');
    const recCerr = enc.filter((e) => e.recup && e.recup.estado !== 'abierta');
    const F = { todas: enc, pendientes: enc.filter((e) => e.estado !== 'respondida'), detractores: enc.filter((e) => G.CLASE(e.nps) === 'detractor') };
    if (!F[ui.encF]) ui.encF = 'todas';
    const bs = barriosVis().filter((b) => enc.some((e) => e.barrio === b.id));
    return `
      <section class="kpis">
        <div class="kpi cut"><span>Encuestas enviadas · 30 d <span class="simtag">SIM</span></span><b>${e30.length}</b><small>${e30.filter((e) => e.canal === 'whatsapp').length} WhatsApp · ${e30.filter((e) => e.canal === 'email').length} email</small></div>
        <div class="kpi cut"><span>Tasa de respuesta</span><b>${e30.length ? Math.round((resp / e30.length) * 100) + ' %' : '—'}</b><small>${resp} respondidas</small></div>
        <div class="kpi cut"><span>NPS · 30 d</span><b class="${N ? npsCls(N.nps) : ''}">${N ? fmtNps(N.nps) : '—'}</b><small>${N ? `${N.p} prom. · ${N.pa} pas. · ${N.d} detr.` : 'sin respuestas'}</small></div>
        <div class="kpi cut"><span>CSAT promedio</span><b>${N ? N.csat.toFixed(1) : '—'}<em>/5</em></b><small>satisfacción con la atención</small></div>
      </section>
      <section class="block">
        <header class="bh"><h3>Alertas de detractores <i class="bd">${det.length}</i></h3><span class="mini">Recuperados: ${recCerr.filter((e) => e.recup.estado === 'recuperado').length} de ${recCerr.length} cerrados</span></header>
        <div class="dets">${det.map(detCard).join('') || '<p class="mini">No hay detractores con protocolo abierto.</p>'}</div>
      </section>
      <section class="block">
        <header class="bh"><h3>Reseñas de Google por barrio</h3><span class="simtag">PEDIDOS SIMULADOS</span></header>
        <div class="revs">${bs.map((b) => revCard(b, enc.filter((e) => e.barrio === b.id))).join('') || '<p class="mini">Sin barrios con encuestas.</p>'}</div>
      </section>
      <section class="block">
        <header class="bh"><h3>Encuestas</h3>
          <div class="seg sm">${[['todas', 'Todas'], ['pendientes', 'Sin responder'], ['detractores', 'Detractores']].map(([k, l]) => `<button type="button" data-ef="${k}" class="${ui.encF === k ? 'on' : ''}">${l} <i>${F[k].length}</i></button>`).join('')}</div></header>
        <ol class="encs">${F[ui.encF].slice(0, 40).map(encRow).join('') || '<li class="mini">Nada para mostrar.</li>'}</ol>
      </section>`;
  }
  const npsCls = (n) => (n >= 30 ? 'good' : n >= 0 ? 'mid' : 'bad');
  const fmtNps = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
  function detCard(e) {
    const rest = +new Date(e.recup.limite || 0) - G.now();
    const done = e.recup.pasos.filter(Boolean).length;
    return `<article class="det cut">
      <header><span class="nps n-detractor">NPS ${e.nps}</span><b>${esc(e.nombre)}</b><small>${esc(G.barrio(e.barrio).nombre)}${e.lote ? ' · ' + esc(loteTxt(e.lote)) : ''} · ${refEnc(e)}</small></header>
      ${e.comentario ? `<p class="com">“${esc(e.comentario)}”</p>` : ''}
      <p class="due ${rest < 0 ? 'late' : rest < 6 * G.H ? 'soon' : ''}">${rest >= 0 ? `Llamar antes de ${dur(rest)}` : `Llamada atrasada ${dur(rest)}`}</p>
      <ol class="proto">${PASOS.map((p, i) => `<li><label><input type="checkbox" data-paso="${i}" data-k="${esc(e.id)}" ${e.recup.pasos[i] ? 'checked' : ''}><span>${p}</span></label></li>`).join('')}</ol>
      <div class="dact"><button type="button" class="ghost" data-a="recup" data-k="${esc(e.id)}" data-v="no_recuperado">No recuperado</button>
        <button type="button" class="primary cut" data-a="recup" data-k="${esc(e.id)}" data-v="recuperado" ${done < 3 ? 'disabled title="Completá al menos los 3 primeros pasos"' : ''}>Recuperado</button></div>
    </article>`;
  }
  function revCard(b, enc) {
    const pro = enc.filter((e) => e.resena);
    const pend = pro.filter((e) => e.resena.estado === 'pendiente');
    const ped = pro.filter((e) => e.resena.estado === 'pedida');
    const pub = pro.filter((e) => e.resena.estado === 'publicada');
    const g = b.google && b.google.url;
    return `<article class="rev cut"><header><b>${esc(b.nombre)}</b><small>${g ? 'Perfil de Google · ' + esc(g) : 'Perfil de Google sin cargar (Config.)'}</small></header>
      <div class="funnel"><span><b>${pend.length}</b>promotores sin pedir</span><span><b>${ped.length}</b>pedidas</span><span><b>${pub.length}</b>publicadas</span></div>
      <ul>${pend.slice(0, 3).map((e) => `<li><span>${esc(e.nombre)} <small>NPS ${e.nps}</small></span><button type="button" class="ghost sm" data-a="resena" data-k="${esc(e.id)}">Pedir</button></li>`).join('')}
        ${ped.slice(0, 2).map((e) => `<li><span>${esc(e.nombre)} <small>pedida ${ago(e.resena.t)}</small></span><button type="button" class="ghost sm" data-a="publicar" data-k="${esc(e.id)}">Simular publicación</button></li>`).join('')}</ul>
      ${pend.length ? `<button type="button" class="primary cut sm" data-a="resenaTodos" data-k="${esc(b.id)}">Pedir ${pend.length === 1 ? 'al promotor' : `a los ${pend.length} promotores`}</button>` : ''}</article>`;
  }
  function encRow(e) {
    const cl = G.CLASE(e.nps);
    return `<li class="enc"><span class="canal c-${e.canal}" title="${e.canal === 'email' ? 'Email formal' : 'WhatsApp'}">${e.canal === 'email' ? ICON.mail : ICON.wa}</span>
      <span class="who"><b>${esc(e.nombre)}</b><small>${esc(G.barrio(e.barrio).nombre)} · ${refEnc(e)} · ${fdt(e.enviado)}</small></span>
      ${e.estado === 'respondida' ? `<span class="nps n-${cl}">${e.nps}</span><span class="cs">${e.csat}/5</span>` : `<button type="button" class="ghost sm" data-a="responder" data-k="${esc(e.id)}">Simular respuesta</button>`}</li>`;
  }

  /* ════════ vista: reputación ════════ */
  function statsBarrio(b) {
    const enc = S.enc.filter((e) => e.barrio === b.id);
    const N = npsDe(enc.filter((e) => G.now() - new Date(e.enviado) < 90 * G.D));
    const ts = S.tickets.filter((t) => t.barrio === b.id);
    const cerr = ts.filter((t) => t.estado === 'cerrado' && t.cat);
    const cumpl = cerr.length ? Math.round((cerr.filter((t) => G.sla(t).st === 'cumplido').length / cerr.length) * 100) : null;
    const pub = enc.filter((e) => e.resena && e.resena.estado === 'publicada');
    const g = b.google || {};
    const base = +g.rating || 0, n = +g.n || 0;
    const rating = base && n ? (base * n + pub.reduce((a, e) => a + (e.resena.estrellas || 5), 0)) / (n + pub.length) : pub.length ? 5 : null;
    const cs = S.casos.filter((c) => idBarrioCaso(c) === b.id);
    const semanas = Array.from({ length: 8 }, (_, i) => {
      const hasta = G.now() - (7 - i) * 7 * G.D, desde = hasta - 7 * G.D;
      const x = npsDe(enc.filter((e) => e.resp_t && +new Date(e.resp_t) > desde && +new Date(e.resp_t) <= hasta));
      return { desde, hasta, v: x ? x.nps : null, n: x ? x.n : 0 };
    });
    return { b, N, cumpl, abiertos: ts.filter((t) => t.estado !== 'cerrado').length, det: enc.filter((e) => e.recup && e.recup.estado === 'abierta').length, rating, nG: (base && n ? n : 0) + pub.length, viaSila: pub.length,
      pedidas: enc.filter((e) => e.resena && e.resena.estado === 'pedida').length, semanas, casos: cs.length, bot: cs.filter(resueltoPorBot).length };
  }
  function spark(sem) {
    const W = 220, Hh = 54, p = 6;
    const x = (i) => p + (i * (W - 2 * p)) / (sem.length - 1);
    const y = (v) => p + ((100 - v) / 200) * (Hh - 2 * p);
    let d = '', pen = false;
    sem.forEach((s, i) => { if (s.v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(s.v).toFixed(1); pen = true; });
    const pts = sem.map((s, i) => (s.v == null ? '' : `<g class="pt"><circle cx="${x(i)}" cy="${y(s.v)}" r="9" class="hit"/><circle cx="${x(i)}" cy="${y(s.v)}" r="3.2" class="dot"/><title>Semana al ${fdt(s.hasta).slice(0, 5)}: NPS ${fmtNps(s.v)} (${s.n} respuestas)</title></g>`)).join('');
    return `<svg class="spark" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="NPS por semana, últimas 8 semanas"><line x1="${p}" x2="${W - p}" y1="${y(0)}" y2="${y(0)}" class="zero"/><path d="${d}"/>${pts}</svg>`;
  }
  function vRep() {
    if (!barriosVis().length) return `<p class="empty">${S.barrios.length ? 'Sin barrios en tu alcance.' : 'Todavía no hay barrios: aparecen cuando un residente los informa en el chat.'}</p>`;
    const st = barriosVis().map(statsBarrio).sort((a, b) => (b.N ? b.N.nps : -999) - (a.N ? a.N.nps : -999) || b.casos - a.casos);
    const allEnc = S.enc.filter(visEnc).filter((e) => G.now() - new Date(e.enviado) < 90 * G.D);
    const N = npsDe(allEnc);
    const rs = st.filter((s) => s.rating);
    const rAvg = rs.length ? rs.reduce((a, s) => a + s.rating * s.nG, 0) / rs.reduce((a, s) => a + s.nG, 0) : null;
    const tc = st.reduce((a, s) => a + s.casos, 0), tb = st.reduce((a, s) => a + s.bot, 0);
    return `
      <section class="kpis">
        <div class="kpi cut"><span>NPS · 90 d</span><b class="${N ? npsCls(N.nps) : ''}">${N ? fmtNps(N.nps) : '—'}</b><small>${N ? N.n + ' respuestas' : 'sin respuestas'}</small></div>
        <div class="kpi cut"><span>CSAT</span><b>${N ? N.csat.toFixed(1) : '—'}<em>/5</em></b><small>promedio 90 d</small></div>
        <div class="kpi cut"><span>Google</span><b>${rAvg ? rAvg.toFixed(2) : '—'}<em>★</em></b><small>${rs.length ? `${rs.reduce((a, s) => a + s.nG, 0)} reseñas · ${rs.reduce((a, s) => a + s.viaSila, 0)} vía SILA (sim.)` : 'perfiles sin cargar'}</small></div>
        <div class="kpi cut"><span>Resueltos por el bot</span><b>${tc ? Math.round((tb / tc) * 100) + ' %' : '—'}</b><small>${tb} de ${plural(tc, 'caso')} del chat</small></div>
      </section>
      <p class="legend"><span><i class="lg good"></i>NPS ≥ +30 saludable</span><span><i class="lg mid"></i>0 a +29 a mejorar</span><span><i class="lg bad"></i>negativo · crítico</span></p>
      <div class="barrios">${st.map((s, i) => repCard(s, i + 1)).join('')}</div>`;
  }
  function repCard(s, pos) {
    const n = s.N;
    const v = n ? n.nps : 0;
    const half = Math.min(50, Math.abs(v) / 2);
    return `<article class="bc cut ${n ? 'b-' + npsCls(v) : ''}">
      <header><span class="pos">${String(pos).padStart(2, '0')}</span><div><b>${esc(s.b.nombre)}</b><small>${esc(s.b.loc || plural(s.casos, 'caso') + ' en el chat')}</small></div>
        <div class="big ${n ? npsCls(v) : ''}">${n ? fmtNps(v) : '—'}<small>NPS · ${n ? n.n : 0} resp.</small></div></header>
      <div class="diverge" role="img" aria-label="NPS ${n ? fmtNps(v) : 'sin datos'} en escala de −100 a +100"><span class="mid"></span>${n ? `<b class="${v >= 0 ? 'pos' : 'neg'} ${npsCls(v)}" style="${v >= 0 ? 'left:50%' : 'right:50%'};width:${half}%"></b>` : ''}<small class="l">−100</small><small class="r">+100</small></div>
      ${n ? `<div class="mix" role="img" aria-label="${n.p} promotores, ${n.pa} pasivos, ${n.d} detractores"><b class="p" style="flex:${n.p}"></b><b class="pa" style="flex:${n.pa}"></b><b class="d" style="flex:${n.d}"></b></div>
        <p class="mixl"><span>${Math.round((n.p / n.n) * 100)} % promotores</span><span>${Math.round((n.pa / n.n) * 100)} % pasivos</span><span>${Math.round((n.d / n.n) * 100)} % detractores</span></p>` : ''}
      <dl class="st">
        <div><dt>CSAT</dt><dd>${n ? n.csat.toFixed(1) : '—'}<em>/5</em></dd></div>
        <div><dt>Google</dt><dd>${s.rating ? s.rating.toFixed(1) : '—'}<em>★ ${s.nG}</em></dd></div>
        <div><dt>SLA cumplido</dt><dd>${s.cumpl == null ? '—' : s.cumpl + '<em>%</em>'}</dd></div>
        <div><dt>Bot resolvió</dt><dd>${s.casos ? Math.round((s.bot / s.casos) * 100) + '<em>%</em>' : '—'}</dd></div>
      </dl>
      <div class="trend"><span class="mini">NPS por semana · 8 sem.</span>${spark(s.semanas)}</div>
      <footer><span>${plural(s.abiertos, 'abierto')}${s.det ? ` · ${s.det} detr.` : ''} · ${plural(s.viaSila, 'reseña publicada', 'reseñas publicadas')} vía SILA (sim.) · ${plural(s.pedidas, 'pedida')}</span></footer>
    </article>`;
  }

  /* ════════ vista: configuración (la carga Dirección y queda compartida) ════════ */
  function vSla() {
    const dir = puede('configurar');
    const open = S.tickets.filter((t) => t.estado !== 'cerrado' && vis(t));
    const cs = G.cats();
    const casos = S.casos;
    const faltan = G.CATS_DOC.filter((c) => !cs.some((x) => x.id === c.id));
    const host = (() => { try { return new URL(G.url()).host; } catch (_) { return G.url(); } })();
    return `
      <section class="block">
        <header class="bh"><h3>Motor de SLA por categoría</h3>${dir ? '<span class="mini">Palabras clave: si la consulta del chat las contiene, el ticket se categoriza solo</span>' : '<span class="mini">Sólo Dirección puede editarlo</span>'}</header>
        <div class="slat cut">
          ${cs.length ? `<div class="sr0 cfgc"><span>Categoría</span><span>Plazo</span><span>Palabras clave</span><span>Abiertos</span></div>
          ${cs.map((c) => `<div class="sr1 cfgc"><span>${dir ? `<input data-cfg="cnom" data-k="${esc(c.id)}" value="${esc(c.nombre)}" maxlength="50" aria-label="Nombre de la categoría">` : esc(c.nombre)}</span>
            <span>${dir ? `<input type="number" min="1" max="240" step="1" value="${c.h}" data-cfg="h" data-k="${esc(c.id)}" aria-label="Horas de ${esc(c.nombre)}"> h` : c.h + ' h'}<small class="mono">alerta a las ${dur((c.h * G.umbral() * G.H) / 100)}</small></span>
            <span>${dir ? `<input data-cfg="claves" data-k="${esc(c.id)}" value="${esc(c.claves || '')}" maxlength="300" placeholder="barrera, brazo…" aria-label="Palabras clave de ${esc(c.nombre)}">` : esc(c.claves || '—')}</span>
            <span class="mono">${open.filter((t) => t.cat === c.id).length}<i class="mlbl"> abiertos</i>${dir ? ` <button type="button" class="x sm" data-a="catDel" data-k="${esc(c.id)}" aria-label="Quitar ${esc(c.nombre)}">✕</button>` : ''}</span></div>`).join('')}`
            : `<p class="mini pad">Todavía no hay categorías. Sin categoría no hay plazo y el semáforo queda en gris.</p>`}
          ${dir ? `<form class="addrow" data-a="catAdd"><input id="ncNom" placeholder="Nueva categoría" maxlength="50" required aria-label="Nombre"><input id="ncH" type="number" min="1" max="240" placeholder="horas" required aria-label="Horas"><input id="ncCl" placeholder="palabras clave, separadas por coma" maxlength="300" aria-label="Palabras clave"><button type="submit" class="ghost">Agregar</button></form>
            ${faltan.length ? `<p class="mini">Plazos que fija el contrato: ${faltan.map((c) => `${esc(c.nombre)} ${c.h} h`).join(' · ')} <button type="button" class="ghost sm" data-a="catDoc">Cargarlos</button></p>` : ''}` : ''}
          <div class="sr2"><label>Alerta al ${dir ? `<input type="number" min="50" max="95" step="5" value="${G.umbral()}" data-cfg="umbral" aria-label="Umbral de alerta"> %` : G.umbral() + ' %'} del tiempo</label>
            <span class="mini">Al cruzarlo: aviso al operador de turno y al supervisor. Al 100 %: escalado a Dirección. Avisos SIMULADOS.</span></div>
        </div>
      </section>
      <section class="block">
        <header class="bh"><h3>Equipo</h3><span class="mini">Operadores (ven sólo sus barrios) y técnicos de campo (ven sólo sus visitas)</span></header>
        <div class="conn cut cfgl">
          ${S.equipo.length ? `<ul class="team">${S.equipo.map((p) => `<li><b>${esc(p.nombre)}</b><span class="chip">${G.ROL_TXT[p.rol]}</span>
            ${p.rol === 'operador' ? (dir ? `<span class="bchk">${S.barrios.map((b) => `<label><input type="checkbox" data-cfg="pb" data-k="${esc(p.id)}" value="${esc(b.id)}" ${(p.barrios || []).includes(b.id) ? 'checked' : ''}>${esc(b.nombre)}</label>`).join('') || '<small>sin barrios todavía</small>'}</span>` : `<small>${(p.barrios || []).map((b) => esc(G.barrio(b).nombre)).join(', ') || 'sin barrios'}</small>`) : ''}
            ${dir ? `<button type="button" class="x sm" data-a="pDel" data-k="${esc(p.id)}" aria-label="Quitar a ${esc(p.nombre)}">✕</button>` : ''}</li>`).join('')}</ul>` : '<p class="mini">Sin personas cargadas. Mientras tanto, todo se ve como Dirección.</p>'}
          ${dir ? `<form class="addrow" data-a="pAdd"><input id="npNom" placeholder="Nombre y apellido" maxlength="60" required aria-label="Nombre"><select id="npRol" aria-label="Rol"><option value="operador">Operador</option><option value="tecnico">Técnico de campo</option></select><button type="submit" class="ghost">Agregar</button></form>` : ''}
        </div>
      </section>
      <section class="block">
        <header class="bh"><h3>Barrios</h3><span class="mini">Se dan de alta solos con lo que escribe el residente en el chat</span></header>
        <div class="conn cut cfgl">
          ${S.barrios.length ? `<ul class="team brs">${S.barrios.map((b) => {
            const n = casos.filter((c) => idBarrioCaso(c) === b.id).length;
            const g = b.google || {};
            return `<li><span class="bn">${dir ? `<input data-cfg="bnom" data-k="${esc(b.id)}" value="${esc(b.nombre)}" maxlength="60" aria-label="Nombre del barrio">` : `<b>${esc(b.nombre)}</b>`}<small>${plural(n, 'caso')}${(b.alias || []).length ? ' · también escrito como ' + b.alias.map(esc).join(', ') : ''}</small></span>
              ${dir ? `<span class="gg"><input data-cfg="gurl" data-k="${esc(b.id)}" value="${esc(g.url || '')}" placeholder="link de reseñas de Google" maxlength="200" aria-label="Link de Google"><input type="number" step="0.1" min="1" max="5" data-cfg="grat" data-k="${esc(b.id)}" value="${g.rating || ''}" placeholder="★" aria-label="Calificación actual"><input type="number" min="0" data-cfg="gn" data-k="${esc(b.id)}" value="${g.n || ''}" placeholder="reseñas" aria-label="Cantidad de reseñas"></span>
                ${S.barrios.length > 1 ? `<select data-cfg="bunir" data-k="${esc(b.id)}" aria-label="Unir ${esc(b.nombre)} con otro barrio"><option value="">Es el mismo que…</option>${S.barrios.filter((x) => x.id !== b.id).map((x) => `<option value="${esc(x.id)}">${esc(x.nombre)}</option>`).join('')}</select>` : ''}` : `<small>${g.rating ? `Google ${g.rating}★ · ${g.n || 0} reseñas` : 'Google sin cargar'}</small>`}</li>`;
          }).join('')}</ul>` : '<p class="mini">Todavía no entró ningún barrio.</p>'}
        </div>
      </section>
      <section class="block">
        <header class="bh"><h3>Conexión</h3></header>
        <div class="conn cut">
          <p><span class="dotlive"></span>Backend <span class="mono">${esc(host)}</span></p>
          <p><b>${casos.length}</b> casos del chat · <b>${casos.filter((c) => c.derivado_central === 'sí').length}</b> derivados a la central · <b>${casos.filter(resueltoPorBot).length}</b> resueltos por el bot</p>
          <p class="mini">Cada caso derivado aparece como ticket con su consulta, pasos intentados y fuentes. Al caso sólo se le anota el número de ticket y, al cerrarlo, que quedó resuelto. Encuestas, WhatsApp, emails y reseñas: SIMULADOS.</p>
          <div class="rowb"><a class="primary cut" href="../index.html?ayuda=1" target="_blank" rel="noopener">Abrir el chat de residentes ↗</a><button type="button" class="ghost" data-a="salir">Salir de esta PC</button></div>
        </div>
      </section>`;
  }

  /* ════════ render general ════════ */
  const VISTAS = { tickets: vTickets, lotes: vLotes, exp: vExp, rep: vRep, sla: vSla };
  function render() {
    if (document.body.classList.contains('locked')) return;
    renderTop();
    renderTabs();
    const v = $('#view');
    const focusId = document.activeElement && document.activeElement.id;
    const pos = focusId === 'fq' ? document.activeElement.selectionStart : null;
    v.dataset.v = ui.vista;
    v.innerHTML = G.listo() ? VISTAS[ui.vista]() : '<p class="empty">Conectando con el backend…</p>';
    if (focusId === 'fq' && $('#fq')) { $('#fq').focus(); $('#fq').setSelectionRange(pos, pos); }
    keep();
    alto();
  }
  // un refresco remoto no pisa lo que alguien está escribiendo
  let diferido = false;
  const escribiendo = () => { const a = document.activeElement; return a && a.matches && a.matches('input:not([type=checkbox]):not([type=radio]):not(#fq), textarea, select') && !!a.closest('#view, #drawer'); };
  function renderRemoto() { if (escribiendo()) { diferido = true; return; } diferido = false; render(); refreshFicha(); }
  document.addEventListener('focusout', () => setTimeout(() => { if (diferido && !escribiendo()) renderRemoto(); }, 50));
  function alto() { const h = $('.top').offsetHeight; document.documentElement.style.setProperty('--toph', h + 'px'); $('#pop').style.top = h + 6 + 'px'; }
  addEventListener('resize', alto);

  /* ════════ eventos ════════ */
  const uid = () => Math.random().toString(36).slice(2, 8);
  document.addEventListener('submit', (ev) => {
    const f = ev.target;
    ev.preventDefault();
    if (f.dataset.g) { enviarGate(f); return; }
    if (!puede('configurar')) return;
    if (f.dataset.a === 'catAdd') {
      const nombre = $('#ncNom').value.trim(), h = Math.max(1, Math.min(240, +$('#ncH').value || 0)), claves = $('#ncCl').value.trim();
      if (!nombre || !h) return;
      let id = G.slug(nombre) || 'cat';
      if (G.cats().some((c) => c.id === id)) id += '-' + uid();
      G.mut('cfg', (d) => { if (!d.cats.some((c) => c.id === id)) d.cats.push({ id, nombre, h, claves }); });
      render(); toast(`Categoría “${esc(nombre)}” · ${h} h`);
    } else if (f.dataset.a === 'pAdd') {
      const nombre = $('#npNom').value.trim(), rol = $('#npRol').value;
      if (!nombre) return;
      const p = { id: 'p-' + uid(), rol, nombre, barrios: [] };
      G.mut('equipo', (d) => d.list.push({ ...p, barrios: [] }));
      render(); toast(`${esc(nombre)} · ${G.ROL_TXT[rol]}`);
    }
  });
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('button, [data-id], [data-open]');
    if (!b) return;
    const d = b.dataset;
    if (d.g === 'reintentar') { iniciar(); return; }
    if (b.closest('#tabs') && d.v) { ui.vista = d.v; ui.q = ''; render(); $('#view').focus(); scrollTo(0, 0); return; }
    if (d.v2) { ui.vista = d.v2; render(); return; }
    if (d.f) { ui.filtro = d.f; render(); return; }
    if (d.ef) { ui.encF = d.ef; render(); return; }
    if (d.lote) { ui.lote = d.lote; render(); if (innerWidth < 900) $('.ldet').scrollIntoView({ behavior: 'smooth' }); return; }
    if (d.open) { abrirFicha(d.open); return; }
    if (b.id === 'bell') { const p = $('#pop'); p.hidden = !p.hidden; if (!p.hidden) renderPop(); return; }
    if (d.nps != null) { $$('#modal .npspick button').forEach((x) => x.classList.toggle('on', x === b)); habilitarResp(); return; }
    if (d.csat != null) { $$('#modal .csatpick button').forEach((x) => x.classList.toggle('on', x === b)); habilitarResp(); return; }
    if (d.m) {
      if (d.m === 'cancel') cerrarModal();
      else if (d.m === 'close') cerrarTicket(d.k);
      else if (d.m === 'resp') guardarRespuesta(d.k);
      else if (d.m === 'resena') pedirResena(d.k);
      else if (d.m === 'goexp') { cerrarModal(); cerrarFicha(); ui.vista = 'exp'; render(); }
      return;
    }
    if (d.id && b.classList.contains('tk')) { abrirFicha(d.id); return; }
    switch (d.a) {
      case 'cerrarFicha': cerrarFicha(); break;
      case 'estado': case 'nota': accionFicha(d.a, d.k); break;
      case 'cerrar': modalCerrar(S.tickets.find((x) => x.id === openId)); break;
      case 'verLote': ui.lote = d.k; ui.vista = 'lotes'; ui.q = ''; cerrarFicha(); render(); break;
      case 'responder': modalResponder(d.k); break;
      case 'resena': pedirResena(d.k); break;
      case 'resenaTodos': {
        const l = S.enc.filter((e) => e.barrio === d.k && e.resena && e.resena.estado === 'pendiente');
        l.forEach((e) => pedirResena(e.id, true));
        toast(`${plural(l.length, 'pedido')} de reseña de ${esc(G.barrio(d.k).nombre)} · SIMULADO, no se envió nada`);
        break;
      }
      case 'publicar': G.en(d.k, (e) => { e.resena = { ...e.resena, estado: 'publicada', estrellas: 5, tp: G.iso() }; }); render(); toast('Reseña publicada (simulado) · actualiza la reputación del barrio'); break;
      case 'recup': {
        const e = S.enc.find((x) => x.id === d.k);
        if (!e) break;
        G.en(d.k, (x) => { x.recup.estado = d.v; if (d.v === 'recuperado') x.recup.renps = 8; });
        if (e.ticket) G.tk(e.ticket, (t) => G.evento(t, d.v === 'recuperado' ? 'Detractor recuperado · re-encuesta simulada NPS 8' : 'Detractor no recuperado · se cierra el protocolo', quienSoy()));
        render(); toast(d.v === 'recuperado' ? 'Protocolo cerrado: recuperado' : 'Protocolo cerrado: no recuperado');
        break;
      }
      case 'al': {
        G.mut('alertas', (x) => x.list.forEach((a) => { if (a.id === d.idAl) a.leida = true; }));
        $('#pop').hidden = true;
        if (d.k === 'detractor') { ui.vista = 'exp'; render(); } else if (d.t) { render(); abrirFicha(d.t); }
        break;
      }
      case 'leer': { const ids = new Set(alertasVis().map((a) => a.id)); G.mut('alertas', (x) => x.list.forEach((a) => { if (ids.has(a.id)) a.leida = true; })); renderBell(); renderPop(); break; }
      case 'catDel': {
        const c = G.cat(d.k);
        const n = S.tickets.filter((t) => t.cat === d.k && t.estado !== 'cerrado').length;
        if (!confirm(`¿Quitar la categoría “${c.nombre}”?${n ? ` ${plural(n, 'ticket abierto queda', 'tickets abiertos quedan')} sin categoría.` : ''}`)) break;
        G.mut('cfg', (x) => { x.cats = x.cats.filter((k) => k.id !== d.k); });
        S.tickets.filter((t) => t.cat === d.k && t.estado !== 'cerrado').forEach((t) => G.tk(t.id, (x) => { x.cat = ''; G.evento(x, `Categoría “${c.nombre}” eliminada por Dirección · ticket sin SLA`, 'Dirección'); }));
        render(); break;
      }
      case 'catDoc': G.mut('cfg', (x) => G.CATS_DOC.forEach((c) => { if (!x.cats.some((k) => k.id === c.id)) x.cats.push({ ...c }); })); render(); toast('Categorías del contrato cargadas'); break;
      case 'pDel': {
        const p = G.persona(d.k);
        if (!p || !confirm(`¿Quitar a ${p.nombre} del equipo?`)) break;
        G.mut('equipo', (x) => { x.list = x.list.filter((q) => q.id !== d.k); });
        if (ui.rol === d.k) ui.rol = 'dir';
        render(); break;
      }
      case 'salir': if (confirm('¿Salir de la central en esta PC? Se borra la clave guardada.')) G.salir('fuera'); break;
      default:
    }
  });
  function habilitarResp() { const ok = $('#modal .npspick .on') && $('#modal .csatpick .on'); const btn = $('#modal [data-m=resp]'); if (btn) btn.disabled = !ok; }

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { if (!$('#modal').hidden) cerrarModal(); else if (!$('#pop').hidden) $('#pop').hidden = true; else cerrarFicha(); }
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList && ev.target.classList.contains('tk')) { ev.preventDefault(); abrirFicha(ev.target.dataset.id); }
    if (ev.key === 'Enter' && ev.target.id === 'nota') accionFicha('nota');
  });
  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.id === 'role') { ui.rol = el.value; ui.barrio = '*'; ui.q = ''; ui.lote = null; cerrarFicha(); $('#pop').hidden = true; render(); toast(`Viendo como ${esc(me().rol === 'direccion' ? 'Dirección' : G.ROL_TXT[me().rol] + ' · ' + me().nombre)}`); return; }
    if (el.id === 'tenant') { ui.barrio = el.value; ui.lote = null; cerrarFicha(); render(); return; }
    if (el.id === 'fcat') { ui.cat = el.value; render(); return; }
    if (el.dataset.a && ['asignar', 'cat', 'barrio'].includes(el.dataset.a)) { accionFicha(el.dataset.a, null, el.value); return; }
    if (el.dataset.paso != null) {
      const id = el.dataset.k, i = +el.dataset.paso, on = el.checked;
      const e = S.enc.find((x) => x.id === id);
      G.en(id, (x) => { x.recup.pasos[i] = on; });
      if (on && e && e.ticket) G.tk(e.ticket, (t) => G.evento(t, 'Protocolo de recuperación: ' + PASOS[i], quienSoy()));
      render(); return;
    }
    const c = el.dataset.cfg;
    if (!c || !puede('configurar')) return;
    const k = el.dataset.k, v = el.value;
    if (c === 'h') { const h = Math.max(1, Math.min(240, Math.round(+v) || 0)); if (h) G.mut('cfg', (x) => { const q = x.cats.find((y) => y.id === k); if (q) q.h = h; }); toast('Motor de SLA actualizado'); }
    else if (c === 'cnom' && v.trim()) G.mut('cfg', (x) => { const q = x.cats.find((y) => y.id === k); if (q) q.nombre = v.trim().slice(0, 50); });
    else if (c === 'claves') G.mut('cfg', (x) => { const q = x.cats.find((y) => y.id === k); if (q) q.claves = v.trim().slice(0, 300); });
    else if (c === 'umbral') { const u = Math.max(50, Math.min(95, +v || 75)); G.mut('cfg', (x) => { x.umbral = u; }); toast('Umbral de alerta actualizado'); }
    else if (c === 'pb') { const on = el.checked; G.mut('equipo', (x) => { const p = x.list.find((q) => q.id === k); if (!p) return; p.barrios = (p.barrios || []).filter((b) => b !== v); if (on) p.barrios.push(v); }); }
    else if (c === 'bnom' && v.trim()) G.mut('barrios', (x) => { const b = x.list.find((q) => q.id === k); if (b) b.nombre = v.trim().slice(0, 60); });
    else if (c === 'gurl' || c === 'grat' || c === 'gn') {
      const campo = { gurl: 'url', grat: 'rating', gn: 'n' }[c];
      const val = c === 'gurl' ? v.trim().slice(0, 200) : c === 'grat' ? (v ? Math.max(1, Math.min(5, +v)) : null) : (v ? Math.max(0, Math.round(+v)) : null);
      G.mut('barrios', (x) => { const b = x.list.find((q) => q.id === k); if (b) b.google = { ...(b.google || {}), [campo]: val }; });
    } else if (c === 'bunir' && v) {
      const de = G.barrio(k), a = G.barrio(v);
      if (!confirm(`¿“${de.nombre}” es el mismo barrio que “${a.nombre}”? Sus tickets y encuestas pasan a “${a.nombre}”.`)) { el.value = ''; return; }
      G.mut('barrios', (x) => {
        const src = x.list.find((q) => q.id === k), dst = x.list.find((q) => q.id === v);
        if (!src || !dst) return;
        dst.alias = [...new Set([...(dst.alias || []), src.id, ...(src.alias || [])])];
        x.list = x.list.filter((q) => q.id !== k);
      });
      S.tickets.filter((t) => t.barrio === k).forEach((t) => G.tk(t.id, (x) => { x.barrio = v; G.evento(x, `Barrio unificado: ${de.nombre} → ${a.nombre}`, 'Dirección'); }));
      if (S.enc.some((e) => e.barrio === k)) G.mut('enc', (x) => x.list.forEach((e) => { if (e.barrio === k) e.barrio = v; }));
      G.mut('equipo', (x) => x.list.forEach((p) => { if ((p.barrios || []).includes(k)) p.barrios = [...new Set(p.barrios.map((b) => (b === k ? v : b)))]; }));
      toast(`${esc(de.nombre)} unificado con ${esc(a.nombre)}`);
    } else return;
    render();
  });
  document.addEventListener('input', (ev) => { if (ev.target.id === 'fq') { ui.q = ev.target.value; clearTimeout(render.k); render.k = setTimeout(render, 160); } });
  $('#scrim').addEventListener('click', cerrarFicha);
  $('#modal').addEventListener('click', (ev) => { if (ev.target.id === 'modal') cerrarModal(); });

  /* ════════ tiempo real ════════ */
  function tick() {
    renderNet();
    if (document.body.classList.contains('locked') || !G.listo()) return;
    const nuevas = G.revisarSLA();
    if (nuevas.length) {
      nuevas.filter((n) => vis(n.t)).forEach((n) => toast(`<b>${n.tipo === 'a75' ? `ALERTA ${G.umbral()} % SLA` : 'SLA VENCIDO'}</b> ${esc(n.txt)}`, n.tipo === 'a75' ? 'warn' : 'bad'));
      renderRemoto();
    } else tickSLA();
  }
  G.on({
    change: renderRemoto,
    red: renderNet,
    nuevos: (l) => {
      l.forEach((t) => { fresh.add(t.id); setTimeout(() => fresh.delete(t.id), 4000); });
      l.filter(vis).forEach((t) => toast(`<b>NUEVO TICKET ${t.id}</b> desde el chat · ${esc(G.barrio(t.barrio).nombre)}${t.lote ? ' · ' + esc(loteTxt(t.lote)) : ''}`, 'info'));
    },
    salir: (m) => iniciar(m === 'clave' ? 'La clave guardada ya no es válida: ingresala de nuevo.' : m === 'bloqueado' ? ERR.bloqueado : ''),
  });

  setInterval(tick, 1000);
  iniciar();
  window.SILA_GESTION = { ui, render, abrirFicha }; // para pruebas
})();
