/* SILA Ayuda — asistente de primera ayuda para residentes.
 * Habla como una persona de soporte. Lo que dice sale de fichas redactadas desde los manuales
 * (cada paso validado contra una cita literal: kb/tools/check_cards.py). Al residente NO se le
 * muestran citas; la fuente queda registrada en el caso para la central.
 * Resuelto sólo si el residente lo confirma; si no, pendiente + ofrecer la central.
 * Nunca afirma un registro o envío que no ocurrió.
 */
(function () {
  const KB = window.SILA_KB, CASOS = window.SILA_CASOS;
  if (!KB || !CASOS) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const ISO = '<svg viewBox="0 0 3 3" aria-hidden="true"><path d="M1 0H2V1H3V2L2 3H1V2H0V1Z" fill="#fff"/></svg>';
  const demo = CASOS.isDemo();
  const ROOT = KB.ROOT;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  /* ── DOM ── */
  const root = document.createElement('div');
  root.className = 'ay-root';
  root.innerHTML = `
    <button type="button" class="ay-launch" aria-haspopup="dialog" aria-controls="ayPanel">
      <span class="ic">${ISO}<i class="dot"></i></span>
      <span class="tx"><small>RESIDENTES</small><b>¿Te ayudo con la app?</b></span>
    </button>
    <section class="ay-panel" id="ayPanel" role="dialog" aria-modal="false" aria-label="Ayuda para residentes de Silicon Access">
      <header class="ay-hd">
        <span class="iso">${ISO}</span>
        <span class="t"><b>Ayuda Silicon Access</b><small><i>●</i> en línea · asistente virtual</small></span>
        <button type="button" class="ay-x" aria-label="Cerrar ayuda"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.6"/></svg></button>
      </header>
      ${demo ? '<div class="ay-demo"><b>DEMO</b> · No se envía nada: los casos quedan sólo en este navegador.</div>' : ''}
      <div class="ay-log" id="ayLog" aria-live="polite"></div>
      <form class="ay-in" id="ayForm" autocomplete="off">
        <label for="ayText" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Escribí tu consulta</label>
        <textarea id="ayText" rows="1" maxlength="600" placeholder="Escribí tu consulta…"></textarea>
        <button class="ay-send" type="submit" aria-label="Enviar"><svg viewBox="0 0 18 18"><path d="M2 9h12M9 3l6 6-6 6" fill="none" stroke="#fff" stroke-width="2"/></svg></button>
      </form>
    </section>`;
  document.body.appendChild(root);
  document.body.classList.add('has-ayuda');
  const $ = (s) => root.querySelector(s);
  const log = $('#ayLog'), txt = $('#ayText'), form = $('#ayForm');

  /* ── estado ── */
  let st = { phase: 'idle', caso: null, query: '', ctx: {}, card: null };
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
  const note = (html, kind = '') => add(html, 'ay-sys ' + kind);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // "escribiendo…" con un tiempo proporcional a lo que se va a decir
  async function typing(chars = 60) {
    const d = add('<span class="ay-typing"><i></i><i></i><i></i></span>', 'ay-bot');
    d.style.padding = '0';
    await wait(Math.min(1700, 450 + chars * 9));
    d.remove();
  }
  async function say(html, chars) { await typing(chars ?? html.replace(/<[^>]+>/g, '').length); return add(html); }
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

  /* ── registro honesto (nota chica, sin interrumpir la charla) ── */
  async function guardar(evento, etiqueta) {
    const res = await CASOS.enviar('upsert', st.caso, evento);
    if (!etiqueta) return res;
    if (res.ok && res.simulated) note(`Caso ${st.caso.caso_id} · ${etiqueta} · demo: guardado en este navegador`, 'warn');
    else if (res.ok) note(`Caso ${st.caso.caso_id} · ${etiqueta}`, 'ok');
    else note(`No pude guardar tu caso en el sistema (${esc(res.error)}).`, 'bad');
    return res;
  }

  /* ── abrir / cerrar ── */
  async function open() {
    root.classList.add('open');
    setTimeout(() => txt.focus(), 250);
    if (started) return;
    started = true;
    const h = new Date().getHours();
    const saludo = h < 12 ? '¡Buen día!' : h < 20 ? '¡Buenas tardes!' : '¡Buenas noches!';
    await say(`<p>${saludo} Soy SILA, de Silicon Access. Contame qué te está pasando con la app y lo vemos juntos.</p>`, 40);
    try { await KB.load(); } catch (e) { note('No pude cargar la información de ayuda en este momento.', 'bad'); }
  }

  /* ── frases típicas de los vecinos (informe de la ticketera de Soporte) ──
     NO es un menú: sirven para ENTENDER consultas escritas así y llevarlas a las fichas justas.
     Las que los manuales no cubren no están acá: siguen el camino normal (no se inventa). */
  const FRASES = [
    ['no me llega el código | no me llega el mail de activación', ['invitacion-y-registracion-no-llega-mail-invitacion', 'invitacion-y-registracion-crear-contrasena-desde-mail']],
    ['no puedo ingresar a la app | no me deja iniciar sesión | no puedo entrar a la app', ['invitacion-y-registracion-entrar-a-la-app', 'invitacion-y-registracion-despues-de-enviar-solicitud', 'invitacion-y-registracion-ya-tengo-usuario-otro-barrio']],
    ['no puedo registrar mi face id | no me deja cargar la foto del face id', ['selfie-id-autoempadronamiento-sacar-selfie', 'selfie-id-autoempadronamiento-pide-documento']],
    ['mi face id no me reconoce en la entrada', ['selfie-id-autoempadronamiento-aprobacion-y-rechazo']],
    ['quiero autorizar a un proveedor | autorizar a la empleada | autorizar personal de obra', ['app-movil-autorizar-visita', 'obras-invitar-responsable']],
    ['cómo veo el detalle de mis expensas', ['expensas-ver-saldo', 'expensas-historial-resumenes', 'expensas-cupones']],
    ['dónde subo el comprobante', ['informar-pagos-registrar', 'expensas-informar-pago']],
    ['la app no la puedo descargar | no puedo bajar la app', ['invitacion-y-registracion-bajar-la-app']],
    ['me da error al cargar documentos | error al cargar el seguro', ['autogestion-de-documentacion-seguro-art', 'autogestion-de-documentacion-antecedentes-penales', 'autogestion-de-documentacion-estado']]];
  const GENERIC_F = /^(quiero|puedo|tengo|deja|hace|hacer|como|donde|cómo|dónde|para|desde|necesito|esta|está)$/;
  const fw = (x) => String(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((w) => (w.length > 3 || w === 'id' || w === 'app') && !GENERIC_F.test(w)).map((w) => w.slice(0, 5));
  function porFrase(q) {
    const qw = new Set(fw(q));
    if (qw.size < 2) return null;
    let best = null;
    for (const [frs, ids] of FRASES) for (const f of frs.split(' | ')) {
      const pw = fw(f);
      const hit = pw.filter((w) => qw.has(w)).length;
      const cov = hit / pw.length, used = hit / qw.size;
      if (hit >= 2 && cov >= 0.6 && used >= 0.6 && (!best || cov + used > best.s)) best = { s: cov + used, ids };
    }
    return best ? best.ids.map((id) => KB.K.cards.find((c) => c.id === id)).filter(Boolean) : null;
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

  const SALUDO = /^(hola+|holis|buen[oa]?s?( d[ií]as?| tardes| noches)?|qu[eé] tal|hey|ey|hello|hi)[\s!.,¡¿?]*(c[oó]mo (est[aá]s|va|andas)[\s!.,?]*)?$/i;
  const GRACIAS = /^(muchas )?(gracias|grax|genial gracias|ok gracias|listo gracias|mil gracias)[\s!.,]*$/i;
  // Sólo cuentan como sí/no las respuestas cortas. "no puedo ingresar" NO es un "no": es información nueva.
  const SI = /^(s[ií]|s|dale|ok|okey|listo|joya|genial|perfecto|buen[ií]simo|resuelto|se resolvi[oó]|funcion[oó]|ya (est[aá]|anda|funciona)|pude|ahora s[ií]( anda| funciona)?)([\s!.,]+(gracias|muchas gracias|ya (est[aá]|anda)|listo|dale|por favor|porfa))*[\s!.,]*$/i;
  const NO = /^(no|nop|nope|negativo|tampoco|todav[ií]a no|no pude|no funciona|no funcion[oó]|no anda|no sirvi[oó]|no me sirvi[oó]|sigue igual|sigue sin (andar|funcionar)|sigue (sin|igual)|no,? sigue igual|no,? por ahora|ahora no|mejor no)[\s!.,]*$/i;

  async function onText(t) {
    try { await KB.load(); } catch (_) { note('No pude cargar la información de ayuda.', 'bad'); return; }
    if (st.phase !== 'confirm' && st.phase !== 'escalate' && SALUDO.test(t)) {
      return say(`<p>${pick(['¡Hola!', '¡Hola! ¿Cómo estás?'])} Contame qué te pasa con la app y lo vemos juntos.</p>`, 30);
    }
    if (GRACIAS.test(t)) return say(`<p>${pick(['¡De nada!', '¡Un gusto!', '¡Para eso estoy!'])} Si necesitás algo más, escribime.</p>`, 20);
    if (st.phase === 'confirm') {
      if (SI.test(t)) return resolved();
      if (NO.test(t)) return notResolved();
      appendClar(t);
      return seguir(t);
    }
    if (st.phase === 'escalate') {
      if (SI.test(t)) return showForm();
      if (NO.test(t)) return keepPending();
    }
    if (st.phase === 'clar' && st.intentos && NO.test(t)) return notResolved();
    if (st.phase === 'clar' || st.phase === 'choose') {
      appendClar(t);
      return seguir(t);
    }
    st = { phase: 'busy', caso: newCaso(t), query: t, ctx: {}, card: null };
    await guardar('Consulta registrada', 'registrado');
    return handle(t, {});
  }
  function newCaso(t) {
    const now = new Date().toISOString();
    return { caso_id: CASOS.nuevoId(), creado: now, estado: 'abierto', consulta: t, aclaraciones: '', modulo: '', fuentes_citadas: '', pasos_intentados: '',
      resultado: '', derivado_central: '', correo_enviado: '', monday_ticket: '', barrio: '', residente: '', lote: '', celular: '', correo: '',
      origen: location.pathname.split('/').pop() || 'index.html' };
  }
  function appendClar(t) { st.caso.aclaraciones = (st.caso.aclaraciones ? st.caso.aclaraciones + ' | ' : '') + t; }
  /* Lo que escribe después de la 1ª consulta: primero se entiende SOLO (puede ser otro tema);
     sólo si solo no alcanza, se suma a lo anterior. Así no queda atado al primer tema. */
  // aclaración corta ("en iphone", "la de la app"): se entiende junto a lo anterior; una frase completa es otra consulta
  const corto = (t) => t.split(/[^a-záéíóúñü0-9]+/i).filter((w) => w.length > 3).length <= 2;
  async function seguir(t) {
    const mod = st.ctx.module, previo = st.query;
    if (mod) {
      const d = KB.decide(t, { clarified: true, module: mod });
      if (d.type === 'card' || d.type === 'choose') { st.query = previo + ' ' + t; return handle(t, { clarified: true, module: mod }); }
    }
    st.query = t;
    return handle(t, { previo: previo + ' ' + t, module: mod });
  }

  /* ── conversación ── */
  /* Jev entiende la consulta (tipeo, palabras propias) y ELIGE la ficha; nunca redacta.
     Candado: sólo se le pregunta si la consulta toca la app o los manuales. Si falla o tarda, sigue el buscador local. */
  async function conJev(q, d) {
    const J = window.SILA_JEV;
    if (!J || !J.activo() || (st.ctx.module && !st.ctx.previo) || d.type === 'vague' || !J.relevante(q)) return false;
    const dots = add('<span class="ay-typing"><i></i><i></i><i></i></span>', 'ay-bot');
    dots.style.padding = '0';
    const r = await J.elegir(q);
    dots.remove();
    if (!r.ok) { CASOS.enviar('upsert', st.caso, `Jev no disponible (${r.error}); se usó el buscador local`); return false; }
    const byId = (id) => KB.K.cards.find((c) => c.id === id);
    const log = `Jev eligió "${r.choice}" (confianza ${r.confidence})`;
    if (r.choice === 'ninguna' && r.confidence >= 0.5) { if ((st.ctx.previo && corto(q)) || d.type === 'card') return false; await CASOS.enviar('upsert', st.caso, log); await notFound(); return true; }
    const best = byId(r.choice);
    // si Jev vuelve a elegir algo que ya probó y no le sirvió, decide el buscador local
    if (best && (st.probadas || []).indexOf(best.id) >= 0 && d.type === 'card' && d.card.id !== best.id) return false;
    if (best && r.confidence >= 0.55) { await CASOS.enviar('upsert', st.caso, log); await answerCard(best); return true; }
    const top = (r.top || []).filter(([id, p]) => id !== 'ninguna' && p >= 0.15);
    const dudas = top.map(([id]) => byId(id)).filter(Boolean);
    if (dudas.length === 1 && top[0][1] >= 0.3) {
      // un solo candidato razonable: se lo pregunta en vez de adivinar otro tema
      await CASOS.enviar('upsert', st.caso, log + ' · se le preguntó si era eso');
      st.phase = 'choose';
      st.ctx = {};
      await say(`<p>${pick(['Para entenderte bien:', 'A ver si te entendí:'])} ¿es esto lo que te pasa?</p>`);
      opts([{ label: dudas[0].title, pri: true, run: () => { me(dudas[0].title); answerCard(dudas[0]); } },
        { label: 'No, es otra cosa', run: () => { me('No, es otra cosa'); otraCosa(); } }]);
      return true;
    }
    if (dudas.length >= 2) {
      await CASOS.enviar('upsert', st.caso, log + ' · se pidió elegir');
      st.phase = 'choose';
      await say(`<p>${pick(['Para no mandarte para otro lado:', 'Quiero estar seguro de entenderte:'])} ¿cuál de estas es tu consulta?</p>`);
      opts([...dudas.map((c) => ({ label: c.title, run: () => { me(c.title); answerCard(c); } })),
        { label: 'Ninguna de estas', run: () => { me('Ninguna de estas'); notFound(); } }]);
      return true;
    }
    return false;
  }

  async function handle(q, ctx) {
    st.ctx = ctx;
    st.phase = 'busy';
    const d = KB.decide(q, ctx.previo ? {} : ctx);
    const fr = !ctx.module || ctx.previo ? porFrase(q) : null;
    if (fr && fr.length) {
      await CASOS.enviar('upsert', st.caso, 'Reconocida como consulta frecuente');
      if (fr.length === 1) return answerCard(fr[0]);
      st.phase = 'choose';
      await say(`<p>${pick(['Para no mandarte para otro lado:', 'Quiero estar seguro de entenderte:'])} ¿cuál de estas es tu consulta?</p>`);
      opts([...fr.map((c) => ({ label: c.title, run: () => { me(c.title); answerCard(c); } })),
        { label: 'Ninguna de estas', run: () => { me('Ninguna de estas'); otraCosa(); } }]);
      return;
    }
    if (await conJev(q, d)) return;
    // lo nuevo, solo, no alcanza: se entiende junto con lo que contó antes
    if (ctx.previo && (d.type === 'vague' || (d.type === 'none' && corto(q)))) {
      st.query = ctx.previo;
      return handle(ctx.previo, { clarified: true, module: ctx.module });
    }
    if (d.type === 'vague') {
      if (ctx.clarified) return notFound();
      st.phase = 'clar';
      await say(`<p>${pick(['Te ayudo.', 'Dale, lo vemos.', 'Contá conmigo.'])} ¿Con qué parte de la app es? Elegí una o contame un poco más qué te pasa.</p>`);
      opts(KB.cardModules().map((m) => ({ label: m, run: () => { me(m); offerCards(m); } })));
      return;
    }
    if (d.type === 'narrow') return offerCards(d.module, true);
    if (d.type === 'choose') {
      st.phase = 'choose';
      await say(`<p>${pick(['Para no mandarte para otro lado:', 'Quiero estar seguro de entenderte:'])} ¿cuál de estas es tu consulta?</p>`);
      opts([...d.cards.map((c) => ({ label: c.title, run: () => { me(c.title); answerCard(c); } })),
        { label: 'Ninguna de estas', run: () => { me('Ninguna de estas'); notFound(); } }]);
      return;
    }
    if (d.type === 'card') return answerCard(d.card);
    if (d.type === 'page') return answerPage(d.hit);
    return notFound();
  }
  async function otraCosa() {
    st.phase = 'clar';
    st.ctx = {};
    await say(`<p>${pick(['Dale.', 'Perfecto.'])} Contame un poco más: ¿qué estás intentando hacer y en qué parte de la app te pasa?</p>`);
  }
  async function offerCards(module, fromQuery) {
    st.phase = 'clar';
    st.ctx = { module };
    const cs = KB.cardsOf(module).slice(0, 6);
    await say(`<p>${fromQuery ? `Bien, ${esc(module)}.` : 'Perfecto.'} ¿Qué necesitás? Si no está en la lista, contámelo con tus palabras.</p>`);
    opts(cs.map((c) => ({ label: c.title, run: () => { me(c.title); answerCard(c); } })));
  }

  /* ── respuesta en tono humano + capturas con círculo rojo ── */
  const srcOf = (s) => (s.chunkObj ? s.chunkObj.doc.title + (s.chunkObj.page ? ` (pág. ${s.chunkObj.page})` : '') : '');
  function shotHTML(s, n) {
    const ell = s.marks.map((m) => {
      const rx = m.w / 2 * 1.3 + 0.035, ry = m.h / 2 * 1.9 + 0.02;
      return `<ellipse cx="${m.x + m.w / 2}" cy="${m.y + m.h / 2}" rx="${rx}" ry="${ry}"/>`;
    }).join('');
    return `<figure class="ay-shot" style="--r:${s.ratio || 0.6}" data-zoom tabindex="0" role="button" aria-label="Agrandar imagen del paso ${n}">
      <div class="crop"><img src="${ROOT + s.shot}" alt="Pantalla de la app: ${esc(s.marks.map((m) => m.label).join(', '))}" loading="lazy">
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">${ell}</svg></div>
      <figcaption>Paso ${n}</figcaption></figure>`;
  }
  async function answerCard(card) {
    if ((st.probadas || []).indexOf(card.id) >= 0) {
      // lo que dicen los manuales para esto ya se probó: no se repite, se dice y se ofrece la central
      await guardar(`Ya había probado: ${card.title}; no hay otra solución documentada`);
      await say('<p>Lo que tengo en los manuales para eso es lo que ya probamos, y no alcanzó. No te quiero dar vueltas.</p>', 30);
      return pending();
    }
    st.card = card;
    st.caso.modulo = card.module;
    const all = card.steps.concat(card.tips);
    st.caso.fuentes_citadas = [...new Set(all.map(srcOf).filter(Boolean))].join(' · ');
    st.caso.pasos_intentados = `${card.title}:\n` + card.steps.map((s, i) => `${i + 1}. ${s.say}`).join('\n') +
      (card.tips.length ? '\n' + card.tips.map((t) => `· ${t.say}`).join('\n') : '');
    await say(`<p>${esc(card.intro)}</p>`);
    const steps = card.steps.length > 1
      ? `<ol class="ay-steps">${card.steps.map((s) => `<li>${esc(s.say)}</li>`).join('')}</ol>`
      : `<p>${esc(card.steps[0].say)}</p>`;
    await say(steps, card.steps.reduce((a, s) => a + s.say.length, 0) * 0.5);
    const shots = card.steps.map((s, i) => (s.shot && s.marks && s.marks.length ? shotHTML(s, i + 1) : '')).filter(Boolean);
    if (shots.length) {
      await say(`<p>${shots.length > 1 ? 'Te marqué en rojo dónde tocar en cada paso:' : 'Te marqué en rojo dónde tenés que tocar:'}</p><div class="ay-shots">${shots.join('')}</div>`, 30);
    }
    if (card.tips.length) await say(card.tips.length > 1 ? `<p>Un par de cosas a tener en cuenta:</p><ul class="ay-steps">${card.tips.map((t) => `<li>${esc(t.say)}</li>`).join('')}</ul>` : `<p>${esc(card.tips[0].say)}</p>`);
    await guardar(`Se le explicó: ${card.title} [${st.caso.fuentes_citadas}]`);
    return askResolved();
  }
  async function answerPage(h) {
    const c = h.chunk;
    st.caso.modulo = c.doc.module;
    st.caso.fuentes_citadas = `${c.doc.title} (pág. ${c.page})`;
    st.caso.pasos_intentados = `Se le mostró la pantalla de ayuda de ${c.doc.module}.`;
    await say(`<p>Mirá, esto te lo explica mejor una imagen. Tocala para verla grande:</p>
      <figure class="ay-shot page" data-zoom-page="${c.id}" tabindex="0" role="button" aria-label="Agrandar"><div class="crop"><img src="${ROOT + c.image}" alt="Pantalla de ayuda de ${esc(c.doc.module)}" loading="lazy"></div></figure>`, 30);
    await guardar(`Se le mostró la página: ${st.caso.fuentes_citadas}`);
    return askResolved();
  }
  async function askResolved() {
    st.phase = 'confirm';
    await wait(500);
    await say(`<p>${pick(['Probalo y contame: ¿pudiste resolverlo?', '¿Te funcionó? Contame.', 'Fijate y avisame, ¿se resolvió?'])}</p>`, 20);
    opts([{ label: '¡Sí, listo!', pri: true, run: () => { me('¡Sí, listo!'); resolved(); } },
      { label: 'No, sigue igual', run: () => { me('No, sigue igual'); notResolved(); } }]);
  }

  /* ── cierre del caso ── */
  async function resolved() {
    st.caso.estado = 'resuelto';
    st.caso.resultado = 'Resuelto: confirmado por el residente';
    st.phase = 'done';
    await say(`<p>${pick(['¡Genial! Me alegra mucho.', '¡Buenísimo!', '¡Qué bueno!'])} Cualquier otra cosa, acá estoy.</p>`);
    await guardar('El residente confirmó que se resolvió', 'resuelto');
  }
  /* No le sirvió: antes de derivar, se sigue buscando con él (otra ficha cercana o que cuente qué ve).
     Recién al segundo intento sin solución queda pendiente y se ofrece la central. */
  async function notResolved() {
    st.caso.resultado = 'No se resolvió con las indicaciones';
    st.probadas = (st.probadas || []).concat(st.card ? [st.card.id] : []);
    st.intentos = (st.intentos || 0) + 1;
    if (st.intentos >= 2) {
      await say('<p>Uh, qué macana. Gracias por la paciencia.</p>', 20);
      return pending();
    }
    await guardar('No le sirvió; se sigue buscando con el residente');
    const otras = st.card ? KB.cardsOf(st.card.module).filter((c) => st.probadas.indexOf(c.id) === -1).slice(0, 3) : [];
    st.phase = 'clar';
    st.ctx = {};
    await say(`<p>Uh, qué macana. No te suelto todavía: contame qué te pasa exactamente cuando lo probás (qué ves en la pantalla, en qué paso te trabás o si te sale algún mensaje).</p>${otras.length ? '<p>O si es alguna de estas, tocala:</p>' : ''}`, 60);
    opts([...otras.map((c) => ({ label: c.title, run: () => { me(c.title); appendClar(c.title); answerCard(c); } })),
      { label: 'Prefiero hablar con la central', run: () => { me('Prefiero hablar con la central'); pending(); } }]);
  }
  async function notFound() {
    st.caso.resultado = st.caso.resultado || 'Sin solución documentada';
    await say('<p>Te soy sincero: no encontré una solución en la documentación disponible.</p>');
    return pending();
  }
  async function pending() {
    st.caso.estado = 'pendiente';
    st.phase = 'escalate';
    await guardar('Caso pendiente: ' + st.caso.resultado, 'pendiente');
    await say('<p>Tu caso queda pendiente. ¿Querés contactar a un operador de la central para continuar con la asistencia?</p>');
    opts([{ label: 'Sí, por favor', pri: true, run: () => { me('Sí, por favor'); showForm(); } },
      { label: 'No, por ahora', run: () => { me('No, por ahora'); keepPending(); } }]);
  }
  async function keepPending() {
    st.phase = 'done';
    await say(`<p>Dale. Lo dejo pendiente con el número <b>${st.caso.caso_id}</b>, así si volvés no tenés que contar todo de nuevo.</p>`);
  }

  /* ── derivación a la central ── */
  const FIELDS = [['barrio', 'BARRIO', 'text', 'Ej.: Los Álamos'], ['residente', 'NOMBRE Y APELLIDO', 'text', ''], ['lote', 'LOTE', 'text', 'Ej.: 214'],
    ['celular', 'CELULAR', 'tel', 'Ej.: 11 5555 0000'], ['correo', 'CORREO', 'email', 'nombre@correo.com']];
  async function showForm() {
    st.phase = 'form';
    lockInput(true);
    await say('<p>Dale. Pasame estos datos así la central te puede ubicar. Les mando también lo que ya probamos, para que no tengas que repetirlo.</p>');
    const f = document.createElement('form');
    f.className = 'ay-form';
    f.noValidate = true;
    f.innerHTML = `<div class="grid">${FIELDS.map(([k, l, t, ph], i) => `<label class="${i === 1 || i === 4 ? 'full' : ''}">${l}<input name="${k}" type="${t}" placeholder="${ph}" autocomplete="${{ residente: 'name', celular: 'tel', correo: 'email' }[k] || 'off'}" maxlength="120" value="${esc(st.caso[k] || '')}"></label>`).join('')}</div>
      <p class="err" role="alert"></p>
      <div class="row"><button type="button" class="ay-opt" data-c>Mejor no</button><button type="submit" class="ay-opt pri">Enviar a la central</button></div>`;
    log.appendChild(f);
    scroll();
    setTimeout(() => f.querySelector('input').focus(), 200);
    f.querySelector('[data-c]').addEventListener('click', () => { f.classList.add('done'); lockInput(false); me('Mejor no'); keepPending(); });
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
        f.querySelector('.err').textContent = 'Me falta o no me cierra: ' + [...new Set(bad)].join(', ') + '.';
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
        f.querySelector('.err').textContent = `No se pudo enviar a la central (${res.error}). Tu caso sigue pendiente.`;
        return;
      }
      f.classList.add('done');
      lockInput(false);
      st.phase = 'done';
      const nombre = esc(v.residente.split(/\s+/)[0]);
      if (res.simulated) {
        note(`Derivación SIMULADA · ${st.caso.caso_id} · no se envió ningún correo`, 'warn');
        await say(`<p>Gracias, ${nombre}. <b>Esto es una demo, así que no se envió nada:</b> en el sistema real la central recibiría un correo con tus datos y todo lo que probamos.</p>
          <p>Tu caso <b>${st.caso.caso_id}</b> sigue pendiente hasta que se resuelva.</p>`);
        const gest = (window.SILA_CONFIG && window.SILA_CONFIG.ayuda || {}).gestionUrl;
        opts([{ label: 'Ver qué recibiría la central', run: () => showSim() },
          ...(gest ? [{ label: 'Abrir la app de la central ↗', run: () => window.open(new URL(gest, ROOT).href, '_blank') }] : [])]);
      } else if (res.mail) {
        await say(`<p>Listo, ${nombre}: le mandé a la central un correo con tus datos y lo que ya probamos. Tu caso <b>${st.caso.caso_id}</b> sigue pendiente hasta que se resuelva.</p>`);
      } else if (res.central) {
        await say(`<p>Listo, ${nombre}: tu caso <b>${st.caso.caso_id}</b> ya le llegó a la central, con tus datos y todo lo que probamos, así no tenés que repetirlo. Sigue pendiente hasta que se resuelva.</p>`);
      } else {
        await say(`<p>${nombre}, tu caso quedó registrado, pero <b>no pude confirmar que haya llegado a la central</b>. Sigue pendiente.</p>`);
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
  function zoom(fig) {
    const clone = fig.cloneNode(true);
    clone.removeAttribute('data-zoom'); clone.removeAttribute('data-zoom-page'); clone.removeAttribute('tabindex'); clone.classList.add('big');
    const cap = clone.querySelector('figcaption');
    viewer(cap ? cap.textContent : 'Pantalla de la app', '', clone.outerHTML);
  }
  log.addEventListener('click', (e) => { const f = e.target.closest('[data-zoom],[data-zoom-page]'); if (f) zoom(f); });
  log.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const f = e.target.closest('[data-zoom],[data-zoom-page]'); if (f) zoom(f); } });
  function showSim() {
    const c = st.caso;
    const mail = `Para: (correo de la central)\nAsunto: SILA Ayuda · ${c.caso_id} · ${c.barrio} · Lote ${c.lote}\n\n` +
      `CONTACTO DEL RESIDENTE\nBarrio: ${c.barrio}\nResidente: ${c.residente}\nLote: ${c.lote}\nCelular: ${c.celular}\nCorreo: ${c.correo}\n\n` +
      `CONSULTA\n${c.consulta}\n${c.aclaraciones ? `\nAclaraciones: ${c.aclaraciones}\n` : ''}${c.modulo ? `Módulo: ${c.modulo}\n` : ''}` +
      `\nLO QUE YA SE INTENTÓ\n${c.pasos_intentados || '— No había una solución documentada para esta consulta.'}\n` +
      `${c.fuentes_citadas ? `\nRespaldo en manuales (uso interno): ${c.fuentes_citadas}\n` : ''}\nResultado informado por el residente: ${c.resultado || '—'}`;
    const cols = ['caso_id', 'estado', 'barrio', 'residente', 'lote', 'celular', 'correo', 'consulta', 'modulo', 'pasos_intentados', 'resultado', 'derivado_central'];
    viewer('Lo que recibiría la central', 'SIMULADO',
      `<h5>CORREO (NO ENVIADO)</h5><pre>${esc(mail)}</pre><h5>FILA EN LA PLANILLA “SILA Ayuda · Casos de residentes” (NO ESCRITA)</h5>
       <div class="sheet"><table><tr>${cols.map((k) => `<th>${k}</th>`).join('')}</tr><tr>${cols.map((k) => `<td>${esc(c[k] || '')}</td>`).join('')}</tr></table></div>`);
  }

  window.SILA_AYUDA = { open, close, get state() { return st; } };
  if (/[?&]ayuda=1\b/.test(location.search)) open();
})();
