const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', userDataDir: path.join(__dirname, 'prof') });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await p.goto('file:///' + path.join(__dirname, 'doc/sila.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
  await p.evaluateHandle('document.fonts.ready');
  await p.pdf({ path: process.argv[2], width: '1280px', height: '720px', printBackground: true, outline: true, tagged: true, preferCSSPageSize: true });
  fs.mkdirSync(path.join(__dirname, 'prev'), { recursive: true });
  const secs = await p.$$('.page');
  for (let i = 0; i < secs.length; i++) await secs[i].screenshot({ path: path.join(__dirname, 'prev', String(i + 1).padStart(2, '0') + '.jpg'), type: 'jpeg', quality: 70 });
  console.log('pages', secs.length);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
