/* SILA launcher — pegar en Webflow (Site settings → Custom code → Footer):
 *   <script src="https://TU-HOSTING/embed/launcher.js" defer></script>
 * Opciones (atributos del <script>):
 *   data-fab="false"          oculta el botón flotante
 *   data-hook="false"         no engancha los botones CONTACTANOS / SOLICITÁ UNA DEMO
 *   data-label="Armá tu acceso"
 * Cualquier elemento con [data-sila] abre SILA.
 */
(function () {
  if (window.__silaLauncher) return;
  window.__silaLauncher = true;

  const me = document.currentScript;
  const base = new URL('../', me.src).href;
  const opt = (k, d) => (me.dataset[k] == null ? d : me.dataset[k]);
  const LABEL = opt('label', 'Armá tu acceso');
  const HOOK_RX = /contact|solicit[aá]\s+una\s+demo|cotiz/i;

  const css = `
  .sila-fab{position:fixed;right:22px;bottom:22px;z-index:2147482000;display:flex;align-items:center;gap:12px;
    padding:10px 18px 10px 10px;border:0;cursor:pointer;color:#fff;font:600 15px Poppins,system-ui,sans-serif;
    background:#006bf2;clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px);
    box-shadow:0 18px 40px -12px rgba(0,107,242,.7);transition:transform .25s cubic-bezier(.2,.8,.2,1),background .2s;
    animation:silaIn .6s 1.2s cubic-bezier(.2,.8,.2,1) both}
  .sila-fab:hover{background:#1a7bff;transform:translateY(-2px)}
  .sila-fab .m{width:36px;height:36px;display:grid;place-items:center;background:#0b1222;position:relative;overflow:hidden;
    clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px)}
  .sila-fab .m::after{content:'';position:absolute;left:0;right:0;height:2px;top:-2px;background:#3d8bff;box-shadow:0 0 8px #3d8bff;animation:silaScan 2.6s 2s ease-in-out infinite}
  .sila-fab small{display:block;font:500 10px 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.14em;opacity:.8;margin-bottom:1px}
  .sila-ov{position:fixed;inset:0;z-index:2147483000;background:#070b14;clip-path:circle(0 at var(--x) var(--y));
    transition:clip-path .65s cubic-bezier(.7,0,.2,1)}
  .sila-ov.open{clip-path:circle(150% at var(--x) var(--y))}
  .sila-ov iframe{width:100%;height:100%;border:0;display:block}
  html.sila-lock,html.sila-lock body{overflow:hidden!important}
  @keyframes silaIn{from{opacity:0;transform:translateY(16px)}}
  @keyframes silaScan{0%{top:-2px}50%{top:100%}100%{top:100%}}
  @media (max-width:600px){.sila-fab{right:14px;bottom:14px;padding:8px 14px 8px 8px;font-size:14px}.sila-fab small{display:none}}
  @media (prefers-reduced-motion:reduce){.sila-fab,.sila-ov{animation:none;transition:none}}`;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  let ov = null, frame = null, lastFocus = null;

  function url() {
    const u = new URL('sila.html', base);
    u.searchParams.set('embed', '1');
    const here = new URLSearchParams(location.search);
    ['utm_source', 'utm_medium', 'utm_campaign'].forEach((k) => here.get(k) && u.searchParams.set(k, here.get(k)));
    return u.href;
  }

  function build() {
    if (ov) return;
    ov = document.createElement('div');
    ov.className = 'sila-ov';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'SILA · Asistente comercial de Silicon Access');
    frame = document.createElement('iframe');
    frame.title = 'SILA · Silicon Access';
    frame.allow = 'clipboard-write';
    frame.src = url();
    ov.appendChild(frame);
    document.body.appendChild(ov);
  }

  function open(ev) {
    lastFocus = document.activeElement;
    build();
    const r = ev && ev.currentTarget && ev.currentTarget.getBoundingClientRect ? ev.currentTarget.getBoundingClientRect() : null;
    ov.style.setProperty('--x', r ? r.left + r.width / 2 + 'px' : '100%');
    ov.style.setProperty('--y', r ? r.top + r.height / 2 + 'px' : '100%');
    ov.style.visibility = 'visible';
    requestAnimationFrame(() => requestAnimationFrame(() => ov.classList.add('open')));
    document.documentElement.classList.add('sila-lock');
    setTimeout(() => frame && frame.focus(), 500);
    (window.dataLayer = window.dataLayer || []).push({ event: 'sila_open' });
  }

  function close() {
    if (!ov) return;
    ov.classList.remove('open');
    document.documentElement.classList.remove('sila-lock');
    setTimeout(() => { if (ov && !ov.classList.contains('open')) ov.style.visibility = 'hidden'; }, 700);
    lastFocus && lastFocus.focus && lastFocus.focus();
  }

  addEventListener('message', (e) => {
    const d = e.data || {};
    if (!frame || e.source !== frame.contentWindow || typeof d.type !== 'string') return;
    if (d.type === 'sila:close') close();
    if (d.type === 'sila:lead' || d.type === 'sila:sila_lead') (window.dataLayer = window.dataLayer || []).push({ event: 'sila_lead', ...d });
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && ov && ov.classList.contains('open')) close(); });

  function init() {
    if (opt('fab', 'true') !== 'false') {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sila-fab';
      b.innerHTML = `<span class="m"><svg width="20" height="20" viewBox="0 0 3 3"><path d="M1 0H2V1H3V2L2 3H1V2H0V1Z" fill="#3d8bff"/></svg></span><span><small>SILA · 1 MINUTO</small>${LABEL}</span>`;
      b.addEventListener('click', open);
      b.addEventListener('pointerenter', build, { once: true }); // precarga
      document.body.appendChild(b);
    }
    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-sila], a, button');
      if (!t || t.classList.contains('sila-fab')) return;
      const hit = t.hasAttribute('data-sila') || (opt('hook', 'true') !== 'false' && HOOK_RX.test((t.textContent || '').trim()));
      if (!hit) return;
      e.preventDefault();
      open({ currentTarget: t });
    }, true);
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
  window.SILA_OPEN = open;
})();
