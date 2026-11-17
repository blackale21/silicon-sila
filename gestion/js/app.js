/* Central SILA · interfaz: tickets con SLA, lotes, experiencia y reputación. Todo SIMULADO. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const S = G.S;

  /* ── estado de la pestaña (cada pestaña puede tener otro rol) ── */
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
  const ORIG = { bot: 'Bot SILA', whatsapp: 'WhatsApp', telefono: 'Teléfono', guardia: 'Guardia' };
  const EST = { nuevo: 'Nuevo', en_curso: 'En curso', en_campo: 'En campo', cerrado: 'Cerrado' };
  const SLA_TXT = { ok: 'En término', riesgo: 'En riesgo', vencido: 'Vencido', cumplido: 'Cumplido', incumplido: 'Fuera de SLA' };
  const loteTxt = (l) => (!l ? 'Sin lote' : l === 'ACCESO' ? 'Acceso común' : 'Lote ' + l);
  const ICON = {
    wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1.3-3.8A8 8 0 1 1 8 19z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 9.5c.5 2 2.2 3.8 4.5 4.6" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
    mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v12H3z M3 6l9 7 9-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1L3.2 9.4l6.1-.8z" fill="currentColor"/></svg>',
  };

  /* ── alcance (multi-tenant): qué ve cada rol ── */
  const me = () => G.persona(ui.rol) || G.PERSONAS[0];
  function barriosRol() {
    const p = me();
    if (p.rol === 'direccion') return [...G.BARRIOS.map((b) => b.id), G.SIN_BARRIO.id];
    if (p.rol === 'operador') return p.barrios.slice();
    return [];
  }
  const enAlcance = (bid) => barriosRol().includes(bid) && (ui.barrio === '*' || ui.barrio === bid);
  function vis(t) {
    const p = me();
    if (p.rol === 'tecnico') return t.asignado === p.id;
    return enAlcance(t.barrio);
  }
  const visEnc = (e) => me().rol !== 'tecnico' && enAlcance(e.barrio);
  const barriosVis = () => G.BARRIOS.filter((b) => enAlcance(b.id));
  const puede = (accion) => {
    const r = me().rol;
    return { gestionar: r !== 'tecnico', configurar: r === 'direccion', reasignarBarrio: r === 'direccion', campo: r === 'tecnico' }[accion];
  };

  /* ── avisos ── */
  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.innerHTML = msg;
    $('#toasts').appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 5200);
  }

  /* ════════ barra superior ════════ */
  function renderTop() {
    const sel = $('#role');
    sel.innerHTML = G.PERSONAS.map((p) => {
      const bs = p.rol === 'operador' ? (p.barrios.length > 1 ? `${p.barrios.length} barrios` : G.barrio(p.barrios[0]).nombre) : '';
      return `<option value="${p.id}" ${p.id === ui.rol ? 'selected' : ''}>${G.ROL_TXT[p.rol]}${bs ? ' · ' + esc(bs) : ''} — ${esc(p.nombre)}</option>`;
    }).join('');
    const p = me();
    let h;
    if (p.rol === 'tecnico') h = '<span class="lock">AISLADO</span> Sólo tickets asignados a vos';
    else {
      const bs = barriosRol();
      if (p.rol === 'operador' && bs.length === 1) h = `<span class="lock">AISLADO</span> ${esc(G.barrio(bs[0]).nombre)} · otros barrios ocultos`;
      else h = `${p.rol === 'operador' ? '<span class="lock">AISLADO</span>' : ''}<select id="tenant" aria-label="Barrio">
        <option value="*">${p.rol === 'direccion' ? 'Todos los barrios' : 'Mis barrios'}</option>
        ${bs.map((b) => `<option value="${b}" ${ui.barrio === b ? 'selected' : ''}>${esc(G.barrio(b).nombre)}</option>`).join('')}</select>`;
    }
    $('#scope').innerHTML = h;
    renderBell();
  }
  function alertasVis() {
    return S.cfg.alertas.filter((a) => {
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
      <ol>${l.map((a) => `<li class="${a.leida ? '' : 'unread'}"><button type="button" data-a="al" data-t="${esc(a.ticket || '')}" data-k="${a.tipo}">
        <span class="k k-${TIPO[a.tipo][0]}">${TIPO[a.tipo][1]}</span><span class="tx">${esc(a.txt)}</span><small>${fdt(a.t)} · ${ago(a.t)}</small></button></li>`).join('') || '<li class="none">Sin alertas en tu alcance.</li>'}</ol>
      <p class="note">Avisos internos de la central · SIMULADOS: no se envía nada fuera de esta pantalla.</p>`;
  }
  function renderClock() {
    const off = S.cfg.offset || 0;
    const d = new Date(G.now());
    $('#clockTime').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    $('#clockOff').textContent = off ? '+' + dur(off) : '';
    $('#clock').classList.toggle('ahead', !!off);
  }

  /* ════════ pestañas ════════ */
  const TABS = [
    ['tickets', 'Tickets', 'M4 6h16M4 12h16M4 18h10'],
    ['lotes', 'Lotes', 'M4 20V9l8-5 8 5v11zM9 20v-6h6v6'],
    ['exp', 'Experiencia', 'M5 5h14v10H9l-4 4z M9 10h.01M12 10h.01M15 10h.01'],
    ['rep', 'Reputación', 'M12 3l2.7 5.6 6.1.8-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1L3.2 9.4l6.1-.8z'],
    ['sla', 'SLA y config.', 'M12 7v5l3 2M12 3a9 9 0 1 0 .01 0'],
  ];
  const tabsRol = () => (me().rol === 'tecnico' ? ['tickets'] : TABS.map((t) => t[0]));
  function renderTabs() {
    if (!tabsRol().includes(ui.vista)) ui.vista = 'tickets';
    const det = S.enc.filter((e) => visEnc(e) && e.recup && e.recup.estado === 'abierta').length;
    $('#tabs').innerHTML = TABS.filter((t) => tabsRol().includes(t[0])).map(([id, txt, d]) => {
      const lbl = me().rol === 'tecnico' && id === 'tickets' ? 'Mis visitas' : txt;
      const badge = id === 'exp' && det ? `<i class="bd">${det}</i>` : '';
      return `<button type="button" role="tab" data-v="${id}" class="${ui.vista === id ? 'on' : ''}" aria-selected="${ui.vista === id}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${lbl}</span>${badge}</button>`;
    }).join('');
  }

  /* ════════ vista: tickets ════════ */
  function slaCell(t) {
    const s = G.sla(t);
    const w = Math.min(100, s.pct * 100);
    const rem = t.estado === 'cerrado' ? `en ${dur(+new Date(t.cerrado) - +new Date(t.creado))}` : s.rest >= 0 ? `quedan ${dur(s.rest)}` : `+${dur(s.rest)}`;
    return `<div class="sla s-${s.st}" data-sla="${t.id}">
      <i class="lamp" aria-hidden="true"></i>
      <div class="fuse" title="${G.umbral()} % del SLA = alerta automática"><b style="width:${w.toFixed(1)}%"></b><u style="left:${G.umbral()}%"></u></div>
      <span class="st">${SLA_TXT[s.st]}</span><span class="rem">${rem}</span></div>`;
  }
  const plural = (n, s, p) => `${n} ${n === 1 ? s : p || s + 's'}`;
  function quienTxt(t) {
    const g = t.reporta.rol === 'Guardia';
    return esc(t.reporta.nombre) + (g ? '' : ' · ' + esc(t.reporta.rol)) + (g && t.origen === 'guardia' ? '' : ' · ' + (ORIG[t.origen] || esc(t.origen)));
  }
  function rowT(t) {
    const hijos = S.tickets.filter((x) => x.vinculado === t.id && vis(x)).length;
    const tec = t.asignado ? G.persona(t.asignado).nombre : '—';
    return `<article class="tk ${t.estado === 'cerrado' ? 'closed' : ''} ${fresh.has(t.id) ? 'fresh' : ''} ${t.vinculado ? 'linked' : ''}" data-id="${t.id}" tabindex="0" role="button" aria-label="${esc(t.id + ' ' + t.titulo)}">
      ${slaCell(t)}
      <div class="m"><span class="id">${t.id}${t.origen === 'bot' ? '<em class="o-bot">BOT</em>' : ''}${t.vinculado ? `<em class="o-link">↳ ${t.vinculado}</em>` : ''}</span>
        <b>${esc(t.titulo)}</b>
        <small>${quienTxt(t)}</small></div>
      <div class="w"><b>${esc(G.barrio(t.barrio).nombre)}</b><small>${esc(loteTxt(t.lote))}${hijos ? ` · <span class="more">+${hijos} reporte${hijos > 1 ? 's' : ''}</span>` : ''}</small></div>
      <div class="c">${esc(G.cat(t.cat).nombre)}<small>SLA ${G.cat(t.cat).h} h</small></div>
      <div class="a">${esc(tec)}</div>
      <div class="e"><span class="chip e-${t.estado}">${EST[t.estado]}</span></div>
    </article>`;
  }
  function vTickets() {
    const all = S.tickets.filter(vis);
    const open = all.filter((t) => t.estado !== 'cerrado');
    const ss = new Map(all.map((t) => [t.id, G.sla(t)]));
    const riesgo = open.filter((t) => ss.get(t.id).st === 'riesgo');
    const venc = open.filter((t) => ss.get(t.id).st === 'vencido');
    const c30 = all.filter((t) => t.estado === 'cerrado' && G.now() - new Date(t.cerrado) < 30 * G.D);
    const cumpl = c30.length ? Math.round((c30.filter((t) => ss.get(t.id).st === 'cumplido').length / c30.length) * 100) : null;
    const F = { abiertos: open, riesgo, vencidos: venc, cerrados: all.filter((t) => t.estado === 'cerrado') };
    if (!F[ui.filtro]) ui.filtro = 'abiertos';
    const q = G.norm(ui.q);
    let list = F[ui.filtro].filter((t) => (!ui.cat || t.cat === ui.cat) && (!q || G.norm([t.id, t.titulo, t.reporta.nombre, t.lote, G.barrio(t.barrio).nombre, t.caso_id].join(' ')).includes(q)));
    if (ui.filtro === 'cerrados') list = list.sort((a, b) => (a.cerrado < b.cerrado ? 1 : -1)).slice(0, 80);
    else list = list.sort((a, b) => ss.get(b.id).pct - ss.get(a.id).pct);
    const casos = (() => { try { return JSON.parse(localStorage.getItem(G.K.casos) || '[]').filter((c) => c && c.derivado_central === 'sí').length; } catch (_) { return 0; } })();
    const tec = me().rol === 'tecnico';
    return `
      <section class="kpis">
        <div class="kpi cut"><span>${tec ? 'Mis visitas abiertas' : 'Abiertos'}</span><b>${open.length}</b><small>${open.filter((t) => t.estado === 'nuevo').length} sin tomar</small></div>
        <div class="kpi cut k-riesgo"><span>En riesgo · ≥ ${G.umbral()} %</span><b>${riesgo.length}</b><small>alerta automática enviada</small></div>
        <div class="kpi cut k-vencido"><span>Vencidos</span><b>${venc.length}</b><small>escalados a Dirección</small></div>
        <div class="kpi cut"><span>SLA cumplido · 30 d</span><b>${cumpl == null ? '—' : cumpl + ' %'}</b><small>${c30.length} cerrados</small></div>
      </section>
      <div class="live"><i></i>EN VIVO · ${tec ? 'tickets asignados a vos' : `escuchando al bot SILA · ${casos} caso${casos === 1 ? '' : 's'} derivado${casos === 1 ? '' : 's'} en este navegador`}</div>
      <div class="filters">
        <div class="seg" role="group" aria-label="Filtro">
          ${[['abiertos', 'Abiertos', open.length], ['riesgo', 'En riesgo', riesgo.length], ['vencidos', 'Vencidos', venc.length], ['cerrados', 'Cerrados', F.cerrados.length]]
            .map(([k, l, n]) => `<button type="button" data-f="${k}" class="${ui.filtro === k ? 'on' : ''} f-${k}">${l} <i>${n}</i></button>`).join('')}
        </div>
        <select id="fcat" aria-label="Categoría"><option value="">Todas las categorías</option>${G.cats().map((c) => `<option value="${c.id}" ${ui.cat === c.id ? 'selected' : ''}>${esc(c.nombre)} · ${c.h} h</option>`).join('')}</select>
        <input id="fq" type="search" placeholder="Buscar ticket, lote, vecino…" value="${esc(ui.q)}" aria-label="Buscar">
      </div>
      <div class="grid" role="list">
        <div class="gh" aria-hidden="true"><span>Semáforo SLA</span><span>Ticket</span><span>Barrio · lote</span><span>Categoría</span><span>Técnico</span><span>Estado</span></div>
        ${list.map(rowT).join('') || `<p class="empty">${tec ? 'No tenés visitas asignadas.' : 'No hay tickets con este filtro.'}</p>`}
      </div>`;
  }
  // actualización segundo a segundo del semáforo sin redibujar la grilla
  function tickSLA() {
    $$('[data-sla]').forEach((el) => {
      const t = S.tickets.find((x) => x.id === el.dataset.sla);
      if (!t || t.estado === 'cerrado') return;
      const s = G.sla(t);
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
    const tecs = G.PERSONAS.filter((p) => p.rol === 'tecnico');
    const gest = puede('gestionar') && t.estado !== 'cerrado';
    const x = t.ctx;
    return `
      <div class="dh">
        <div class="r1"><span class="id">${t.id}${t.caso_id ? ` · caso ${esc(t.caso_id)}` : ''}</span><button type="button" class="x" data-a="cerrarFicha" aria-label="Cerrar ficha">✕</button></div>
        <h2>${esc(t.titulo)}</h2>
        <div class="tags"><span class="chip e-${t.estado}">${EST[t.estado]}</span><span class="chip">${esc(G.barrio(t.barrio).nombre)} · ${esc(loteTxt(t.lote))}</span><span class="chip">${ORIG[t.origen] || esc(t.origen)}</span></div>
      </div>
      <div class="db">
        <section class="slabox cut s-${s.st}">
          ${slaCell(t).replace('class="sla ', 'class="sla big ')}
          <dl><div><dt>Categoría</dt><dd>${esc(c.nombre)} · ${c.h} h</dd></div>
            <div><dt>Creado</dt><dd>${fdt(t.creado)}</dd></div>
            <div><dt>Alerta ${G.umbral()} %</dt><dd>${fdt(s.aviso)}${t.alertas && t.alertas.a75 ? ' · enviada' : ''}</dd></div>
            <div><dt>Vence</dt><dd>${fdt(s.limite)}</dd></div></dl>
        </section>
        ${x ? `<h4>Contexto que trajo el bot <span class="mini">no se le volvió a pedir nada al residente</span></h4>
          <div class="ctx cut">
            <p class="q">“${esc(x.consulta)}”</p>
            ${x.aclaraciones ? `<p><span>Aclaraciones</span>${esc(x.aclaraciones)}</p>` : ''}
            ${x.modulo ? `<p><span>Módulo</span>${esc(x.modulo)}</p>` : ''}
            ${x.fuentes ? `<p><span>Fuentes citadas</span>${esc(x.fuentes)}</p>` : ''}
            <p><span>Pasos que ya intentó</span></p><pre>${esc(x.pasos || '— El bot no encontró una solución documentada.')}</pre>
            ${x.resultado ? `<p><span>Resultado informado</span>${esc(x.resultado)}</p>` : ''}
            ${x.estado_bot ? `<p><span>Estado en el bot</span>${esc(x.estado_bot)}</p>` : ''}
          </div>` : ''}
        <h4>Quién reporta</h4>
        <dl class="kv"><dt>Nombre</dt><dd>${esc(t.reporta.nombre)} <span class="mini">${esc(t.reporta.rol)}</span></dd>
          <dt>Celular</dt><dd>${esc(t.reporta.cel || '—')}</dd><dt>Correo</dt><dd>${esc(t.reporta.correo || '—')}</dd>
          ${t.barrio === G.SIN_BARRIO.id ? `<dt>Barrio informado</dt><dd>“${esc(t.barrio_txt)}” · no coincide con un barrio registrado</dd>` : ''}</dl>
        ${t.lote ? `<button type="button" class="link" data-a="verLote" data-k="${esc(G.loteKey(t))}">Historial de ${esc(loteTxt(t.lote))} · ${mismos.length + 1} reporte${mismos.length ? 's' : ''} →</button>` : ''}
        ${gest ? `<h4>Gestión</h4>
          <div class="estados">${['nuevo', 'en_curso', 'en_campo'].map((e) => `<button type="button" data-a="estado" data-k="${e}" class="${t.estado === e ? 'on' : ''}">${EST[e]}</button>`).join('')}</div>
          <div class="form2">
            <label>Técnico de campo<select data-a="asignar"><option value="">Sin asignar</option>${tecs.map((p) => `<option value="${p.id}" ${t.asignado === p.id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></label>
            <label>Categoría (recalcula el SLA)<select data-a="cat">${G.cats().map((k) => `<option value="${k.id}" ${t.cat === k.id ? 'selected' : ''}>${esc(k.nombre)} · ${k.h} h</option>`).join('')}</select></label>
            ${puede('reasignarBarrio') ? `<label>Barrio<select data-a="barrio">${[...G.BARRIOS, G.SIN_BARRIO].map((b) => `<option value="${b.id}" ${t.barrio === b.id ? 'selected' : ''}>${esc(b.nombre)}</option>`).join('')}</select></label>` : ''}
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
        : `<p class="mini">Sin respuesta todavía.</p><button type="button" class="ghost" data-a="responder" data-k="${e.id}">Simular respuesta del residente</button>`}`;
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
  function refreshFicha() { if (openId) { const sc = $('#drawer').scrollTop; abrirFicha(openId); $('#drawer').scrollTop = sc; } }

  function accionFicha(a, k, val) {
    const t = S.tickets.find((x) => x.id === openId);
    if (!t) return;
    const quien = `${me().nombre} (${G.ROL_TXT[me().rol]})`;
    if (a === 'estado' && t.estado !== k) {
      G.evento(t, `Estado: ${EST[t.estado]} → ${EST[k]}`, quien); t.estado = k;
    } else if (a === 'asignar') {
      t.asignado = val || null;
      G.evento(t, val ? `Asignado a ${G.persona(val).nombre} · aviso SIMULADO al técnico` : 'Sin técnico asignado', quien);
      if (val && t.estado === 'nuevo') t.estado = 'en_curso';
    } else if (a === 'cat') {
      const prev = G.cat(t.cat);
      t.cat = val;
      const s = G.sla(t);
      t.alertas = t.alertas || {};
      if (s.pct < G.umbral() / 100) delete t.alertas.a75;
      if (s.pct < 1) delete t.alertas.a100;
      G.evento(t, `Recategorizado: ${prev.nombre} (${prev.h} h) → ${G.cat(val).nombre} (${G.cat(val).h} h) · SLA recalculado`, quien);
    } else if (a === 'barrio') {
      G.evento(t, `Barrio reasignado: ${G.barrio(t.barrio).nombre} → ${G.barrio(val).nombre}`, quien);
      t.barrio = val;
    } else if (a === 'nota') {
      const v = $('#nota').value.trim();
      if (!v) return;
      G.evento(t, v, quien);
    } else return;
    G.save('tickets');
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
    const tecnico = puede('campo');
    modal(`<h3>Cerrar ${t.id}</h3><p class="sub">${esc(t.titulo)}</p>
      <fieldset class="who-res"><legend>¿Quién lo resolvió?</legend>
        <label><input type="radio" name="rp" value="persona" checked><span><b>Una persona</b> (operador o técnico)<small>${ICON.mail} Encuesta por <b>email formal</b> a ${esc(t.reporta.correo || 'sin correo → WhatsApp')}</small></span></label>
        ${tecnico ? '' : `<label><input type="radio" name="rp" value="bot"><span><b>El bot SILA</b> en el chat (Filtro Cero)<small>${ICON.wa} Encuesta por <b>WhatsApp</b> en el mismo chat</small></span></label>`}
      </fieldset>
      <label class="ta">Nota de cierre<textarea id="ncierre" rows="2" maxlength="300" placeholder="Qué se hizo"></textarea></label>
      <div class="mact"><button type="button" class="ghost" data-m="cancel">Cancelar</button><button type="button" class="primary cut" data-m="close" data-k="${t.id}">Cerrar y enviar encuesta</button></div>`);
  }
  function cerrarTicket(id) {
    const t = S.tickets.find((x) => x.id === id);
    if (!t || t.estado === 'cerrado') return;
    const rp = ($('#modal input[name=rp]:checked') || {}).value || 'persona';
    const nota = ($('#ncierre') || {}).value || '';
    t.estado = 'cerrado';
    t.cerrado = G.iso();
    t.resuelto_por = rp;
    const s = G.sla(t);
    G.evento(t, `Cerrado · resolvió ${rp === 'bot' ? 'el bot SILA' : me().nombre} · SLA ${s.st === 'cumplido' ? 'cumplido' : 'incumplido'}${nota ? ' · ' + nota.trim() : ''}`, `${me().nombre} (${G.ROL_TXT[me().rol]})`);
    // los reportes vinculados del mismo lote se cierran juntos
    S.tickets.filter((x) => x.vinculado === t.id && x.estado !== 'cerrado').forEach((x) => {
      x.estado = 'cerrado'; x.cerrado = t.cerrado; x.resuelto_por = rp;
      G.evento(x, `Cerrado junto con ${t.id} (mismo lote y categoría)`, 'Consolidación');
      G.enviarEncuesta(x);
    });
    const e = G.enviarEncuesta(t);
    G.save();
    render();
    refreshFicha();
    if (e) modalMensaje(e, t);
    else { cerrarModal(); toast(`<b>${t.id} CERRADO</b> Lo reportó la guardia: no se envía encuesta de experiencia.`, 'info'); }
  }
  function mensaje(e, t, tipo) {
    const b = G.barrio(e.barrio);
    const nom = e.nombre.split(' ')[0];
    const link = tipo === 'resena' ? `g.page/r/${G.norm(b.nombre).replace(/ /g, '-')}/review` : `encuesta.silicon-access.demo/${e.id}`;
    if (e.canal === 'whatsapp') {
      const txt = tipo === 'resena'
        ? `¡Gracias por tu 10, ${esc(nom)}! Si tenés un minuto, ¿nos dejás tu reseña de ${esc(b.nombre)} en Google? Nos ayuda muchísimo.`
        : `Listo, ${esc(nom)}: tu caso ${esc(e.ticket)} quedó resuelto. ¿Nos contás cómo te atendimos? Son 2 preguntas.`;
      return `<div class="wa-msg"><div class="wa-head">${ICON.wa}<span>Silicon Access · WhatsApp</span><span class="to">${esc(e.para)}</span></div>
        <div class="bubble">${txt}<span class="lnk">${link}</span><small>${fhm(G.now())} ✓✓</small></div></div>`;
    }
    return `<div class="mail-msg"><div class="mh"><p><span>Para</span>${esc(e.nombre)} &lt;${esc(e.para)}&gt;</p>
      <p><span>Asunto</span>${tipo === 'resena' ? `Su opinión sobre ${esc(b.nombre)} en Google` : `Su caso ${esc(e.ticket)} fue resuelto · ¿Cómo lo atendimos?`}</p></div>
      <div class="mb"><p>Estimada/o ${esc(e.nombre)}:</p>
      ${tipo === 'resena' ? `<p>Gracias por su valoración. Si lo desea, puede publicar su opinión sobre el servicio de acceso de ${esc(b.nombre)} en Google:</p>`
        : `<p>Le informamos que el caso <b>${esc(e.ticket)}</b>${t ? ` («${esc(t.titulo)}»)` : ''}, correspondiente a ${esc(loteTxt(e.lote).toLowerCase())} de ${esc(b.nombre)}, fue resuelto el ${fdt(G.now())}.</p>
      <p>Su opinión nos ayuda a mejorar. Responder la encuesta lleva menos de un minuto:</p>`}
      <p class="btnl">${tipo === 'resena' ? 'Dejar reseña' : 'Responder encuesta'} · <u>${link}</u></p>
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
      <div class="mact"><button type="button" class="ghost" data-m="cancel">Más tarde</button><button type="button" class="primary cut" data-m="resp" data-k="${e.id}" disabled>Guardar respuesta</button></div></div>`;
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
    modal(`<h3>Encuesta ${e.id}</h3><p class="sub">${esc(e.nombre)} · ${esc(G.barrio(e.barrio).nombre)} · ticket ${esc(e.ticket)}</p>${formRespuesta(e)}`);
  }
  function guardarRespuesta(id) {
    const e = S.enc.find((x) => x.id === id);
    const nps = +($('#modal .npspick .on') || {}).dataset?.nps;
    const csat = +($('#modal .csatpick .on') || {}).dataset?.csat;
    if (!e || Number.isNaN(nps) || Number.isNaN(csat)) return;
    const cl = G.responder(e, nps, csat, $('#rcom').value.trim());
    G.save();
    render();
    refreshFicha();
    if (cl === 'detractor') {
      modal(`<div class="stamp bad">ALERTA DE DETRACTOR</div><h3>${esc(e.nombre)} puso ${nps}</h3>
        <p class="sub">Se abrió el protocolo de recuperación: llamar antes de 24 h, revisar la causa, ofrecer una acción y re-encuestar a los 7 días.</p>
        <div class="mact"><button type="button" class="ghost" data-m="cancel">Cerrar</button><button type="button" class="primary cut" data-m="goexp">Ver protocolo</button></div>`);
    } else if (cl === 'promotor') {
      modal(`<div class="stamp ok">PROMOTOR</div><h3>${esc(e.nombre)} puso ${nps}</h3>
        <p class="sub">Es el momento de pedirle la reseña de Google de ${esc(G.barrio(e.barrio).nombre)}.</p>
        <div class="mact"><button type="button" class="ghost" data-m="cancel">Ahora no</button><button type="button" class="primary cut" data-m="resena" data-k="${e.id}">Pedir reseña (simulado)</button></div>`);
    } else { cerrarModal(); toast(`Respuesta registrada: NPS ${nps} · ${cl}`); }
  }
  function pedirResena(id, silencioso) {
    const e = S.enc.find((x) => x.id === id);
    if (!e) return;
    G.pedirResena(e);
    const t = S.tickets.find((x) => x.id === e.ticket);
    t && G.evento(t, `Pedido de reseña de Google por ${e.canal === 'email' ? 'email' : 'WhatsApp'} · SIMULADO`, 'Experiencia');
    G.save();
    render();
    if (!silencioso) modal(`<div class="stamp">SIMULADO · no se envió nada</div><h3>Pedido de reseña · ${esc(G.barrio(e.barrio).nombre)}</h3>${mensaje(e, t, 'resena')}
      <div class="mact"><button type="button" class="primary cut" data-m="cancel">Listo</button></div>`);
  }

  /* ════════ vista: lotes (historial consolidado) ════════ */
  function lotesDe(bid) {
    const m = new Map();
    Object.entries(G.LOTES[bid] || {}).forEach(([l, us]) => m.set(G.loteKey({ barrio: bid, lote: l }), { barrio: bid, lote: l, usuarios: us.map(([n, r]) => ({ n, r })), tickets: [] }));
    S.tickets.filter((t) => t.barrio === bid && t.lote && vis(t)).forEach((t) => {
      const k = G.loteKey(t);
      if (!m.has(k)) m.set(k, { barrio: bid, lote: t.lote, usuarios: [], tickets: [] });
      const L = m.get(k);
      L.tickets.push(t);
      if (t.reporta.rol !== 'Guardia' && !L.usuarios.some((u) => G.norm(u.n) === G.norm(t.reporta.nombre))) L.usuarios.push({ n: t.reporta.nombre, r: t.reporta.rol, nuevo: t.origen === 'bot' ? 'detectado por el bot' : 'nuevo' });
    });
    return [...m.values()].sort((a, b) => (a.lote === 'ACCESO') - (b.lote === 'ACCESO') || b.tickets.filter((t) => t.estado !== 'cerrado').length - a.tickets.filter((t) => t.estado !== 'cerrado').length || b.tickets.length - a.tickets.length);
  }
  function vLotes() {
    const bs = barriosVis();
    if (!bs.length) return '<p class="empty">Elegí un barrio.</p>';
    let todos = bs.flatMap((b) => lotesDe(b.id));
    const q = G.norm(ui.q);
    if (q) todos = todos.filter((L) => G.norm([L.lote, G.barrio(L.barrio).nombre, ...L.usuarios.map((u) => u.n)].join(' ')).includes(q));
    if (!ui.lote || !todos.some((L) => G.loteKey(L) === ui.lote)) { const d0 = todos.find((L) => L.tickets.length > 2) || todos[0]; ui.lote = d0 ? G.loteKey(d0) : null; }
    const L = todos.find((x) => G.loteKey(x) === ui.lote);
    return `<div class="lotes">
      <aside class="llist cut">
        <input id="fq" type="search" placeholder="Buscar lote o vecino…" value="${esc(ui.q)}" aria-label="Buscar lote">
        <ol>${todos.map((x) => {
          const ab = x.tickets.filter((t) => t.estado !== 'cerrado').length;
          return `<li><button type="button" data-lote="${esc(G.loteKey(x))}" class="${G.loteKey(x) === ui.lote ? 'on' : ''}">
            <b>${esc(loteTxt(x.lote))}</b><small>${esc(G.barrio(x.barrio).nombre)} · ${x.lote === 'ACCESO' ? 'área común' : plural(x.usuarios.length, 'usuario')}</small>
            <span class="cnt">${x.tickets.length}${ab ? `<i>${ab} abiertos</i>` : ''}</span></button></li>`;
        }).join('')}</ol>
      </aside>
      <section class="ldet">${L ? loteDetalle(L) : '<p class="empty">Sin lotes.</p>'}</section></div>`;
  }
  function loteDetalle(L) {
    const ts = L.tickets.slice().sort((a, b) => (a.creado < b.creado ? 1 : -1));
    const fuentes = new Set(ts.map((t) => t.reporta.nombre));
    const items = [];
    ts.forEach((t) => (t.eventos || []).forEach((e, i) => { if (i === 0 || /Cerrado|Asignado|Encuesta respondida|Vinculado|Alerta|vencido/i.test(e.txt)) items.push({ t: e.t, txt: e.txt, tk: t, first: i === 0 }); }));
    items.sort((a, b) => (a.t < b.t ? 1 : -1));
    return `<header class="lh"><div><span class="eyebrow">Historial consolidado</span><h2>${esc(G.barrio(L.barrio).nombre)} · ${esc(loteTxt(L.lote))}</h2>
        <p class="mini">${ts.length} tickets · ${fuentes.size} fuentes distintas (familia, guardia, bot) sobre la misma propiedad</p></div></header>
      <div class="users">${L.usuarios.map((u) => `<span class="u"><b>${esc(u.n)}</b><small>${esc(u.r)}${u.nuevo ? ' · ' + esc(u.nuevo) : ''}</small></span>`).join('')}${ts.some((t) => t.reporta.rol === 'Guardia') ? `<span class="u g"><b>${esc(G.GUARDIA[L.barrio] || 'Guardia')}</b><small>reporta sobre este lote</small></span>` : ''}</div>
      <h4>Tickets del lote</h4>
      <div class="ltk">${ts.map((t) => `<button type="button" class="lt ${t.vinculado ? 'linked' : ''}" data-open="${t.id}"><span class="chip e-${t.estado}">${EST[t.estado]}</span><b>${t.id}</b><span class="tt">${esc(t.titulo)}</span><small>${esc(t.reporta.nombre)} · ${esc(t.reporta.rol)} · ${fdt(t.creado)}${t.vinculado ? ' · vinculado a ' + t.vinculado : ''}</small></button>`).join('') || '<p class="mini">Sin tickets.</p>'}</div>
      <h4>Línea de tiempo</h4>
      <ol class="tl lt2">${items.slice(0, 60).map((i) => `<li class="${i.first ? 'rep' : ''}"><small>${fdt(i.t)} · <button type="button" class="tkl" data-open="${i.tk.id}">${i.tk.id}</button> · ${i.first ? esc(i.tk.reporta.nombre) + ' (' + esc(i.tk.reporta.rol) + ') por ' + (ORIG[i.tk.origen] || i.tk.origen) : ''}</small>${i.first ? '<b>Reporte:</b> ' + esc(i.tk.titulo) : esc(i.txt)}</li>`).join('')}</ol>`;
  }

  /* ════════ vista: experiencia ════════ */
  const PASOS = ['Llamar al residente antes de 24 h', 'Revisar la causa en la bitácora del ticket', 'Ofrecer una acción concreta (visita, seguimiento)', 'Re-encuestar a los 7 días'];
  function npsDe(l) {
    const r = l.filter((e) => e.estado === 'respondida');
    if (!r.length) return null;
    const p = r.filter((e) => e.nps >= 9).length, d = r.filter((e) => e.nps <= 6).length;
    return { nps: Math.round(((p - d) / r.length) * 100), n: r.length, p, d, pa: r.length - p - d, csat: r.reduce((a, e) => a + e.csat, 0) / r.length };
  }
  function vExp() {
    const enc = S.enc.filter(visEnc);
    const e30 = enc.filter((e) => G.now() - new Date(e.enviado) < 30 * G.D);
    const N = npsDe(e30);
    const resp = e30.filter((e) => e.estado === 'respondida').length;
    const det = enc.filter((e) => e.recup && e.recup.estado === 'abierta');
    const recCerr = enc.filter((e) => e.recup && e.recup.estado !== 'abierta');
    const F = { todas: enc, pendientes: enc.filter((e) => e.estado !== 'respondida'), detractores: enc.filter((e) => G.CLASE(e.nps) === 'detractor') };
    if (!F[ui.encF]) ui.encF = 'todas';
    return `
      <section class="kpis">
        <div class="kpi cut"><span>Encuestas enviadas · 30 d</span><b>${e30.length}</b><small>${e30.filter((e) => e.canal === 'whatsapp').length} WhatsApp · ${e30.filter((e) => e.canal === 'email').length} email</small></div>
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
        <div class="revs">${barriosVis().map((b) => revCard(b, enc.filter((e) => e.barrio === b.id))).join('')}</div>
      </section>
      <section class="block">
        <header class="bh"><h3>Encuestas</h3>
          <div class="seg sm">${[['todas', 'Todas'], ['pendientes', 'Sin responder'], ['detractores', 'Detractores']].map(([k, l]) => `<button type="button" data-ef="${k}" class="${ui.encF === k ? 'on' : ''}">${l} <i>${F[k].length}</i></button>`).join('')}</div></header>
        <ol class="encs">${F[ui.encF].slice(0, 30).map(encRow).join('') || '<li class="mini">Nada para mostrar.</li>'}</ol>
      </section>`;
  }
  const npsCls = (n) => (n >= 30 ? 'good' : n >= 0 ? 'mid' : 'bad');
  const fmtNps = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
  function detCard(e) {
    const rest = +new Date(e.recup.limite || 0) - G.now();
    const done = e.recup.pasos.filter(Boolean).length;
    return `<article class="det cut">
      <header><span class="nps n-detractor">NPS ${e.nps}</span><b>${esc(e.nombre)}</b><small>${esc(G.barrio(e.barrio).nombre)} · ${esc(loteTxt(e.lote))} · <button type="button" class="tkl" data-open="${e.ticket}">${e.ticket}</button></small></header>
      ${e.comentario ? `<p class="com">“${esc(e.comentario)}”</p>` : ''}
      <p class="due ${rest < 0 ? 'late' : rest < 6 * G.H ? 'soon' : ''}">${rest >= 0 ? `Llamar antes de ${dur(rest)}` : `Llamada atrasada ${dur(rest)}`}</p>
      <ol class="proto">${PASOS.map((p, i) => `<li><label><input type="checkbox" data-paso="${i}" data-k="${e.id}" ${e.recup.pasos[i] ? 'checked' : ''}><span>${p}</span></label></li>`).join('')}</ol>
      <div class="dact"><button type="button" class="ghost" data-a="recup" data-k="${e.id}" data-v="no_recuperado">No recuperado</button>
        <button type="button" class="primary cut" data-a="recup" data-k="${e.id}" data-v="recuperado" ${done < 3 ? 'disabled title="Completá al menos los 3 primeros pasos"' : ''}>Recuperado</button></div>
    </article>`;
  }
  function revCard(b, enc) {
    const pro = enc.filter((e) => e.resena);
    const pend = pro.filter((e) => e.resena.estado === 'pendiente');
    const ped = pro.filter((e) => e.resena.estado === 'pedida');
    const pub = pro.filter((e) => e.resena.estado === 'publicada');
    return `<article class="rev cut"><header><b>${esc(b.nombre)}</b><small>Perfil de Google (ficticio) · g.page/r/${esc(G.norm(b.nombre).replace(/ /g, '-'))}</small></header>
      <div class="funnel"><span><b>${pend.length}</b>promotores sin pedir</span><span><b>${ped.length}</b>pedidas</span><span><b>${pub.length}</b>publicadas</span></div>
      <ul>${pend.slice(0, 3).map((e) => `<li><span>${esc(e.nombre)} <small>NPS ${e.nps}</small></span><button type="button" class="ghost sm" data-a="resena" data-k="${e.id}">Pedir</button></li>`).join('')}
        ${ped.slice(0, 2).map((e) => `<li><span>${esc(e.nombre)} <small>pedida ${ago(e.resena.t)}</small></span><button type="button" class="ghost sm" data-a="publicar" data-k="${e.id}">Simular publicación</button></li>`).join('')}</ul>
      ${pend.length ? `<button type="button" class="primary cut sm" data-a="resenaTodos" data-k="${b.id}">Pedir ${pend.length === 1 ? 'al promotor' : `a los ${pend.length} promotores`}</button>` : ''}</article>`;
  }
  function encRow(e) {
    const cl = G.CLASE(e.nps);
    return `<li class="enc"><span class="canal c-${e.canal}" title="${e.canal === 'email' ? 'Email formal' : 'WhatsApp'}">${e.canal === 'email' ? ICON.mail : ICON.wa}</span>
      <span class="who"><b>${esc(e.nombre)}</b><small>${esc(G.barrio(e.barrio).nombre)} · <button type="button" class="tkl" data-open="${e.ticket}">${e.ticket}</button> · ${fdt(e.enviado)}</small></span>
      ${e.estado === 'respondida' ? `<span class="nps n-${cl}">${e.nps}</span><span class="cs">${e.csat}/5</span>` : `<button type="button" class="ghost sm" data-a="responder" data-k="${e.id}">Simular respuesta</button>`}</li>`;
  }

  /* ════════ vista: reputación ════════ */
  function statsBarrio(b) {
    const enc = S.enc.filter((e) => e.barrio === b.id);
    const N = npsDe(enc.filter((e) => G.now() - new Date(e.enviado) < 90 * G.D));
    const ts = S.tickets.filter((t) => t.barrio === b.id);
    const cerr = ts.filter((t) => t.estado === 'cerrado');
    const cumpl = cerr.length ? Math.round((cerr.filter((t) => G.sla(t).st === 'cumplido').length / cerr.length) * 100) : null;
    const pub = enc.filter((e) => e.resena && e.resena.estado === 'publicada');
    const [base, n] = b.g;
    const rating = n + pub.length ? (base * n + pub.reduce((a, e) => a + (e.resena.estrellas || 5), 0)) / (n + pub.length) : null;
    const semanas = Array.from({ length: 8 }, (_, i) => {
      const hasta = G.now() - (7 - i) * 7 * G.D, desde = hasta - 7 * G.D;
      const x = npsDe(enc.filter((e) => e.resp_t && +new Date(e.resp_t) > desde && +new Date(e.resp_t) <= hasta));
      return { desde, hasta, v: x && x.n >= 2 ? x.nps : null, n: x ? x.n : 0 };
    });
    return { b, N, cumpl, abiertos: ts.filter((t) => t.estado !== 'cerrado').length, det: enc.filter((e) => e.recup && e.recup.estado === 'abierta').length, rating, nG: n + pub.length, viaSila: pub.length, pedidas: enc.filter((e) => e.resena && e.resena.estado === 'pedida').length, semanas };
  }
  function spark(sem) {
    const W = 220, Hh = 54, pad = 6;
    const x = (i) => pad + (i * (W - 2 * pad)) / (sem.length - 1);
    const y = (v) => pad + ((100 - v) / 200) * (Hh - 2 * pad);
    let d = '', pen = false;
    sem.forEach((s, i) => { if (s.v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(s.v).toFixed(1); pen = true; });
    const pts = sem.map((s, i) => (s.v == null ? '' : `<g class="pt"><circle cx="${x(i)}" cy="${y(s.v)}" r="9" class="hit"/><circle cx="${x(i)}" cy="${y(s.v)}" r="3.2" class="dot"/><title>Semana al ${fdt(s.hasta).slice(0, 5)}: NPS ${fmtNps(s.v)} (${s.n} respuestas)</title></g>`)).join('');
    return `<svg class="spark" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="NPS por semana, últimas 8 semanas"><line x1="${pad}" x2="${W - pad}" y1="${y(0)}" y2="${y(0)}" class="zero"/><path d="${d}"/>${pts}</svg>`;
  }
  function vRep() {
    const st = barriosVis().map(statsBarrio).sort((a, b) => (b.N ? b.N.nps : -999) - (a.N ? a.N.nps : -999));
    const allEnc = S.enc.filter(visEnc).filter((e) => G.now() - new Date(e.enviado) < 90 * G.D);
    const N = npsDe(allEnc);
    const rs = st.filter((s) => s.rating);
    const rAvg = rs.length ? rs.reduce((a, s) => a + s.rating * s.nG, 0) / rs.reduce((a, s) => a + s.nG, 0) : null;
    return `
      <section class="kpis">
        <div class="kpi cut"><span>NPS · 90 d</span><b class="${N ? npsCls(N.nps) : ''}">${N ? fmtNps(N.nps) : '—'}</b><small>${N ? N.n + ' respuestas' : ''}</small></div>
        <div class="kpi cut"><span>CSAT</span><b>${N ? N.csat.toFixed(1) : '—'}<em>/5</em></b><small>promedio 90 d</small></div>
        <div class="kpi cut"><span>Google <span class="simtag">SIMULADO</span></span><b>${rAvg ? rAvg.toFixed(2) : '—'}<em>★</em></b><small>${rs.reduce((a, s) => a + s.nG, 0)} reseñas · ${rs.reduce((a, s) => a + s.viaSila, 0)} vía SILA</small></div>
        <div class="kpi cut"><span>Detractores abiertos</span><b class="${st.reduce((a, s) => a + s.det, 0) ? 'bad' : ''}">${st.reduce((a, s) => a + s.det, 0)}</b><small>con protocolo en curso</small></div>
      </section>
      <p class="legend"><span><i class="lg good"></i>NPS ≥ +30 saludable</span><span><i class="lg mid"></i>0 a +29 a mejorar</span><span><i class="lg bad"></i>negativo · crítico</span></p>
      <div class="barrios">${st.map((s, i) => repCard(s, i + 1)).join('')}</div>`;
  }
  function repCard(s, pos) {
    const n = s.N;
    const v = n ? n.nps : 0;
    const half = Math.min(50, Math.abs(v) / 2);
    return `<article class="bc cut ${n ? 'b-' + npsCls(v) : ''}">
      <header><span class="pos">${String(pos).padStart(2, '0')}</span><div><b>${esc(s.b.nombre)}</b><small>${esc(s.b.loc)}</small></div>
        <div class="big ${n ? npsCls(v) : ''}">${n ? fmtNps(v) : '—'}<small>NPS · ${n ? n.n : 0} resp.</small></div></header>
      <div class="diverge" role="img" aria-label="NPS ${n ? fmtNps(v) : 'sin datos'} en escala de −100 a +100"><span class="mid"></span>${n ? `<b class="${v >= 0 ? 'pos' : 'neg'} ${npsCls(v)}" style="${v >= 0 ? 'left:50%' : 'right:50%'};width:${half}%"></b>` : ''}<small class="l">−100</small><small class="r">+100</small></div>
      ${n ? `<div class="mix" role="img" aria-label="${n.p} promotores, ${n.pa} pasivos, ${n.d} detractores"><b class="p" style="flex:${n.p}"></b><b class="pa" style="flex:${n.pa}"></b><b class="d" style="flex:${n.d}"></b></div>
        <p class="mixl"><span>${Math.round((n.p / n.n) * 100)} % promotores</span><span>${Math.round((n.pa / n.n) * 100)} % pasivos</span><span>${Math.round((n.d / n.n) * 100)} % detractores</span></p>` : ''}
      <dl class="st">
        <div><dt>CSAT</dt><dd>${n ? n.csat.toFixed(1) : '—'}<em>/5</em></dd></div>
        <div><dt>Google <span class="simtag">SIM</span></dt><dd>${s.rating ? s.rating.toFixed(1) : '—'}<em>★ ${s.nG}</em></dd></div>
        <div><dt>SLA cumplido</dt><dd>${s.cumpl == null ? '—' : s.cumpl + '<em>%</em>'}</dd></div>
        <div><dt>Abiertos</dt><dd>${s.abiertos}${s.det ? `<em class="bad"> · ${s.det} detr.</em>` : ''}</dd></div>
      </dl>
      <div class="trend"><span class="mini">NPS por semana · 8 sem.</span>${spark(s.semanas)}</div>
      <footer><span>${plural(s.viaSila, 'reseña publicada', 'reseñas publicadas')} vía SILA · ${plural(s.pedidas, 'pedida')}</span></footer>
    </article>`;
  }

  /* ════════ vista: SLA y configuración ════════ */
  function vSla() {
    const dir = puede('configurar');
    const open = S.tickets.filter((t) => t.estado !== 'cerrado' && vis(t));
    let casos = [];
    try { casos = JSON.parse(localStorage.getItem(G.K.casos) || '[]'); } catch (_) { /* */ }
    const der = casos.filter((c) => c && c.derivado_central === 'sí');
    return `
      <section class="block">
        <header class="bh"><h3>Motor de SLA por categoría</h3>${dir ? '' : '<span class="mini">Sólo Dirección puede editarlo</span>'}</header>
        <div class="slat cut">
          <div class="sr0"><span>Categoría</span><span>Plazo</span><span>Alerta automática</span><span>Abiertos</span></div>
          ${G.cats().map((c) => `<div class="sr1"><span>${esc(c.nombre)}</span>
            <span>${dir ? `<input type="number" min="1" max="240" step="1" value="${c.h}" data-cfg="h" data-k="${c.id}" aria-label="Horas de ${esc(c.nombre)}"> h` : c.h + ' h'}</span>
            <span class="mono">a las ${dur((c.h * G.umbral() * G.H) / 100)}</span>
            <span class="mono">${open.filter((t) => t.cat === c.id).length}</span></div>`).join('')}
          <div class="sr2"><label>Alerta al ${dir ? `<input type="number" min="50" max="95" step="5" value="${G.umbral()}" data-cfg="umbral" aria-label="Umbral de alerta"> %` : G.umbral() + ' %'} del tiempo</label>
            <span class="mini">Al cruzarlo: aviso al operador de turno y al supervisor. Al 100 %: escalado a Dirección. Avisos SIMULADOS.</span></div>
        </div>
      </section>
      <section class="block">
        <header class="bh"><h3>Conexión con el bot SILA Ayuda</h3></header>
        <div class="conn cut">
          <p><span class="dotlive"></span><b>${der.length}</b> caso${der.length === 1 ? '' : 's'} derivado${der.length === 1 ? '' : 's'} a la central · ${casos.length} en total en este navegador.</p>
          <p class="mini">Cada caso que el bot deriva aparece como ticket con su consulta, pasos intentados y fuentes. Al caso sólo se le anota el número de ticket.</p>
          <a class="primary cut" href="../index.html?ayuda=1" target="_blank" rel="noopener">Abrir el bot de residentes ↗</a>
        </div>
      </section>
      <section class="block">
        <header class="bh"><h3>Demo</h3></header>
        <div class="conn cut"><p class="mini">Los datos son ficticios y viven sólo en este navegador. Restablecer vuelve a generar barrios, tickets y encuestas de ejemplo (los casos del bot se vuelven a importar).</p>
          <button type="button" class="ghost" data-a="reset">Restablecer datos de ejemplo</button></div>
      </section>`;
  }

  /* ════════ render general ════════ */
  const VISTAS = { tickets: vTickets, lotes: vLotes, exp: vExp, rep: vRep, sla: vSla };
  function render() {
    renderTop();
    renderTabs();
    const v = $('#view');
    const focusId = document.activeElement && document.activeElement.id;
    const pos = focusId === 'fq' ? document.activeElement.selectionStart : null;
    v.dataset.v = ui.vista;
    v.innerHTML = VISTAS[ui.vista]();
    if (focusId === 'fq' && $('#fq')) { $('#fq').focus(); $('#fq').setSelectionRange(pos, pos); }
    keep();
    alto();
  }
  function alto() { const h = $('.top').offsetHeight; document.documentElement.style.setProperty('--toph', h + 'px'); $('#pop').style.top = h + 6 + 'px'; }
  addEventListener('resize', alto);

  /* ════════ eventos ════════ */
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('button, [data-id], [data-open]');
    if (!b) return;
    const d = b.dataset;
    if (b.closest('#tabs') && d.v) { ui.vista = d.v; ui.q = ''; render(); $('#view').focus(); scrollTo(0, 0); return; }
    if (d.f) { ui.filtro = d.f; render(); return; }
    if (d.ef) { ui.encF = d.ef; render(); return; }
    if (d.lote) { ui.lote = d.lote; render(); if (innerWidth < 900) $('.ldet').scrollIntoView({ behavior: 'smooth' }); return; }
    if (d.open) { abrirFicha(d.open); return; }
    if (d.adv != null) { S.cfg.offset = +d.adv ? (S.cfg.offset || 0) + d.adv * 60000 : 0; G.save('cfg'); tick(); render(); toast(+d.adv ? `Reloj demo adelantado ${d.adv} min` : 'Reloj demo en hora real'); return; }
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
        toast(`${l.length} pedidos de reseña de ${esc(G.barrio(d.k).nombre)} · SIMULADO, no se envió nada`);
        break;
      }
      case 'publicar': { const e = S.enc.find((x) => x.id === d.k); e.resena = { ...e.resena, estado: 'publicada', estrellas: 5, tp: G.iso() }; G.save('enc'); render(); toast('Reseña publicada (simulado) · actualiza la reputación del barrio'); break; }
      case 'recup': {
        const e = S.enc.find((x) => x.id === d.k);
        e.recup.estado = d.v;
        if (d.v === 'recuperado') e.recup.renps = 8;
        const t = S.tickets.find((x) => x.id === e.ticket);
        t && G.evento(t, d.v === 'recuperado' ? 'Detractor recuperado · re-encuesta simulada NPS 8' : 'Detractor no recuperado · se cierra el protocolo', `${me().nombre}`);
        G.save(); render(); toast(d.v === 'recuperado' ? 'Protocolo cerrado: recuperado' : 'Protocolo cerrado: no recuperado');
        break;
      }
      case 'al': {
        S.cfg.alertas.forEach((a) => { if (a.ticket === d.t && a.tipo === d.k) a.leida = true; });
        G.save('cfg'); $('#pop').hidden = true;
        if (d.k === 'detractor') { ui.vista = 'exp'; render(); } else if (d.t) { render(); abrirFicha(d.t); }
        break;
      }
      case 'leer': alertasVis().forEach((a) => (a.leida = true)); G.save('cfg'); renderBell(); renderPop(); break;
      case 'reset': if (confirm('¿Restablecer los datos de ejemplo? Se pierden los cambios hechos en esta demo.')) { G.seed(); G.syncBot(); cerrarFicha(); render(); toast('Datos de ejemplo restablecidos'); } break;
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
    if (el.id === 'role') { ui.rol = el.value; ui.barrio = '*'; ui.q = ''; ui.lote = null; cerrarFicha(); $('#pop').hidden = true; render(); toast(`Viendo como ${esc(G.ROL_TXT[me().rol])} · ${esc(me().nombre)}`); return; }
    if (el.id === 'tenant') { ui.barrio = el.value; ui.lote = null; cerrarFicha(); render(); return; }
    if (el.id === 'fcat') { ui.cat = el.value; render(); return; }
    if (el.dataset.a && ['asignar', 'cat', 'barrio'].includes(el.dataset.a)) { accionFicha(el.dataset.a, null, el.value); return; }
    if (el.dataset.paso != null) {
      const e = S.enc.find((x) => x.id === el.dataset.k);
      e.recup.pasos[+el.dataset.paso] = el.checked;
      const t = S.tickets.find((x) => x.id === e.ticket);
      el.checked && t && G.evento(t, 'Protocolo de recuperación: ' + PASOS[+el.dataset.paso], me().nombre);
      G.save(); render(); return;
    }
    if (el.dataset.cfg) {
      if (el.dataset.cfg === 'h') { const c = S.cfg.cats.find((x) => x.id === el.dataset.k); c.h = Math.max(1, Math.min(240, +el.value || c.h)); }
      if (el.dataset.cfg === 'umbral') S.cfg.umbral = Math.max(50, Math.min(95, +el.value || 75));
      G.save('cfg'); tick(); render(); toast('Motor de SLA actualizado');
    }
  });
  document.addEventListener('input', (ev) => { if (ev.target.id === 'fq') { ui.q = ev.target.value; clearTimeout(render.k); render.k = setTimeout(render, 160); } });
  $('#scrim').addEventListener('click', cerrarFicha);
  $('#modal').addEventListener('click', (ev) => { if (ev.target.id === 'modal') cerrarModal(); });

  /* ════════ tiempo real ════════ */
  function tick() {
    renderClock();
    const nuevas = G.revisarSLA();
    if (nuevas.length) {
      nuevas.filter((n) => vis(n.t)).forEach((n) => toast(`<b>${n.tipo === 'a75' ? `ALERTA ${G.umbral()} % SLA` : 'SLA VENCIDO'}</b> ${esc(n.txt)}`, n.tipo === 'a75' ? 'warn' : 'bad'));
      render();
      refreshFicha();
    } else tickSLA();
  }
  let rawCasos = null;
  function desdeBot() {
    const raw = localStorage.getItem(G.K.casos);
    if (raw === rawCasos) return;
    rawCasos = raw;
    const nuevos = G.syncBot();
    if (!nuevos.length) { if (ui.vista === 'sla' || ui.vista === 'tickets') render(); refreshFicha(); return; }
    nuevos.forEach((t) => { fresh.add(t.id); setTimeout(() => fresh.delete(t.id), 4000); });
    nuevos.filter(vis).forEach((t) => toast(`<b>NUEVO TICKET ${t.id}</b> desde el bot · ${esc(G.barrio(t.barrio).nombre)}${t.lote ? ' · ' + esc(loteTxt(t.lote)) : ''}`, 'info'));
    render();
  }

  G.init();
  if (!G.persona(ui.rol)) ui.rol = 'dir';
  G.syncBot();
  render();
  tick();
  setInterval(tick, 1000);
  setInterval(desdeBot, 5000); // respaldo por si el navegador no entrega el aviso en vivo
  G.onChange((src) => { if (src === 'bot') desdeBot(); else { render(); refreshFicha(); } });
  window.SILA_GESTION = { ui, render, abrirFicha }; // para pruebas
})();
