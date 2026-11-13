/* SILA — motor del flujo */
(function () {
  'use strict';
  const CFG = window.SILA_CONFIG || {};
  const FLOW = window.SILA_FLOW;
  const NODES = FLOW.nodes;
  const { icon } = window.SILA_ICONS;

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const params = new URLSearchParams(location.search);
  const EMBED = params.get('embed') === '1';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const state = {
    answers: {},   // nodo -> id | [ids] | texto
    other: {},     // nodo -> texto de "Otra"
    history: [],   // nodos respondidos, en orden
    current: FLOW.start,
    startedAt: Date.now(),
    leadId: null,
    sent: false,
  };

  const el = {
    app: $('#app'), q: $('#q'), route: $('#route'), passSlot: $('#passSlot'), passCount: $('#passCount'),
    passWrap: $('#passWrap'), passToggle: $('#passToggle'), passDot: $('#passDot'), scrim: $('#scrim'),
    mcur: $('#mcur'), mbar: $('#mbar'), mn: $('#mn'), close: $('#close'), logo: $('#logo'), brand: $('#brand'),
  };

  /* ───────── utilidades de flujo ───────── */
  const opts = (node, ans = state.answers) => (typeof node.options === 'function' ? node.options(ans) : node.options || []);
  const qText = (node, ans = state.answers) => (typeof node.q === 'function' ? node.q(ans) : node.q);
  const nextOf = (id, ans = state.answers) => {
    const n = NODES[id];
    return typeof n.next === 'function' ? n.next(ans) : n.next;
  };

  // camino estimado hasta el final (para la ruta y el % de avance)
  function futurePath(fromId) {
    const sim = { ...state.answers };
    const path = [];
    let id = fromId;
    let guard = 0;
    while (id && NODES[id] && guard++ < 40) {
      path.push(id);
      if (NODES[id].kind === 'end') break;
      if (sim[id] == null) {
        const n = NODES[id];
        sim[id] = n.kind === 'single' ? (opts(n, sim)[0] || {}).id : n.kind === 'multi' ? [] : 'x';
      }
      id = nextOf(id, sim);
    }
    return path;
  }

  function labelOf(id, val) {
    const n = NODES[id];
    if (n.kind === 'single') return (opts(n).find((o) => o.id === val) || {}).label || '';
    if (n.kind === 'multi') {
      return (val || []).map((v) => (v === 'otra' ? state.other[id] || 'Otra' : (opts(n).find((o) => o.id === v) || {}).label)).filter(Boolean);
    }
    return String(val || '');
  }

  function shortLabel(s) {
    return String(s).replace(/^(Sí|No),\s*/i, (m) => m).replace(/\s+/g, ' ');
  }

  /* ───────── validaciones ───────── */
  const V = {
    emailOrPhone(v) {
      const s = v.trim();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return { ok: true, type: 'email' };
      const d = s.replace(/[^\d]/g, '');
      if (/^[\d\s()+\-.]+$/.test(s) && d.length >= 8 && d.length <= 15) return { ok: true, type: 'phone' };
      return { ok: false, msg: 'Ingresá un email válido o un teléfono con código de área.' };
    },
  };

  /* ───────── render de una pregunta ───────── */
  function render(id, opt = {}) {
    state.current = id;
    const n = NODES[id];
    if (n.kind === 'end') return renderEnd();

    const prevId = state.history[state.history.length - 1];
    const logHTML = opt.log || (prevId ? logFor(prevId) : `<span class="t">${clock()}</span><span>SILA en línea · ${esc(CFG.siteUrl ? 'silicon-access.com' : '')}</span>`);
    const idx = state.history.length + 1;
    const words = qText(n).split(' ').map((w, i) => `<span class="w" style="--i:${i}">${esc(w)}</span>`).join(' ');

    let body = '';
    if (n.kind === 'single' || n.kind === 'multi') {
      const list = opts(n);
      const dense = list.length > 5;
      const cls = ['opts', n.kind, n.big ? 'big' : '', dense ? 'dense' : ''].join(' ');
      const cur = state.answers[id];
      body = `<div class="${cls}" role="${n.kind === 'multi' ? 'group' : 'radiogroup'}" aria-label="${esc(qText(n))}">` +
        list.map((o, i) => {
          const on = n.kind === 'multi' ? (cur || []).includes(o.id) : cur === o.id;
          return `<button type="button" class="opt${on ? ' on' : ''}" data-id="${o.id}" style="--i:${i}" ${n.kind === 'multi' ? `aria-pressed="${on}"` : `role="radio" aria-checked="${on}"`}>
            <span class="idx">${String(i + 1).padStart(2, '0')}</span>
            ${n.kind === 'multi' ? '<span class="chk"><svg viewBox="0 0 12 12" fill="none" stroke="#006bf2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.2L5 8.5L9.5 3.5"/></svg></span>' : ''}
            <span class="art">${icon(o.icon)}</span>
            <span class="lbl">${esc(o.label)}${o.hint ? `<span class="hint">${esc(o.hint)}</span>` : ''}</span>
          </button>`;
        }).join('') + `</div>`;
      if (n.kind === 'multi') {
        const hasOther = (cur || []).includes('otra');
        body += `<div class="other field${hasOther ? ' show' : ''}" id="otherBox"><div class="box"><span class="pfx">›</span><input id="otherIn" type="text" maxlength="120" placeholder="Contanos cuál" value="${esc(state.other[id] || '')}" aria-label="Otra solución"></div><div class="err" id="otherErr"></div></div>`;
      }
    } else if (n.kind === 'text') {
      const val = state.answers[id] || '';
      body = `<div class="field"><div class="box"><span class="pfx">›</span>
        <input id="tin" type="${n.validate === 'emailOrPhone' ? 'text' : 'text'}" maxlength="140" autocomplete="${n.autocomplete || 'off'}" ${n.inputmode ? `inputmode="${n.inputmode}"` : ''} placeholder="${esc(n.placeholder || '')}" value="${esc(val)}" aria-label="${esc(qText(n))}" enterkeyhint="next">
        </div><div class="err" id="terr"></div>
        ${n.field === 'contacto' ? '<input class="hp" id="hp" tabindex="-1" autocomplete="off" aria-hidden="true">' : ''}
      </div>`;
    }

    const canBack = state.history.length > 0;
    const needsContinue = n.kind !== 'single';
    const actions = `<div class="actions${needsContinue ? '' : ' solo'}">
      ${canBack ? `<button type="button" class="btn ghost back" id="back">← Volver</button>` : ''}
      ${n.skip ? `<button type="button" class="link" id="skip">${esc(n.skip)}</button>` : ''}
      ${needsContinue ? `<button type="button" class="btn" id="go">Continuar <span class="k">↵</span></button>` : ''}
    </div>`;

    const html = `<div class="q-inner enter">
      <div class="log">${logHTML}</div>
      <div class="kicker">Checkpoint ${String(idx).padStart(2, '0')} · ${esc(n.cp)}</div>
      <h1 class="qt">${words}</h1>
      <p class="sub">${esc(n.sub || '')}</p>
      ${body}
      ${actions}
    </div>`;

    swap(html, () => bind(id));
    updateRoute();
    updatePass();
  }

  function swap(html, after) {
    const old = el.q.firstElementChild;
    const put = () => {
      el.q.innerHTML = html;
      el.q.scrollTop = 0;
      after && after();
    };
    if (old && !reduced) {
      old.classList.remove('enter');
      old.classList.add('leave');
      setTimeout(put, 240);
    } else put();
  }

  function bind(id) {
    const n = NODES[id];
    const go = $('#go'), back = $('#back'), skip = $('#skip');
    back && back.addEventListener('click', goBack);
    skip && skip.addEventListener('click', () => commit(id, n.skip));

    if (n.kind === 'single') {
      el.q.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => pickSingle(id, b)));
    }
    if (n.kind === 'multi') {
      const sel = new Set(state.answers[id] || []);
      const refresh = () => {
        go.disabled = sel.size === 0;
        $('#otherBox').classList.toggle('show', sel.has('otra'));
      };
      el.q.querySelectorAll('.opt').forEach((b) =>
        b.addEventListener('click', () => {
          const v = b.dataset.id;
          sel.has(v) ? sel.delete(v) : sel.add(v);
          b.classList.toggle('on', sel.has(v));
          b.setAttribute('aria-pressed', sel.has(v));
          b.classList.remove('pick'); void b.offsetWidth; b.classList.add('pick');
          refresh();
          if (v === 'otra' && sel.has('otra')) setTimeout(() => $('#otherIn').focus(), 60);
        })
      );
      $('#otherIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
      go.addEventListener('click', () => {
        const otherTxt = $('#otherIn').value.trim();
        if (sel.has('otra') && otherTxt.length < 2) {
          $('#otherErr').textContent = 'Contanos qué otra solución te interesa.';
          $('#otherIn').focus();
          return;
        }
        state.other[id] = sel.has('otra') ? otherTxt : '';
        const order = opts(n).map((o) => o.id).filter((x) => sel.has(x));
        commit(id, order);
      });
      refresh();
    }
    if (n.kind === 'text') {
      const inp = $('#tin');
      const err = $('#terr');
      const submit = () => {
        const v = inp.value.trim();
        if (v.length < 2) { err.textContent = 'Completá este dato para seguir.'; inp.focus(); return; }
        if (n.validate) {
          const r = V[n.validate](v);
          if (!r.ok) { err.textContent = r.msg; inp.focus(); return; }
          state.contactType = r.type;
        }
        commit(id, v);
      };
      inp.addEventListener('input', () => { err.textContent = ''; });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
      go.addEventListener('click', submit);
      if (!matchMedia('(max-width: 860px)').matches || state.history.length > 0) setTimeout(() => inp.focus({ preventScroll: true }), reduced ? 0 : 420);
    }
  }

  function pickSingle(id, btn) {
    if (el.q.dataset.busy) return;
    el.q.dataset.busy = '1';
    el.q.querySelectorAll('.opt').forEach((b) => { b.classList.toggle('on', b === btn); b.setAttribute('aria-checked', b === btn); });
    btn.classList.add('pick');
    setTimeout(() => { delete el.q.dataset.busy; commit(id, btn.dataset.id); }, reduced ? 0 : 520);
  }

  function commit(id, val) {
    const prev = state.answers[id];
    state.answers[id] = val;
    // si cambió una respuesta que define el camino, descartamos lo que quedó colgando
    const hi = state.history.indexOf(id);
    if (hi >= 0) state.history = state.history.slice(0, hi);
    state.history.push(id);
    if (JSON.stringify(prev) !== JSON.stringify(val)) pruneOrphans();
    track('sila_step', { step: id });
    render(nextOf(id));
  }

  function pruneOrphans() {
    const keep = new Set(futurePath(FLOW.start));
    state.history.forEach((h) => keep.add(h));
    Object.keys(state.answers).forEach((k) => { if (!keep.has(k)) delete state.answers[k]; });
  }

  function goBack() {
    const prev = state.history.pop();
    if (!prev) return;
    render(prev, { log: `<span class="t">${clock()}</span><span>↺ Volviste al checkpoint</span>` });
  }

  function logFor(id) {
    const n = NODES[id];
    const v = labelOf(id, state.answers[id]);
    const txt = Array.isArray(v) ? `${v.length} seleccionada${v.length === 1 ? '' : 's'}` : v;
    return `<span class="t">${clock()}</span><span class="ok">✓ REGISTRADO</span><span>${esc(n.pass || n.cp)}</span><span class="val">· ${esc(shortLabel(txt))}</span>`;
  }

  function clock() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  }

  /* ───────── ruta / avance ───────── */
  const BAR_SVG = '<svg viewBox="0 0 22 16" aria-hidden="true"><rect class="post" x="2" y="3" width="4" height="13" rx="1"/><path class="barm" d="M4 5H21"/></svg>';
  const LOCK_SVG = '<svg class="lock" viewBox="0 0 9 10" aria-hidden="true"><path d="M2 4.5V3a2.5 2.5 0 015 0v1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="1" y="4.5" width="7" height="5" rx="1" fill="currentColor"/></svg>';

  function updateRoute() {
    const fut = futurePath(state.current);
    const all = [...state.history, ...fut];
    const curIdx = state.history.length;
    el.route.innerHTML = all.map((id, i) => {
      const n = NODES[id];
      const cls = i < curIdx ? 'done' : i === curIdx ? 'now' : 'next';
      const label = state.history.length === 0 && i > 0 ? '•••••' : n.cp;
      return `<div class="cp ${cls}" title="${cls === 'next' ? 'Próximo checkpoint' : esc(n.cp)}">${BAR_SVG}${LOCK_SVG}<span>${esc(label)}</span></div>`;
    }).join('');
    const now = el.route.querySelector('.now');
    if (now) {
      const target = now.offsetLeft - el.route.clientWidth / 2 + now.clientWidth / 2;
      el.route.scrollTo({ left: Math.max(0, target), behavior: reduced ? 'auto' : 'smooth' });
    }
    const total = all.length;
    const pct = Math.round((curIdx / Math.max(1, total - 1)) * 100);
    el.mbar.style.width = pct + '%';
    el.mn.textContent = `${String(Math.min(curIdx + 1, total)).padStart(2, '0')}/${String(total).padStart(2, '0')}`;
    el.mcur.textContent = NODES[state.current].cp;
  }

  /* ───────── tu pase ───────── */
  const VERT = { urb: 'Urbanización', parque: 'Parque industrial', planta: 'Industria o planta', conce: 'Concesionaria' };
  const MARK = '<svg class="pm" viewBox="0 0 3 3" aria-hidden="true"><path d="M1 0H2V1H3V2L2 3H1V2H0V1Z" fill="#fff"/></svg>';

  function accountName() {
    return state.history.filter((h) => NODES[h].account).map((h) => state.answers[h]).join(' · ');
  }

  function passHTML(issued) {
    const a = state.answers;
    const name = accountName();
    const rows = state.history
      .filter((h) => h !== 'N1' && !NODES[h].account && !NODES[h].field)
      .map((h) => {
        const v = labelOf(h, a[h]);
        const dd = Array.isArray(v)
          ? `<span class="tags">${v.map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</span>`
          : esc(v);
        return `<div class="row"><dt>${esc(NODES[h].pass)}</dt><dd>${dd}</dd></div>`;
      });
    const contact = ['N5', 'N6', 'N7', 'N8'].filter((k) => a[k]).map((k) => `<div class="row"><dt>${esc(NODES[k].pass)}</dt><dd>${esc(a[k])}</dd></div>`);
    const all = rows.concat(contact);
    const code = state.leadId || 'SA-' + '······';
    return `<div class="pass${issued ? ' issued' : ''}">
      <div class="beam"></div>
      <div class="pass-top">${MARK}<div class="pt">PASE DE INGRESO<br>SILICON ACCESS</div></div>
      <div class="chip"></div>
      <div class="pass-name${name ? '' : ' empty'}">${name ? esc(name) : 'Tu predio'}</div>
      <div class="pass-vert">${a.N1 ? esc(VERT[a.N1]) : 'Vertical · pendiente'}</div>
      <dl class="rows">${all.length ? all.join('') : '<div class="ghost-row"></div><div class="ghost-row"></div><div class="ghost-row"></div>'}</dl>
      <div class="pass-bottom"><div class="code">${esc(code)}</div><div class="bars">${barsFor(code)}</div>${issued ? qrFor(code) : ''}</div>
      ${issued ? '<div class="stamp">ACCESO CONCEDIDO</div>' : ''}
    </div>`;
  }

  function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function barsFor(code) {
    let h = hash(code + state.history.length), out = '';
    for (let i = 0; i < 26; i++) { h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; out += `<i style="opacity:${0.35 + (h % 65) / 100}"></i>`; }
    return out;
  }
  function qrFor(code) {
    // patrón decorativo tipo QR (no codifica datos)
    const N = 17; let h = hash(code), cells = '';
    const finder = (x, y) => `<rect x="${x}" y="${y}" width="5" height="5" fill="none" stroke="#0a1222" stroke-width="1" transform="translate(.5 .5) scale(1)"/><rect x="${x + 1.5}" y="${y + 1.5}" width="2" height="2" fill="#0a1222"/>`;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const inF = (x < 6 && y < 6) || (x > N - 7 && y < 6) || (x < 6 && y > N - 7);
      if (inF) continue;
      h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
      if (h % 100 < 46) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
    return `<svg class="qr" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges"><g fill="#0a1222">${cells}</g>${finder(0, 0)}${finder(N - 6, 0)}${finder(0, N - 6)}</svg>`;
  }

  function updatePass(issued) {
    el.passSlot.innerHTML = passHTML(issued);
    const n = state.history.length;
    el.passCount.textContent = `${n} dato${n === 1 ? '' : 's'}`;
    if (el.passDot.textContent !== String(n)) {
      el.passDot.textContent = n;
      el.passToggle.classList.remove('bump'); void el.passToggle.offsetWidth; el.passToggle.classList.add('bump');
    }
  }

  function togglePass(open) {
    const o = open ?? !el.passWrap.classList.contains('open');
    el.passWrap.classList.toggle('open', o);
    el.scrim.classList.toggle('show', o);
    el.passToggle.setAttribute('aria-expanded', o);
  }

  /* ───────── cierre ───────── */
  function renderEnd() {
    if (!state.leadId) state.leadId = 'SA-' + (Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 4)).toUpperCase();
    const a = state.answers;
    const first = String(a.N5 || '').trim().split(/\s+/)[0];
    const wa = CFG.whatsapp
      ? `<a class="btn wa" id="wa" target="_blank" rel="noopener" href="https://wa.me/${encodeURIComponent(CFG.whatsapp)}?text=${encodeURIComponent(waText())}">Hablar ahora por WhatsApp</a>`
      : '';
    const html = `<div class="q-inner enter end">
      <div class="log"><span class="t">${clock()}</span><span class="ok">✓ PASE EMITIDO</span><span class="val">· ${esc(state.leadId)}</span></div>
      <div class="kicker">Checkpoint final · Pase</div>
      <h1 class="qt">${`Listo${first ? ', ' + first : ''}. Tu pase está emitido.`.split(' ').map((w, i) => `<span class="w" style="--i:${i}">${esc(w)}</span>`).join(' ')}</h1>
      <p class="lead">Registramos tu consulta. Un asesor de Silicon Access te contacta en las próximas <strong>24 hs hábiles</strong> con una propuesta para ${esc(accountName() || 'tu predio')}.</p>
      <div class="pass-inline" id="passInline"></div>
      <div class="sendstate" id="sendstate">Enviando…</div>
      <div class="actions">
        ${wa}
        <button type="button" class="btn${wa ? ' ghost' : ''}" id="done">${EMBED ? 'Volver al sitio' : 'Ir a silicon-access.com'}</button>
        <button type="button" class="link" id="again">Empezar de nuevo</button>
      </div>
    </div>`;
    document.body.classList.add('ended');
    swap(html, () => {
      $('#passInline').innerHTML = passHTML(true);
      $('#done').addEventListener('click', () => (EMBED ? closeEmbed() : (location.href = CFG.siteUrl || '/')));
      $('#again').addEventListener('click', restart);
      submitLead();
    });
    updateRoute();
    updatePass(true);
    el.passCount.textContent = 'Emitido';
  }

  function restart() {
    Object.assign(state, { answers: {}, other: {}, history: [], current: FLOW.start, startedAt: Date.now(), leadId: null, sent: false });
    document.body.classList.remove('ended');
    render(FLOW.start);
  }

  /* ───────── lead ───────── */
  function score() {
    const a = state.answers; let s = 0;
    s += { pronto: 3, cambiar: 2, comparando: 1 }[a.N4] || 0;
    const big = ['gt600', '300_600', 'gt60', '30_60', 'gt1000', '500_1000', 'gt200'];
    const mid = ['100_300', '10_30', '100_500', '50_200'];
    const sz = a.N2A || a.N2B || a.N2D || a.N2C;
    s += big.includes(sz) ? 2 : mid.includes(sz) ? 1 : 0;
    const menus = a['N2A-4'] || a['N2B-6'] || a['N2D-6'] || a['N2C-8'] || [];
    if (menus.length >= 3) s += 1;
    const pains = [a['N2B-5'] === 'frec', a['N2D-5'] === 'frena', a['N2D-5'] === 'entra', a['N2C-3'] === 'nada', a['N2A-2'] === 'nada', a['N2B-3'] === 'sin'];
    if (pains.some(Boolean)) s += 1;
    return { score: s, temperatura: s >= 5 ? 'caliente' : s >= 3 ? 'tibio' : 'frío' };
  }

  function payload() {
    const a = state.answers;
    const contacto = String(a.N8 || '').trim();
    const isMail = /@/.test(contacto);
    const [nombre, ...ap] = String(a.N5 || '').trim().split(/\s+/);
    const respuestas = state.history.map((h) => {
      const v = labelOf(h, a[h]);
      return { nodo: h, pregunta: qText(NODES[h]), respuesta: Array.isArray(v) ? v.join(' | ') : v };
    });
    const sc = score();
    return {
      id: state.leadId,
      fecha: new Date().toISOString(),
      vertical: VERT[a.N1] || '',
      cuenta: accountName(),
      nombre: nombre || '', apellido: ap.join(' '),
      localidad: a.N6 || '', rol: a.N7 || '',
      email: isMail ? contacto : '', telefono: isMail ? '' : contacto,
      necesidad: labelOf('N3', a.N3) || '', etapa: labelOf('N4', a.N4) || '',
      temperatura: sc.temperatura, score: sc.score,
      resumen: respuestas.map((r) => `${r.pregunta} → ${r.respuesta}`).join('\n'),
      respuestas,
      origen: {
        pagina: document.referrer || location.href,
        utm_source: params.get('utm_source') || '', utm_medium: params.get('utm_medium') || '', utm_campaign: params.get('utm_campaign') || '',
        embed: EMBED, segundos: Math.round((Date.now() - state.startedAt) / 1000),
      },
    };
  }

  function waText() {
    const p = payload();
    return `Hola, soy ${p.nombre} ${p.apellido} (${p.rol}). Completé SILA para ${p.cuenta} — ${p.vertical}. Pase ${p.id}.`;
  }

  async function submitLead() {
    if (state.sent) return;
    state.sent = true;
    const st = $('#sendstate');
    const p = payload();
    if (CFG.demo) return simulateSend(p, st);
    const bot = ($('#hp') && $('#hp').value) || (Date.now() - state.startedAt) / 1000 < (CFG.minSeconds || 0);
    if (bot) { st.textContent = '✓ Consulta registrada'; st.className = 'sendstate ok'; return; }

    const jobs = [];
    if (CFG.hubspot && CFG.hubspot.portalId && CFG.hubspot.formGuid) jobs.push(sendHubspot(p));
    if (CFG.appsScriptUrl) jobs.push(sendAppsScript(p));
    track('sila_lead', { vertical: p.vertical, temperatura: p.temperatura });
    if (EMBED && parent !== window) parent.postMessage({ type: 'sila:lead', id: p.id, vertical: p.vertical, temperatura: p.temperatura }, '*');

    if (!jobs.length) {
      queue(p);
      st.textContent = `✓ Consulta registrada · ${p.id} (modo demo: guardada en este navegador)`;
      st.className = 'sendstate ok';
      console.info('[SILA] lead (modo demo)', p);
      return;
    }
    const res = await Promise.allSettled(jobs);
    if (res.some((r) => r.status === 'fulfilled')) {
      st.textContent = `✓ Consulta registrada · ${p.id}`; st.className = 'sendstate ok';
    } else {
      queue(p);
      st.textContent = 'Guardamos tu consulta; reintentamos el envío automáticamente.'; st.className = 'sendstate warn';
    }
  }

  /* ───────── modo demo: simula el envío y muestra lo que recibe el comercial ───────── */
  function simulateSend(p, st) {
    track('sila_lead', { vertical: p.vertical, temperatura: p.temperatura, demo: true });
    try {
      const h = JSON.parse(sessionStorage.getItem('sila_demo_leads') || '[]');
      h.push(p);
      sessionStorage.setItem('sila_demo_leads', JSON.stringify(h.slice(-30)));
    } catch (_) { /* nada */ }
    const steps = [
      'Validando datos de contacto',
      `HubSpot · contacto + negocio creados (${p.temperatura})`,
      'Mail de aviso al equipo comercial',
      'Asignado a la cola de seguimiento 24 hs',
    ];
    st.className = 'sendstate sim';
    st.innerHTML = '<div class="sim-h">SIMULACIÓN · no se envió ningún dato</div>' +
      steps.map((s, i) => `<div class="sim-l" style="--i:${i}"><span class="sp"></span>${esc(s)}<span class="ok">✓</span></div>`).join('') +
      `<button type="button" class="btn ghost sim-btn" id="simView">Ver lo que recibe el comercial →</button>`;
    $('#simView').addEventListener('click', () => openLeadViewer(p));
  }

  function openLeadViewer(p) {
    const t = { caliente: 'CALIENTE', tibio: 'TIBIO', 'frío': 'FRÍO' }[p.temperatura] || p.temperatura;
    const crm = [
      ['Nombre', p.nombre], ['Apellido', p.apellido], ['Email', p.email], ['Teléfono', p.telefono],
      ['Localidad', p.localidad], ['Cargo', p.rol], ['Empresa / cuenta', p.cuenta],
      ['Vertical', p.vertical], ['Necesidad', p.necesidad], ['Etapa', p.etapa],
      ['Temperatura', `${t} (score ${p.score})`], ['ID SILA', p.id], ['Tiempo en completar', `${p.origen.segundos} s`],
    ];
    const mailBody =
      `Nuevo lead SILA ${p.id} · ${t}\n\n${p.cuenta} — ${p.vertical}\n${p.nombre} ${p.apellido} (${p.rol}) · ${p.localidad}\n` +
      `${p.email || ''}${p.telefono || ''}\n\nNecesidad: ${p.necesidad}\nEtapa: ${p.etapa}\n\n— Respuestas —\n${p.resumen}`;
    const tabs = {
      mail: `<div class="mail">
          <div class="mh"><b>De:</b> SILA &lt;no-reply@silicon-access.com&gt;</div>
          <div class="mh"><b>Para:</b> comercial@silicon-access.com <i>(ejemplo)</i></div>
          <div class="mh"><b>Asunto:</b> SILA · ${esc(t)} · ${esc(p.cuenta)} (${esc(p.vertical)})</div>
          <pre>${esc(mailBody)}</pre></div>`,
      crm: `<div class="crm"><div class="crm-top"><span class="temp t-${esc(p.temperatura.replace('í', 'i'))}">${esc(t)}</span><b>${esc(p.nombre + ' ' + p.apellido)}</b><span>${esc(p.cuenta)}</span></div>
          <dl>${crm.filter(([, v]) => v).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
          <div class="crm-n"><b>Nota adjunta</b><pre>${esc(p.resumen)}</pre></div></div>`,
      json: `<pre class="json">${esc(JSON.stringify(p, null, 2))}</pre>`,
    };
    const box = document.createElement('div');
    box.className = 'dlg-scrim';
    box.innerHTML = `<div class="dlg" role="dialog" aria-modal="true" aria-label="Lead simulado">
      <header><div><span class="dk">LEAD SIMULADO</span><b>${esc(p.id)}</b></div><button type="button" class="close" data-x aria-label="Cerrar">✕</button></header>
      <nav><button type="button" data-t="mail" class="on">Mail al comercial</button><button type="button" data-t="crm">Ficha en CRM</button><button type="button" data-t="json">Datos (JSON)</button></nav>
      <div class="dlg-b">${tabs.mail}</div></div>`;
    document.body.appendChild(box);
    const close = () => { box.remove(); removeEventListener('keydown', onKey, true); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    addEventListener('keydown', onKey, true);
    box.addEventListener('click', (e) => {
      if (e.target === box || e.target.closest('[data-x]')) return close();
      const b = e.target.closest('[data-t]');
      if (!b) return;
      box.querySelectorAll('nav button').forEach((x) => x.classList.toggle('on', x === b));
      box.querySelector('.dlg-b').innerHTML = tabs[b.dataset.t];
    });
    box.querySelector('[data-x]').focus();
  }

  function sendHubspot(p) {
    const { portalId, formGuid } = CFG.hubspot;
    const hutk = (document.cookie.match(/hubspotutk=([^;]+)/) || [])[1];
    const fields = [
      ['firstname', p.nombre], ['lastname', p.apellido], ['email', p.email], ['phone', p.telefono],
      ['city', p.localidad], ['jobtitle', p.rol], ['company', p.cuenta],
      ['sila_vertical', p.vertical], ['sila_temperatura', p.temperatura], ['sila_resumen', p.resumen], ['sila_id', p.id],
    ].filter(([, v]) => v).map(([name, value]) => ({ name, value: String(value) }));
    return fetch(`https://api.hsforms.com/submissions/v3/integration/submit/${portalId}/${formGuid}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields, context: { pageUri: p.origen.pagina, pageName: 'SILA', ...(hutk ? { hutk } : {}) } }),
    }).then((r) => { if (!r.ok) throw new Error('HubSpot ' + r.status); });
  }

  function sendAppsScript(p) {
    // text/plain evita el preflight CORS; Apps Script lo parsea igual
    return fetch(CFG.appsScriptUrl, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(p) });
  }

  function queue(p) {
    try {
      const q = JSON.parse(localStorage.getItem('sila_queue') || '[]');
      q.push(p);
      localStorage.setItem('sila_queue', JSON.stringify(q.slice(-20)));
    } catch (_) { /* almacenamiento bloqueado */ }
  }

  async function flushQueue() {
    if (!CFG.appsScriptUrl && !(CFG.hubspot && CFG.hubspot.portalId)) return;
    let q = [];
    try { q = JSON.parse(localStorage.getItem('sila_queue') || '[]'); } catch (_) { return; }
    if (!q.length) return;
    const rest = [];
    for (const p of q) {
      try {
        if (CFG.hubspot && CFG.hubspot.portalId) await sendHubspot(p);
        else await sendAppsScript(p);
      } catch (_) { rest.push(p); }
    }
    try { localStorage.setItem('sila_queue', JSON.stringify(rest)); } catch (_) { /* nada */ }
  }

  function track(event, data) {
    try { (window.dataLayer = window.dataLayer || []).push({ event, ...data }); } catch (_) { /* nada */ }
    if (EMBED && parent !== window) parent.postMessage({ type: 'sila:' + event, ...data }, '*');
  }

  function closeEmbed() {
    if (parent !== window) parent.postMessage({ type: 'sila:close' }, '*');
  }

  /* ───────── intro ───────── */
  function intro(done) {
    const box = $('#intro');
    let seen = false;
    try { seen = sessionStorage.getItem('sila_intro') === '1'; } catch (_) { /* nada */ }
    const force = params.get('intro') === '1';
    if (params.get('intro') === '0' || (seen && !force) || reduced) { box.classList.add('gone'); return done(); }

    const txt = $('#itxt');
    const T = [];
    let finished = false;
    const at = (ms, fn) => T.push(setTimeout(fn, ms));
    const finish = () => {
      if (finished) return;
      finished = true;
      T.forEach(clearTimeout);
      try { sessionStorage.setItem('sila_intro', '1'); } catch (_) { /* nada */ }
      box.classList.add('s5');
      done();
      setTimeout(() => box.classList.add('gone'), 460);
    };
    at(60, () => box.classList.add('s1'));
    at(650, () => box.classList.add('s2'));
    at(1700, () => { box.classList.add('s3'); });
    at(2150, () => { txt.innerHTML = '<b>✓</b> Acceso verificado · SILA'; });
    at(2900, () => box.classList.add('s4'));
    at(3700, finish);
    box.addEventListener('click', finish);
    addEventListener('keydown', function k() { removeEventListener('keydown', k); finish(); }, { once: true });
  }

  /* ───────── teclado ───────── */
  addEventListener('keydown', (e) => {
    if (!$('#intro').classList.contains('gone')) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input') return;
    const n = NODES[state.current];
    if (/^[1-9]$/.test(e.key) && (n.kind === 'single' || n.kind === 'multi')) {
      const b = el.q.querySelectorAll('.opt')[+e.key - 1];
      if (b) { b.click(); b.focus({ preventScroll: true }); }
    } else if (e.key === 'Enter' && n.kind === 'multi') {
      const go = $('#go'); if (go && !go.disabled && !(e.target.classList || { contains: () => 0 }).contains('opt')) go.click();
    } else if (e.key === 'Escape') {
      if (el.passWrap.classList.contains('open')) togglePass(false);
      else if (EMBED) closeEmbed();
    }
  });

  /* ───────── arranque ───────── */
  function boot() {
    el.logo.src = CFG.logoUrl || '';
    el.logo.onerror = () => { el.logo.replaceWith(Object.assign(document.createElement('span'), { innerHTML: MARK.replace('class="pm"', 'width="24" height="24"') + ' <b>Silicon Access</b>', style: 'display:flex;gap:8px;align-items:center' })); };
    if (EMBED) { el.close.hidden = false; el.close.addEventListener('click', closeEmbed); el.brand.addEventListener('click', (e) => { e.preventDefault(); closeEmbed(); }); }
    if (CFG.demo) {
      const b = document.createElement('span');
      b.className = 'demo-badge';
      b.title = 'Modo demostración: no se envía ningún dato';
      b.textContent = 'DEMO';
      el.passToggle.before(b);
    }
    el.passToggle.addEventListener('click', () => togglePass());
    el.scrim.addEventListener('click', () => togglePass(false));
    flushQueue();
    intro(() => {
      el.app.classList.remove('pre');
      render(FLOW.start);
    });
  }

  boot();
  window.SILA = { state, render, payload, NODES };
})();
