/* Bandeja comercial simulada: tablero, planilla, ficha y CSV */
(function () {
  const S = window.SILA_STORE;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const tcls = (t) => String(t || '').replace('í', 'i');
  const TNAME = { caliente: 'CALIENTE', tibio: 'TIBIO', 'frío': 'FRÍO' };
  const ENAME = { nuevo: 'Nuevo', contactado: 'Contactado', propuesta: 'Propuesta', ganado: 'Ganado' };
  let view = 'board', openId = null, known = new Set(S.read().map((l) => l.id));

  const ago = (iso) => {
    const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
    if (m < 1) return 'recién';
    if (m < 60) return `hace ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `hace ${h} h`;
    return `hace ${Math.round(h / 24)} d`;
  };
  const fdate = (iso) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const contacto = (l) => l.email || l.telefono || '';

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.k);
    toast.k = setTimeout(() => t.classList.remove('show'), 2800);
  }

  /* ── KPIs ── */
  function kpis(list) {
    const hot = list.filter((l) => l.temperatura === 'caliente').length;
    const nuevos = list.filter((l) => l.estado === 'nuevo').length;
    const segs = list.map((l) => (l.origen || {}).segundos).filter(Boolean);
    const avg = segs.length ? Math.round(segs.reduce((a, b) => a + b, 0) / segs.length) : 0;
    const byV = {};
    list.forEach((l) => (byV[l.vertical] = (byV[l.vertical] || 0) + 1));
    const top = Object.entries(byV).sort((a, b) => b[1] - a[1])[0];
    $('#kpis').innerHTML = `
      <div class="kpi"><span>Leads recibidos</span><b>${list.length}</b><small>${nuevos} sin contactar</small></div>
      <div class="kpi hot"><span>Calientes</span><b>${hot}</b><small>prioridad de llamada</small></div>
      <div class="kpi"><span>Tiempo promedio en SILA</span><b>${avg ? avg + ' s' : '—'}</b><small>de punta a punta</small></div>
      <div class="kpi"><span>Vertical principal</span><b style="font-size:18px;line-height:1.6">${top ? esc(top[0]) : '—'}</b><small>${top ? top[1] + ' lead' + (top[1] > 1 ? 's' : '') : ''}</small></div>`;
  }

  /* ── tablero ── */
  function board(list, fresh) {
    $('#board').innerHTML = S.ESTADOS.map((e) => {
      const items = list.filter((l) => (l.estado || 'nuevo') === e);
      return `<div class="col" data-e="${e}"><h3>${ENAME[e]} <i>${items.length}</i></h3>${items.map((l) => card(l, fresh)).join('')}</div>`;
    }).join('');
    $('#board').querySelectorAll('.lead').forEach((c) => {
      c.addEventListener('click', () => openLead(c.dataset.id));
      c.addEventListener('dragstart', (ev) => ev.dataTransfer.setData('text/plain', c.dataset.id));
    });
    $('#board').querySelectorAll('.col').forEach((col) => {
      col.addEventListener('dragover', (ev) => { ev.preventDefault(); col.classList.add('over'); });
      col.addEventListener('dragleave', () => col.classList.remove('over'));
      col.addEventListener('drop', (ev) => {
        ev.preventDefault(); col.classList.remove('over');
        const id = ev.dataTransfer.getData('text/plain');
        if (id) { S.setEstado(id, col.dataset.e); render(); }
      });
    });
  }
  const card = (l, fresh) => `<article class="lead${fresh && fresh.has(l.id) ? ' fresh' : ''}" draggable="true" data-id="${esc(l.id)}">
      <div class="top"><span class="vert">${esc(l.vertical)}</span><span class="t ${tcls(l.temperatura)}">${TNAME[l.temperatura] || ''}</span></div>
      <div class="acc">${esc(l.cuenta)}</div>
      <div class="meta">${esc(l.nombre)} ${esc(l.apellido)} · ${esc(l.rol)}</div>
      <div class="foot"><span>${esc(l.id)}</span><span>${ago(l.fecha)}</span></div>
    </article>`;

  /* ── planilla ── */
  const COLS = [
    ['Fecha', (l) => fdate(l.fecha)], ['ID', (l) => l.id], ['Temperatura', (l) => TNAME[l.temperatura] || ''], ['Estado', (l) => ENAME[l.estado] || ''],
    ['Vertical', (l) => l.vertical], ['Cuenta', (l) => l.cuenta], ['Nombre', (l) => `${l.nombre} ${l.apellido}`], ['Rol', (l) => l.rol],
    ['Localidad', (l) => l.localidad], ['Email', (l) => l.email], ['Teléfono', (l) => l.telefono], ['Necesidad', (l) => l.necesidad],
    ['Etapa', (l) => l.etapa], ['Origen', (l) => (l.origen || {}).utm_medium || ''], ['Resumen', (l) => (l.resumen || '').replace(/\n/g, ' · ')],
  ];
  function sheet(list, fresh) {
    const letters = COLS.map((_, i) => String.fromCharCode(65 + i));
    $('#grid').innerHTML =
      `<thead><tr><th class="n"></th>${letters.map((x) => `<th>${x}</th>`).join('')}</tr></thead><tbody>` +
      `<tr><td class="n">1</td>${COLS.map(([h]) => `<td>${h}</td>`).join('')}</tr>` +
      list.map((l, i) => `<tr data-id="${esc(l.id)}"${fresh && fresh.has(l.id) ? ' class="fresh"' : ''}><td class="n">${i + 2}</td>${COLS.map(([, f]) => `<td title="${esc(f(l))}">${esc(f(l))}</td>`).join('')}</tr>`).join('') +
      Array.from({ length: Math.max(0, 12 - list.length) }, (_, k) => `<tr><td class="n">${list.length + k + 2}</td>${COLS.map(() => '<td></td>').join('')}</tr>`).join('') +
      '</tbody>';
    $('#grid').querySelectorAll('tr[data-id]').forEach((r) => r.addEventListener('click', () => openLead(r.dataset.id)));
  }

  /* ── ficha ── */
  function openLead(id) {
    const l = S.read().find((x) => x.id === id);
    if (!l) return;
    openId = id;
    history.replaceState(null, '', '#' + id);
    const t = TNAME[l.temperatura] || '';
    const mail =
      `Nuevo lead SILA ${l.id} · ${t}\n\n${l.cuenta} — ${l.vertical}\n${l.nombre} ${l.apellido} (${l.rol}) · ${l.localidad}\n${contacto(l)}\n\nNecesidad: ${l.necesidad}\nEtapa: ${l.etapa}`;
    $('#drawer').innerHTML = `
      <div class="dh">
        <div class="row1"><span class="id">${esc(l.id)} · ${fdate(l.fecha)}${l.ejemplo ? ' · ejemplo' : ''}</span><button class="x" type="button" id="dx" aria-label="Cerrar">✕</button></div>
        <h2>${esc(l.cuenta)}</h2>
        <div class="tags"><span class="vert">${esc(l.vertical)}</span><span class="t ${tcls(l.temperatura)}">${t} · score ${l.score}</span></div>
      </div>
      <div class="db">
        <h4>Contacto</h4>
        <dl class="contact">
          <dt>Nombre</dt><dd>${esc(l.nombre)} ${esc(l.apellido)}</dd>
          <dt>Rol</dt><dd>${esc(l.rol)}</dd>
          <dt>Localidad</dt><dd>${esc(l.localidad)}</dd>
          ${l.email ? `<dt>Email</dt><dd>${esc(l.email)}</dd>` : ''}
          ${l.telefono ? `<dt>Teléfono</dt><dd>${esc(l.telefono)}</dd>` : ''}
          <dt>Necesidad</dt><dd>${esc(l.necesidad)}</dd>
          <dt>Etapa</dt><dd>${esc(l.etapa)}</dd>
        </dl>
        <div class="acts">
          <button type="button" data-a="Llamada">📞 Llamar</button>
          <button type="button" class="wa" data-a="WhatsApp">WhatsApp</button>
          <button type="button" data-a="Mail">✉ Mail</button>
        </div>
        <h4>Estado</h4>
        <div class="estado">${S.ESTADOS.map((e) => `<button type="button" data-e="${e}" class="${(l.estado || 'nuevo') === e ? 'on' : ''}">${ENAME[e]}</button>`).join('')}</div>
        <h4>Respuestas en SILA</h4>
        <ul class="qa">${(l.respuestas || []).map((r) => `<li><span>${esc(r.pregunta)}</span><b>${esc(r.respuesta)}</b></li>`).join('')}</ul>
        <h4>Actividad</h4>
        <ul class="tl">${(l.eventos || []).slice().reverse().map((e) => `<li>${esc(e.txt)}<small>${fdate(e.t)}</small></li>`).join('')}</ul>
        <h4>Aviso enviado al comercial</h4>
        <details class="mail"><summary>SILA · ${esc(t)} · ${esc(l.cuenta)}</summary><pre>${esc(mail)}</pre></details>
      </div>`;
    $('#drawer').classList.add('open');
    $('#drawer').setAttribute('aria-hidden', 'false');
    $('#scrim').classList.add('show');
    $('#dx').addEventListener('click', closeLead);
    $('#drawer').querySelectorAll('[data-e]').forEach((b) => b.addEventListener('click', () => { S.setEstado(id, b.dataset.e); render(); openLead(id); }));
    $('#drawer').querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.a;
      S.log(id, `${a} iniciada (simulado)`);
      if ((l.estado || 'nuevo') === 'nuevo') S.setEstado(id, 'contactado');
      toast(`${a} a ${l.nombre} — simulado, no se contactó a nadie.`);
      render(); openLead(id);
    }));
  }
  function closeLead() {
    openId = null;
    $('#drawer').classList.remove('open');
    $('#drawer').setAttribute('aria-hidden', 'true');
    $('#scrim').classList.remove('show');
    history.replaceState(null, '', location.pathname + location.search);
  }

  /* ── CSV (abre en Excel o Google Sheets) ── */
  function csv() {
    const list = S.read();
    if (!list.length) return toast('No hay leads para exportar.');
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [COLS.map(([h]) => q(h)).join(';')].concat(list.map((l) => COLS.map(([, f]) => q(f(l))).join(';')));
    const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `leads-sila-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('CSV descargado: abrilo con Excel o importalo en Google Sheets.');
  }

  /* ── render ── */
  function render(fresh) {
    const list = S.read().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    kpis(list);
    $('#empty').hidden = list.length > 0;
    $('#board').hidden = view !== 'board' || !list.length;
    $('#sheet').hidden = view !== 'sheet' || !list.length;
    board(list, fresh);
    sheet(list, fresh);
  }

  document.querySelectorAll('.views button').forEach((b) => b.addEventListener('click', () => {
    view = b.dataset.v;
    document.querySelectorAll('.views button').forEach((x) => x.classList.toggle('on', x === b));
    render();
  }));
  $('#csv').addEventListener('click', csv);
  $('#seed').addEventListener('click', () => { S.seed(); render(); toast('Se cargaron 5 leads de ejemplo (ficticios).'); });
  $('#wipe').addEventListener('click', () => {
    if (!confirm('¿Vaciar todos los leads de esta demo? (sólo se borran de este navegador)')) return;
    S.clear(); closeLead(); render(); known = new Set();
  });
  $('#scrim').addEventListener('click', closeLead);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLead(); });

  // en vivo: llega un lead desde SILA en otra pestaña
  S.onChange(() => {
    const list = S.read();
    const fresh = new Set(list.filter((l) => !known.has(l.id)).map((l) => l.id));
    known = new Set(list.map((l) => l.id));
    render(fresh);
    const nuevo = list.find((l) => fresh.has(l.id) && !l.ejemplo);
    if (nuevo) toast(`Nuevo lead: ${nuevo.cuenta} · ${TNAME[nuevo.temperatura] || ''}`);
    if (openId) openLead(openId);
  });

  if (!S.read().length) S.seed();
  known = new Set(S.read().map((l) => l.id));
  render();
  const h = decodeURIComponent(location.hash.slice(1));
  if (h) setTimeout(() => openLead(h), 200);
  setInterval(() => { if (!openId) render(); }, 60000); // refresca "hace X min"
})();
