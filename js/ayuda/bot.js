/* SILA Ayuda — asistente de primera ayuda para residentes.
 * Reglas: responde SOLO con fragmentos literales de los manuales (SILA_KB), cita manual y página,
 * pregunta si se resolvió (resuelto sólo si el residente lo confirma) y, si no, deja el caso pendiente
 * y ofrece derivarlo a la central. Nunca afirma un registro o envío que no ocurrió.
 */
(function () {
  const KB = window.SILA_KB, CASOS = window.SILA_CASOS;
  if (!KB || !CASOS) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const ISO = '<svg viewBox="0 0 3 3" aria-hidden="true"><path d="M1 0H2V1H3V2L2 3H1V2H0V1Z" fill="#fff"/></svg>';
  const DOC = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 1h5l3 3v7H2z" fill="none" stroke="currentColor"/><path d="M7 1v3h3" fill="none" stroke="currentColor"/></svg>';
  const AUD = { residente: 'Residentes', general: 'General', administracion: 'Administración', admin_guardia: 'Administración y guardia' };
  const demo = CASOS.isDemo();
  const ROOT = KB.ROOT;

  /* ── DOM ── */
  const root = document.createElement('div');
  root.className = 'ay-root';
  root.innerHTML = `
    <button type="button" class="ay-launch" aria-haspopup="dialog" aria-controls="ayPanel">
      <span class="ic">${ISO}<i class="dot"></i></span>
      <span class="tx"><small>RESIDENTES</small><b>¿Problemas con la app?</b></span>
    </button>
    <section class="ay-panel" id="ayPanel" role="dialog" aria-modal="false" aria-label="SILA Ayuda para residentes">
      <header class="ay-hd">
        <span class="iso">${ISO}</span>
        <span class="t"><b>SILA Ayuda</b><small><i>●</i> SÓLO MANUALES OFICIALES · ${'<span id="ayDocs">…</span>'}</small></span>
        <button type="button" class="ay-x" aria-label="Cerrar ayuda"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.6"/></svg></button>
      </header>
      ${demo ? '<div class="ay-demo"><b>DEMO</b> · Los casos se guardan sólo en este navegador. No se envía ningún correo ni se escribe la planilla real.</div>' : ''}
      <div class="ay-log" id="ayLog" aria-live="polite"></div>
      <form class="ay-in" id="ayForm" autocomplete="off">
        <label class="sr" for="ayText" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Escribí tu problema</label>
        <textarea id="ayText" rows="1" maxlength="600" placeholder="Contame qué te pasa…"></textarea>
        <button class="ay-send" type="submit" aria-label="Enviar"><svg viewBox="0 0 18 18"><path d="M2 9h12M9 3l6 6-6 6" fill="none" stroke="#fff" stroke-width="2"/></svg></button>
      </form>
      <div class="ay-foot">Respuestas basadas exclusivamente en la documentación de Silicon Access</div>
    </section>`;
  document.body.appendChild(root);
  document.body.classList.add('has-ayuda');
  const $ = (s) => root.querySelector(s);
  const log = $('#ayLog'), txt = $('#ayText'), form = $('#ayForm');

  /* ── estado ── */
  let st = { phase: 'idle', caso: null, query: '', ctx: {} };
  let started = false;

  const scroll = () => requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
  function add(html, cls = 'ay-bot') {
    const d = document.createElement('div');
    d.className = 'ay-m ' + cls;
    d.innerHTML = html;
    log.appendChild(d);
    scroll();
    return d;
  }
  const me = (t) => { const d = add('', 'ay-me'); d.textContent = t; };
  const sys = (html, kind = '') => add(html, 'ay-sys ' + kind);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function typing(ms = 550) {
    const d = add('<span class="ay-typing"><i></i><i></i><i></i></span>', 'ay-bot');
    d.style.padding = '0';
    await wait(ms);
    d.remove();
  }
  function opts(list) {
    const box = document.createElement('div');
    box.className = 'ay-opts';
    list.forEach((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ay-opt' + (o.pri ? ' pri' : '');
      b.textContent = o.label;
      b.addEventListener('click', () => {
        if (box.classList.contains('used')) return;
        box.classList.add('used');
        b.classList.add('sel');
        o.run();
      });
      box.appendChild(b);
    });
    log.appendChild(box);
    scroll();
    return box;
  }
  const lockInput = (on) => { txt.disabled = on; form.querySelector('button').disabled = on; };

  /* ── registro honesto ── */
  function informe(res, okTxt) {
    if (res.ok && res.simulated) sys(`${okTxt} · <span class="id">${st.caso.caso_id}</span> · DEMO: guardado sólo en este navegador`, 'warn');
    else if (res.ok) sys(`${okTxt} · <span class="id">${st.caso.caso_id}</span>`, 'ok');
    else sys(`No se pudo registrar en el sistema (${esc(res.error)}). El caso <span class="id">${st.caso.caso_id}</span> no quedó guardado.`, 'bad');
    return res;
  }
  async function guardar(evento, okTxt) {
    return informe(await CASOS.enviar('upsert', st.caso, evento), okTxt);
  }

  /* ── abrir / cerrar ── */
  async function open() {
    root.classList.add('open');
    setTimeout(() => txt.focus(), 250);
    if (started) return;
    started = true;
    add('<p>Hola, soy <b>SILA Ayuda</b>. Contame qué problema tenés con la app o los servicios de Silicon Access y lo busco en los manuales oficiales.</p><p style="color:#8ea2c2;font-size:12.5px">Respondo sólo con lo que dicen los manuales. Si algo no está documentado, te lo voy a decir.</p>');
    try {
      const K = await KB.load();
      $('#ayDocs').textContent = `${Object.keys(K.docs).length} MANUALES`;
    } catch (e) {
      $('#ayDocs').textContent = 'SIN MANUALES';
      sys('No pude cargar la documentación. Sin manuales no puedo responder consultas.', 'bad');
    }
  }
  function close() { root.classList.remove('open'); $('.ay-launch').focus(); }
  $('.ay-launch').addEventListener('click', open);
  $('.ay-x').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root.classList.contains('open') && !document.querySelector('.ay-view')) close(); });

  /* ── entrada ── */
  txt.addEventListener('input', () => { txt.style.height = 'auto'; txt.style.height = Math.min(txt.scrollHeight, 120) + 'px'; });
  txt.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const t = txt.value.trim();
    if (!t || txt.disabled) return;
    txt.value = ''; txt.style.height = 'auto';
    me(t);
    log.querySelectorAll('.ay-opts:not(.used)').forEach((b) => b.classList.add('used'));
    await onText(t);
  });

  const SI = /^(si|sí|s|dale|ok|listo|resuelto|se resolvio|se resolvió|funciono|funcionó|ya esta|ya está)\b/i;
  const NO = /^(no|nop|sigue|tampoco|todavia no|todavía no)\b/i;

  async function onText(t) {
    try { await KB.load(); } catch (_) { sys('No pude cargar la documentación.', 'bad'); return; }
    if (st.phase === 'confirm') {
      if (SI.test(t)) return resolved();
      if (NO.test(t)) return notResolved();
      // información nueva sobre el mismo caso
      appendClar(t);
      return handle(st.query + ' ' + t, { clarified: true, module: st.ctx.module });
    }
    if (st.phase === 'escalate') {
      if (SI.test(t)) return showForm();
      if (NO.test(t)) return keepPending();
    }
    if (st.phase === 'clar' || st.phase === 'choose') {
      appendClar(t);
      return handle(st.query + ' ' + t, { clarified: true, module: st.ctx.module });
    }
    // consulta nueva → caso nuevo
    st = { phase: 'busy', caso: newCaso(t), query: t, ctx: {} };
    await guardar('Consulta registrada', 'Consulta registrada');
    return handle(t, {});
  }
  function newCaso(t) {
    const now = new Date().toISOString();
    return { caso_id: CASOS.nuevoId(), creado: now, estado: 'abierto', consulta: t, aclaraciones: '', modulo: '', fuentes_citadas: '', pasos_intentados: '',
      resultado: '', derivado_central: '', correo_enviado: '', monday_ticket: '', barrio: '', residente: '', lote: '', celular: '', correo: '',
      origen: location.pathname.split('/').pop() || 'index.html' };
  }
  function appendClar(t) { st.caso.aclaraciones = (st.caso.aclaraciones ? st.caso.aclaraciones + ' | ' : '') + t; }

  /* ── decisión ── */
  async function handle(q, ctx) {
    st.ctx = ctx;
    st.phase = 'busy';
    await typing();
    const d = KB.decide(q, ctx);
    if (d.type === 'vague') {
      if (ctx.clarified) return notFound();
      st.phase = 'clar';
      add('<p>Para buscarlo en los manuales necesito un poco más de detalle: <b>¿con qué función es y qué te pasa?</b> Podés elegir una o escribirlo.</p>');
      const mods = residentModules();
      opts(mods.map((m) => ({ label: m, run: () => pickModule(m) })));
      return;
    }
    if (d.type === 'choose') {
      st.phase = 'choose';
      add('<p>Encontré información sobre esto en más de un módulo. <b>¿Sobre cuál es tu consulta?</b></p>');
      opts([...d.modules.map((m) => ({ label: m, run: () => { me(m); handle(st.query, { module: m, clarified: true }); } })),
        { label: 'Ninguno de estos', run: () => { me('Ninguno de estos'); notFound(); } }]);
      return;
    }
    if (d.type === 'narrow') {
      st.phase = 'clar';
      st.ctx = { module: d.module };
      add(`<p>Lo encuentro en <b>${esc(d.module)}</b>. ¿Qué pasa exactamente? Contame qué querés hacer o qué mensaje te aparece.</p>`);
      opts([{ label: `Ver cómo funciona ${d.module}`, run: () => { me(`Ver cómo funciona ${d.module}`); handle(st.query, { module: d.module, clarified: true }); } }]);
      return;
    }
    if (d.type === 'none') return notFound();
    if (d.conflict) return showConflict(d);
    return answer(d, d.frags);
  }
  function pickModule(m) {
    me(m);
    st.ctx = { module: m };
    st.phase = 'clar';
    add(`<p>Bien, <b>${esc(m)}</b>. ¿Qué querías hacer o qué te aparece en pantalla?</p>`);
    txt.focus();
  }
  function residentModules() {
    const ds = Object.values(KB.K.docs).filter((x) => x.audience === 'residente' || x.audience === 'general');
    return [...new Set(ds.map((x) => x.module))].filter((m) => m !== 'App móvil').sort((a, b) => a.localeCompare(b, 'es')).slice(0, 14);
  }

  /* ── respuesta con fragmentos citados ── */
  const fmtSrc = (c) => `${c.doc.title}${c.page ? ` (pág. ${c.page})` : ''}`;
  function fragHTML(h, A) {
    const c = h.chunk, d = c.doc;
    const { lines, cut } = KB.excerpt(c, A, 9);
    const mark = (s) => esc(s).replace(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+/g, (w) => (A.expanded.includes(KB.stem(KB.fold(w))) && w.length > 2 ? `<mark>${w}</mark>` : w));
    let html = '', list = null;
    const close = () => { if (list) { html += `</${list}>`; list = null; } };
    lines.forEach((l) => {
      const num = /^(\d+)[.)]\s+(.*)$/.exec(l), bul = /^•\s+(.*)$/.exec(l);
      if (num || bul) {
        const want = num ? 'ol' : 'ul';
        if (list !== want) { close(); html += want === 'ol' ? `<ol start="${num[1]}">` : '<ul>'; list = want; }
        html += `<li>${mark(num ? num[2] : bul[1])}</li>`;
      } else { close(); html += `<p${/[?:]$/.test(l) && l.length < 60 ? ' class="h"' : ''}>${mark(l)}</p>`; }
    });
    close();
    const adm = /^admin/.test(d.audience);
    const drive = d.drive_ids && d.drive_ids[0] ? `https://drive.google.com/file/d/${d.drive_ids[0]}/view` : '';
    return `<div class="ay-frag">
      <div class="ay-src"><span class="doc">${DOC}${esc(d.title)}</span>${c.page ? `<span class="pg">pág. ${c.page}</span>` : ''}${c.section && c.page === null ? `<span class="pg">${esc(c.section)}</span>` : ''}<span class="aud${adm ? ' adm' : ''}">${AUD[d.audience] || d.audience}</span></div>
      ${html}${cut ? '<div class="cut">… fragmento de la página · el resto en “Ver página”</div>' : ''}
      ${d.text_status === 'ocr' ? '<div class="ay-ocr">Texto leído por OCR de una imagen del manual: verificá con la página.</div>' : ''}
      <div class="ay-fact">${c.image ? `<button type="button" data-page="${c.id}">Ver página del manual</button>` : ''}${drive ? `<a href="${drive}" target="_blank" rel="noopener">Abrir PDF ↗</a>` : ''}</div>
    </div>`;
  }
  async function answer(d, frags) {
    const mod = frags[0].chunk.doc.module;
    st.caso.modulo = mod;
    st.caso.fuentes_citadas = frags.map((h) => fmtSrc(h.chunk)).join(' · ');
    st.caso.pasos_intentados = frags.map((h) => `[${fmtSrc(h.chunk)}]\n${KB.excerpt(h.chunk, d.A, 9).lines.join('\n')}`).join('\n\n');
    const intro = d.adminOnly
      ? '<p>Sólo encontré esto en un manual dirigido a la <b>administración del barrio</b>; puede que algunos pasos no estén disponibles para residentes:</p>'
      : `<p>Esto dicen los manuales de <b>${esc(mod)}</b>:</p>`;
    add(intro + frags.map((h) => fragHTML(h, d.A)).join(''));
    await guardar(`Respuesta con ${frags.length} fragmento(s): ${st.caso.fuentes_citadas}`, 'Respuesta registrada en el caso');
    await wait(300);
    st.phase = 'confirm';
    add('<p><b>¿Se resolvió tu problema?</b></p>');
    opts([{ label: 'Sí, se resolvió', pri: true, run: () => { me('Sí, se resolvió'); resolved(); } },
      { label: 'No, sigue igual', run: () => { me('No, sigue igual'); notResolved(); } }]);
  }
  function showConflict(d) {
    const [a, b] = d.conflict;
    const va = a.chunk.doc.version_label || a.chunk.doc.title, vb = b.chunk.doc.version_label || b.chunk.doc.title;
    st.phase = 'choose';
    st.caso.fuentes_citadas = `${fmtSrc(a.chunk)} · ${fmtSrc(b.chunk)}`;
    add(`<p><b>Ojo:</b> hay dos versiones de este manual y en esta parte <b>no dicen lo mismo</b>:</p>${fragHTML(a, d.A)}${fragHTML(b, d.A)}<p>¿Cuál corresponde a tu barrio?</p>`);
    guardar('Discrepancia entre versiones del manual: ' + st.caso.fuentes_citadas, 'Discrepancia registrada');
    opts([{ label: `Versión ${va}`, run: () => { me(`Versión ${va}`); answer(d, [a]); } },
      { label: `Versión ${vb}`, run: () => { me(`Versión ${vb}`); answer(d, [b]); } },
      { label: 'No sé', run: () => { me('No sé'); st.caso.resultado = 'Manuales con versiones distintas; el residente no sabe cuál aplica'; pending(); } }]);
  }

  /* ── cierre del caso ── */
  async function resolved() {
    st.caso.estado = 'resuelto';
    st.caso.resultado = 'Resuelto: confirmado por el residente';
    st.phase = 'done';
    await typing(400);
    add(`<p>¡Bien! Doy el caso por <b>resuelto</b> porque me lo confirmaste.</p><p>Si tenés otra consulta, escribila abajo.</p>`);
    await guardar('El residente confirmó que se resolvió', 'Caso marcado como RESUELTO');
  }
  async function notResolved() {
    st.caso.resultado = 'No resuelto siguiendo los manuales';
    return pending();
  }
  async function notFound() {
    st.caso.resultado = st.caso.resultado || 'Sin solución documentada';
    await typing(400);
    add('<p>No encontré una solución en la documentación disponible.</p>');
    return pending(true);
  }
  async function pending(silentTyping) {
    st.caso.estado = 'pendiente';
    st.phase = 'escalate';
    if (!silentTyping) await typing(400);
    await guardar('Caso pendiente: ' + st.caso.resultado, 'Caso PENDIENTE');
    add('<p>Tu caso queda pendiente. <b>¿Querés contactar a un operador de la central para continuar con la asistencia?</b></p>');
    opts([{ label: 'Sí, contactar a la central', pri: true, run: () => { me('Sí, contactar a la central'); showForm(); } },
      { label: 'No, por ahora', run: () => { me('No, por ahora'); keepPending(); } }]);
  }
  function keepPending() {
    st.phase = 'done';
    add(`<p>Entendido. El caso <b>${st.caso.caso_id}</b> sigue <b>pendiente</b>. Si querés retomarlo, escribime de nuevo.</p>`);
  }

  /* ── derivación a la central ── */
  const FIELDS = [['barrio', 'BARRIO', 'text', 'Ej.: Los Álamos'], ['residente', 'RESIDENTE (NOMBRE Y APELLIDO)', 'text', ''], ['lote', 'LOTE', 'text', 'Ej.: 214'],
    ['celular', 'CELULAR', 'tel', 'Ej.: 11 5555 0000'], ['correo', 'CORREO', 'email', 'nombre@correo.com']];
  function showForm() {
    st.phase = 'form';
    lockInput(true);
    const f = document.createElement('form');
    f.className = 'ay-form';
    f.noValidate = true;
    f.innerHTML = `<h4>Datos para la central</h4>
      <p class="lead">Con estos datos la central puede ubicarte y continuar la asistencia.</p>
      <div class="grid">${FIELDS.map(([k, l, t, ph], i) => `<label class="${i === 1 || i === 4 ? 'full' : ''}">${l}<input name="${k}" type="${t}" placeholder="${ph}" autocomplete="${{ residente: 'name', celular: 'tel', correo: 'email' }[k] || 'off'}" maxlength="120" value="${esc(st.caso[k] || '')}"></label>`).join('')}</div>
      <div class="sum">Se envía junto con tu consulta <b>${esc(st.caso.caso_id)}</b>${st.caso.pasos_intentados ? ', <b>los pasos que ya intentaste</b> y los manuales citados' : ''}, así no tenés que repetirlo.</div>
      <p class="err" role="alert"></p>
      <div class="row"><button type="button" class="ay-opt" data-c>Cancelar</button><button type="submit" class="ay-opt pri">Enviar a la central</button></div>`;
    log.appendChild(f);
    scroll();
    setTimeout(() => f.querySelector('input').focus(), 200);
    f.querySelector('[data-c]').addEventListener('click', () => { f.classList.add('done'); lockInput(false); me('Cancelar'); keepPending(); });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = Object.fromEntries(FIELDS.map(([k]) => [k, f.elements[k].value.trim()]));
      const bad = [];
      FIELDS.forEach(([k]) => f.elements[k].setAttribute('aria-invalid', 'false'));
      FIELDS.forEach(([k]) => { if (!v[k]) bad.push(k); });
      if (v.celular && v.celular.replace(/\D/g, '').length < 8) bad.push('celular');
      if (v.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.correo)) bad.push('correo');
      if (bad.length) {
        bad.forEach((k) => f.elements[k].setAttribute('aria-invalid', 'true'));
        f.querySelector('.err').textContent = 'Revisá: ' + [...new Set(bad)].join(', ') + '.';
        f.elements[bad[0]].focus();
        return;
      }
      f.querySelector('.err').textContent = '';
      Object.assign(st.caso, v, { derivado_central: 'sí' });
      const btn = f.querySelector('[type=submit]');
      btn.textContent = 'Enviando…';
      btn.disabled = true;
      const res = await CASOS.enviar('derivar', st.caso, 'Derivado a la central con datos de contacto');
      if (!res.ok) {
        st.caso.derivado_central = '';
        btn.textContent = 'Reintentar';
        btn.disabled = false;
        f.querySelector('.err').textContent = `No se pudo enviar a la central: ${res.error}. Tu caso sigue pendiente.`;
        sys(`Envío a la central FALLIDO · ${st.caso.caso_id}`, 'bad');
        return;
      }
      f.classList.add('done');
      lockInput(false);
      st.phase = 'done';
      if (res.simulated) {
        st.caso.correo_enviado = '';
        sys(`DERIVACIÓN SIMULADA · ${st.caso.caso_id} · no se envió ningún correo`, 'warn');
        add(`<p><b>Modo demo:</b> no se envió nada. En producción, la central recibiría un correo con tus datos y el caso quedaría como fila en la planilla.</p>
          <p>Tu caso <b>${st.caso.caso_id}</b> sigue <b>pendiente</b>: derivarlo no lo da por resuelto.</p>`);
        const gest = (window.SILA_CONFIG && window.SILA_CONFIG.ayuda || {}).gestionUrl;
        opts([{ label: 'Ver el correo y la fila simulados', run: () => showSim() },
          ...(gest ? [{ label: 'Abrir la app de la central ↗', run: () => window.open(new URL(gest, ROOT).href, '_blank') }] : [])]);
      } else if (res.mail) {
        sys(`Correo enviado a la central · ${st.caso.caso_id}`, 'ok');
        add(`<p>Listo: se envió el correo a la central con tus datos, tu consulta y los pasos que ya intentaste, y el caso quedó registrado en la planilla.</p>
          <p>Tu caso <b>${st.caso.caso_id}</b> sigue <b>pendiente</b> hasta que se resuelva.</p>`);
      } else {
        sys(`Registrado sin correo · ${st.caso.caso_id}`, 'warn');
        add(`<p>El caso quedó registrado en la planilla, pero <b>el correo a la central no se confirmó</b>. Sigue pendiente.</p>`);
      }
    });
  }

  /* ── visores ── */
  function viewer(title, tag, body) {
    const v = document.createElement('div');
    v.className = 'ay-view ay-root';
    v.innerHTML = `<div class="box" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header>${tag ? `<span class="tag">${tag}</span>` : ''}<b>${esc(title)}</b><button type="button" class="ay-x" aria-label="Cerrar"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.6"/></svg></button></header><div class="body">${body}</div></div>`;
    const shut = () => v.remove();
    v.addEventListener('click', (e) => { if (e.target === v || e.target.closest('.ay-x')) shut(); });
    document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { shut(); document.removeEventListener('keydown', k); } });
    document.body.appendChild(v);
    v.querySelector('.ay-x').focus();
  }
  log.addEventListener('click', (e) => {
    const b = e.target.closest('[data-page]');
    if (!b) return;
    const c = KB.K.chunks.find((x) => String(x.id) === b.dataset.page);
    if (!c) return;
    viewer(`${c.doc.title} · pág. ${c.page}`, 'MANUAL',
      `<img src="${ROOT + c.image}" alt="Página ${c.page} del manual ${esc(c.doc.title)}" loading="lazy"><h5 style="margin-top:14px">TEXTO DE LA PÁGINA</h5><pre>${esc(c.text)}</pre>`);
  });
  function showSim() {
    const c = st.caso;
    const mail = `Para: (correo de la central)\nAsunto: SILA Ayuda · ${c.caso_id} · ${c.barrio} · Lote ${c.lote}\n\n` +
      `CONTACTO DEL RESIDENTE\nBarrio: ${c.barrio}\nResidente: ${c.residente}\nLote: ${c.lote}\nCelular: ${c.celular}\nCorreo: ${c.correo}\n\n` +
      `CONSULTA\n${c.consulta}\n${c.aclaraciones ? `\nAclaraciones: ${c.aclaraciones}\n` : ''}${c.modulo ? `Módulo: ${c.modulo}\n` : ''}` +
      `\nLO QUE YA SE INTENTÓ (según manuales)\n${c.pasos_intentados || '— El bot no encontró una solución documentada.'}\n` +
      `${c.fuentes_citadas ? `\nFuentes citadas: ${c.fuentes_citadas}\n` : ''}\nResultado informado por el residente: ${c.resultado || '—'}`;
    const cols = ['caso_id', 'estado', 'barrio', 'residente', 'lote', 'celular', 'correo', 'consulta', 'modulo', 'fuentes_citadas', 'resultado', 'derivado_central'];
    viewer('Lo que recibiría la central', 'SIMULADO',
      `<h5>CORREO (NO ENVIADO)</h5><pre>${esc(mail)}</pre><h5>FILA EN LA PLANILLA “SILA Ayuda · Casos de residentes” (NO ESCRITA)</h5>
       <div class="sheet"><table><tr>${cols.map((k) => `<th>${k}</th>`).join('')}</tr><tr>${cols.map((k) => `<td>${esc(c[k] || '')}</td>`).join('')}</tr></table></div>`);
  }

  window.SILA_AYUDA = { open, close, get state() { return st; } };
  if (/[?&]ayuda=1\b/.test(location.search)) open();
})();
