// Capturas para el PDF de SILA (Edge headless + puppeteer-core)
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const BASE = 'http://localhost:8340/';
const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
const W = (ms) => new Promise((r) => setTimeout(r, ms));

const HELPERS = `
  window.__W=(ms)=>new Promise(r=>setTimeout(r,ms));
  window.__pick=(t)=>{const b=[...document.querySelectorAll('.opt')].find(b=>b.textContent.includes(t)); if(!b) throw new Error('no opt '+t); b.click(); return true};
  window.__txt=async(v)=>{document.querySelector('#tin').value=v; document.querySelector('#go').click(); await __W(950)};
`;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', userDataDir: path.join(__dirname, 'prof'), dumpio: false,
    args: ['--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  const desk = async () => page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
  const mob = async () => page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const shot = async (name, opt = {}) => { await page.screenshot({ path: path.join(OUT, name + '.jpg'), type: 'jpeg', quality: 86, ...opt }); console.log('ok', name); };
  const el = async (name, sel) => { const h = await page.$(sel); await h.screenshot({ path: path.join(OUT, name + '.png') }); console.log('ok', name); };
  const go = async (u) => { await page.goto(BASE + u, { waitUntil: 'networkidle2', timeout: 60000 }); await page.evaluate(HELPERS); };

  // limpiar demo
  await desk();
  await go('crm.html');
  await page.evaluate(() => localStorage.clear());

  // 1. sitio
  await go('');
  await W(3500);
  await shot('site_hero');
  await mob(); await go(''); await W(2500); await shot('site_mobile'); await desk();

  // 2. intro
  await page.goto(BASE + 'sila.html?intro=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#intro').classList.contains('s2'));
  await W(260); await shot('intro_1');
  await page.waitForFunction(() => document.querySelector('#itxt').textContent.includes('verificado'));
  await W(250); await shot('intro_2');
  await page.waitForFunction(() => document.querySelector('#intro').classList.contains('s4'));
  await W(330); await shot('intro_3');
  await W(2000);

  // 3. SILA desktop: N1
  await go('sila.html?intro=0&from=site');
  await W(1600); await shot('sila_n1');
  await el('opts_n1', '.opts');
  // escala urbanización
  await page.evaluate(() => __pick('Urbanización')); await W(1600);
  await page.evaluate(() => document.querySelectorAll('.opt')[2].dispatchEvent(new MouseEvent('mouseover')));
  await shot('sila_escala');
  await el('opts_lotes', '.opts');
  await page.evaluate(async () => { __pick('Entre 300'); await __W(1000); __pick('Accesos separados'); await __W(1000); __pick('Sí, contamos'); await __W(1000); await __txt('Planilla + app propia'); __pick('Soluciones de control'); __pick('App para'); __pick('Otra'); document.querySelector('#otherIn').value = 'Cámaras LPR'; document.querySelector('#otherBox').classList.add('show'); });
  await W(1200); await shot('sila_multi');
  await page.evaluate(async () => { document.querySelector('#go').click(); await __W(1000); await __txt('Barrio Los Álamos'); __pick('Ambos'); await __W(1000); __pick('pronto'); await __W(1000); await __txt('María Fernández'); });
  await W(900); await shot('sila_texto');
  await page.evaluate(async () => { await __txt('Pilar'); await __txt('Administradora'); document.querySelector('#tin').value = 'maria@'; document.querySelector('#go').click(); });
  await W(600); await shot('sila_validacion');
  await page.evaluate(async () => { await __txt('maria@losalamos.com.ar'); });
  await W(4200); await shot('sila_fin');
  await el('pase', '#passSlot .pass');
  // visor
  await page.evaluate(() => document.querySelector('#simView').click()); await W(500); await shot('visor_mail');
  await page.evaluate(() => document.querySelector('[data-t=crm]').click()); await W(300); await shot('visor_crm');
  await page.evaluate(() => document.querySelectorAll('.dlg-scrim').forEach(x=>x.remove())); await W(300);
  // whatsapp (sin isMobile: cambiarlo recarga la página)
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.evaluate(() => document.querySelector('#wa').click()); await W(5200); await shot('wa_sim');
  await page.evaluate(() => document.querySelector('.wa-quick button').click()); await W(2200); await shot('wa_sim2');

  // 4. otras ramas (preguntas con imágenes)
  await desk();
  for (const [v, pick2, name] of [['Parque', null, 'opts_parque'], ['Industria', 'Entre 100 y 500', 'opts_planta'], ['Concesionaria', 'Entre 50', 'opts_conce']]) {
    await go('sila.html?intro=0');
    await W(1200);
    await page.evaluate((v) => __pick(v), v); await W(1500);
    if (pick2) { await page.evaluate((p) => __pick(p), pick2); await W(1500); }
    await el(name, '.opts');
  }
  // multi de planta (denso)
  await page.evaluate(async () => { __pick('Mixto'); await __W(1000); __pick('Entre 2'); await __W(1000); __pick('No queda'); await __W(1000); __pick('Salesforce'); await __W(1000); __pick('mismo acceso'); await __W(1000); __pick('automáticos'); await __W(1000); __pick('formal'); await __W(1300); __pick('Integración'); __pick('Fast'); __pick('Auditoría'); });
  await W(800); await shot('sila_menu_conce');

  // 5. celular SILA
  await mob();
  await go('sila.html?intro=0');
  await W(1500); await shot('m_n1');
  await page.evaluate(async () => { __pick('Industria'); await __W(1000); __pick('Entre 100 y 500'); await __W(1000); __pick('contratistas y'); await __W(1000); __pick('pero sin control'); await __W(1000); __pick('mail o WhatsApp'); await __W(1000); __pick('con balanza'); await __W(1000); });
  await W(600); await shot('m_pregunta');
  await page.evaluate(() => document.querySelector('#passToggle').click()); await W(700); await shot('m_pase');

  // 6. bandeja comercial
  await desk();
  await go('crm.html');
  await page.evaluate(() => SILA_STORE.seed());
  await go('crm.html');
  await W(1500); await shot('crm_tablero');
  await page.evaluate(() => [...document.querySelectorAll('.lead')].find(l=>l.textContent.includes('Álamos')).click()); await W(600); await shot('crm_ficha');
  await page.evaluate(() => { document.querySelector('#dx').click(); document.querySelector('[data-v=sheet]').click(); }); await W(500); await shot('crm_planilla');
  await mob(); await go('crm.html'); await W(1200); await shot('m_crm');

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
