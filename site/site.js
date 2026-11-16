/* Maqueta Silicon Access: menú, testimonios, logos y salto a SILA */
(function () {
  const $ = (s) => document.querySelector(s);
  const CDN = 'https://cdn.prod.website-files.com/6182a6498e5d9c44fad44d26/';

  // menú móvil
  const nav = $('#nav'), burger = $('#burger');
  burger.addEventListener('click', () => {
    const o = nav.classList.toggle('open');
    burger.setAttribute('aria-expanded', o);
  });
  $('#menu').addEventListener('click', (e) => { if (e.target.closest('a')) nav.classList.remove('open'); });

  // enlaces fuera de la demo
  const toast = $('#toast');
  let tt;
  document.querySelectorAll('[data-off]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    toast.textContent = a.dataset.off;
    toast.classList.add('show');
    clearTimeout(tt);
    tt = setTimeout(() => toast.classList.remove('show'), 2600);
  }));

  // → SILA con transición (círculo desde el botón + isotipo)
  const gate = $('#gate');
  document.querySelectorAll('[data-sila]').forEach((a) => a.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    const r = a.getBoundingClientRect();
    gate.style.setProperty('--x', r.left + r.width / 2 + 'px');
    gate.style.setProperty('--y', r.top + r.height / 2 + 'px');
    gate.classList.add('go');
    const u = new URL('sila.html', location.href);
    u.searchParams.set('from', 'site');
    u.searchParams.set('intro', '1');
    u.searchParams.set('utm_source', 'web');
    u.searchParams.set('utm_medium', a.classList.contains('sila-fab') ? 'boton_flotante' : (a.textContent.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_') || 'link'));
    setTimeout(() => { location.href = u.href; }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 900);
  }));
  // al volver con "atrás" (bfcache) la cortina no debe quedar puesta
  addEventListener('pageshow', () => gate.classList.remove('go'));

  // botón flotante: aparece cuando el CTA del hero ya no se ve (no tapa "CONTACTANOS")
  const fab = document.querySelector('.sila-fab');
  const heroCta = document.querySelector('.hero .btn-w');
  if (fab && heroCta && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => fab.classList.toggle('show', !e.isIntersecting), { threshold: 0 }).observe(heroCta);
  } else if (fab) fab.classList.add('show');

  // testimonios
  const slides = $('#slides');
  const count = slides.children.length;
  let i = 0;
  const per = () => (matchMedia('(max-width: 640px)').matches ? 1 : 2);
  const go = (d) => {
    const max = count - per();
    i = (i + d + max + 1) % (max + 1);
    const w = slides.children[0].getBoundingClientRect().width + 26;
    slides.style.transform = `translateX(${-i * w}px)`;
  };
  $('#next').addEventListener('click', () => go(1));
  $('#prev').addEventListener('click', () => go(-1));
  let auto = setInterval(() => go(1), 6000);
  slides.addEventListener('pointerenter', () => clearInterval(auto));
  addEventListener('resize', () => { i = 0; slides.style.transform = ''; });

  // logos de clientes (marquesina continua)
  const logos = [
    '69cd58c824fc0602ab56f920_Car%20One%20Logo%20Primario.png',
    '69cd53acc85e5a60a1bd6d92_98e27707721d537a4a2037ba6ee5af36_logo.png',
    '69cd5a8b569402bf09539485_logo%20(6).png',
    '69cd59030440b15f4841e02e_33b46b7425520c8d6a338f555cdfbc4d_logo_andromaco_footer.png',
    '69cd5a5afc529a5cecc0f1a3_logo%20(12).png',
    '69d55fe4c628d5bf37b80b0b_logo-cruz-del-sur.png',
    '69d56075826de5f5e54319f8_Logo-San-Lucas-2.png',
    '69d560b418cf68a95e4a1b18_220db1467e5db1bad0b52c9a9961df69_Logo_350_px-GRIS.png',
  ];
  const html = logos.map((f) => `<div class="lg"><img loading="lazy" src="${CDN + f}" alt=""></div>`).join('');
  $('#logos').innerHTML = html + html;
})();
