/* SILA — pase portable: codifica las respuestas en un link (sin servidor),
 * dibuja el QR con el isotipo de Silicon y genera el PDF de la tarjeta.
 * Requiere: js/flow.js y js/vendor/qrcode.js. jsPDF se carga sólo al descargar.
 */
(function () {
  'use strict';
  const NODES = window.SILA_FLOW.nodes;
  const KEYS = Object.keys(NODES);
  const ABC = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const VERT = { urb: 'Barrios cerrados / Consorcios', parque: 'Parques industriales', planta: 'Industrias', conce: 'Concesionarios de autos', edif: 'Edificios corporativos' };
  const MARK_PTS = [[1, 0], [2, 0], [2, 1], [3, 1], [3, 2], [2, 3], [1, 3], [1, 2], [0, 2], [0, 1]];
  const opts = (n, ans) => (typeof n.options === 'function' ? n.options(ans) : n.options || []);
  const qText = (n, ans) => (typeof n.q === 'function' ? n.q(ans) : n.q);

  /* ── codificación compacta: [id, fecha, códigos, textos] → base64url ── */
  function b64e(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64d(s) {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }

  function encode(st) {
    const ans = st.answers, texts = [];
    let codes = '';
    st.history.forEach((id) => {
      const n = NODES[id], k = ABC[KEYS.indexOf(id)], v = ans[id];
      if (n.kind === 'single') codes += k + ABC[opts(n, ans).findIndex((o) => o.id === v)];
      else if (n.kind === 'multi') {
        codes += k + '(' + (v || []).map((x) => ABC[opts(n, ans).findIndex((o) => o.id === x)]).join('') + ')';
        if ((v || []).includes('otra')) texts.push(st.other[id] || '');
      } else { codes += k + '~'; texts.push(String(v || '')); }
    });
    const f = st.fechaRaw || ymd(st.fecha);
    return '1' + b64e(JSON.stringify([st.leadId || '', f, codes, texts]));
  }

  // fecha compacta AAAAMMDD (en el link) ↔ DD/MM/AAAA (en la tarjeta)
  function ymd(iso) {
    let d = new Date(iso || Date.now());
    if (isNaN(d)) d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }
  const dmy = (f) => `${f.slice(6, 8)}/${f.slice(4, 6)}/${f.slice(0, 4)}`;

  function decode(s) {
    if (!s || s[0] !== '1') throw new Error('formato');
    const [id, f, codes, texts] = JSON.parse(b64d(s.slice(1)));
    const answers = {}, other = {}, history = [];
    let i = 0, t = 0;
    while (i < codes.length) {
      const id2 = KEYS[ABC.indexOf(codes[i++])];
      const n = NODES[id2];
      if (!n) throw new Error('nodo');
      history.push(id2);
      if (n.kind === 'single') answers[id2] = opts(n, answers)[ABC.indexOf(codes[i++])].id;
      else if (n.kind === 'multi') {
        const end = codes.indexOf(')', i);
        answers[id2] = codes.slice(i + 1, end).split('').map((c) => opts(n, answers)[ABC.indexOf(c)].id);
        i = end + 1;
        if (answers[id2].includes('otra')) other[id2] = texts[t++];
      } else { i++; answers[id2] = texts[t++]; }
    }
    return { leadId: id, fechaRaw: f, answers, other, history };
  }

  function url(st) {
    return new URL('pase.html', location.href).href.split('#')[0].split('?')[0] + '#' + encode(st);
  }

  /* ── modelo de la tarjeta (mismo contenido que "Tu pase") ── */
  function model(st) {
    const a = st.answers;
    const label = (id) => {
      const n = NODES[id], v = a[id];
      if (n.kind === 'single') return (opts(n, a).find((o) => o.id === v) || {}).label || '';
      if (n.kind === 'multi') return (v || []).map((x) => (x === 'otra' ? st.other[id] || 'Otra' : (opts(n, a).find((o) => o.id === x) || {}).label)).filter(Boolean);
      return String(v || '');
    };
    const rows = st.history.filter((h) => h !== 'N1' && !NODES[h].account && !NODES[h].field)
      .map((h) => ({ k: NODES[h].pass, v: label(h) }));
    const contact = ['N0', 'N6', 'N7', 'N8'].filter((k) => a[k]).map((k) => ({ k: NODES[k].pass, v: a[k] }));
    return {
      id: st.leadId || '',
      fecha: dmy(st.fechaRaw || ymd(st.fecha)),
      name: st.history.filter((h) => NODES[h].account).map((h) => a[h]).join(' · '),
      vertical: VERT[a.N1] || '',
      rows: rows.concat(contact),
      qa: st.history.map((h) => ({ q: qText(NODES[h], a), r: [].concat(label(h)).join(', ') })),
    };
  }

  /* ── QR con el isotipo en el centro ── */
  function qrMatrix(text) {
    const q = window.qrcode(0, 'M');
    q.addData(text, 'Byte');
    q.make();
    const n = q.getModuleCount();
    const m = [];
    for (let r = 0; r < n; r++) { m.push([]); for (let c = 0; c < n; c++) m[r].push(q.isDark(r, c)); }
    // hueco central para el logo (~22% del ancho; el nivel M corrige hasta 15% de daño)
    const hole = Math.round(n * 0.22) | 1, h0 = (n - hole) >> 1;
    return { n, m, hole, h0 };
  }
  const markPath = (x, y, s) => 'M' + MARK_PTS.map(([px, py]) => `${(x + (px * s) / 3).toFixed(3)} ${(y + (py * s) / 3).toFixed(3)}`).join('L') + 'Z';

  function qrSVG(text, cls) {
    const { n, m, hole, h0 } = qrMatrix(text);
    const pad = 2, N = n + pad * 2;
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (r >= h0 - 1 && r < h0 + hole + 1 && c >= h0 - 1 && c < h0 + hole + 1) continue;
      if (m[r][c]) d += `M${c + pad} ${r + pad}h1v1h-1z`;
    }
    const lx = h0 + pad - 0.5, ls = hole + 1;
    return `<svg class="${cls || 'qr'}" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges" role="img" aria-label="Código QR del pase">
      <rect width="${N}" height="${N}" fill="#fff"/><path d="${d}" fill="#0a1222"/>
      <rect x="${lx}" y="${lx}" width="${ls}" height="${ls}" rx="${ls * 0.18}" fill="#fff"/>
      <path d="${markPath(lx + ls * 0.16, lx + ls * 0.16, ls * 0.68)}" fill="#006bf2" shape-rendering="geometricPrecision"/>
    </svg>`;
  }

  /* ── PDF de la tarjeta (jsPDF, vectorial) ── */
  let jspdfP = null;
  function loadJsPDF() {
    if (window.jspdf) return Promise.resolve(window.jspdf);
    if (!jspdfP) {
      jspdfP = new Promise((ok, ko) => {
        const s = document.createElement('script');
        const me = document.querySelector('script[src*="js/pase.js"]');
        s.src = new URL('vendor/jspdf.umd.min.js', me ? me.src : new URL('js/', location.href)).href;
        s.onload = () => ok(window.jspdf);
        s.onerror = () => { jspdfP = null; ko(new Error('No se pudo cargar el generador de PDF')); };
        document.head.appendChild(s);
      });
    }
    return jspdfP;
  }
  // las fuentes estándar del PDF usan Latin-1: normalizamos lo que no entra
  const latin = (s) => String(s ?? '').replace(/[—–]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...').replace(/[^\x00-\xFF]/g, '');

  function drawCard(doc, M, link, draw) {
    const W = 100, P = 6, CW = W - P * 2, x0 = P, ix = x0 + 7, iw = CW - 14;
    let y = P;
    const cardTop = y;
    const blue = [0, 107, 242], white = [255, 255, 255], ice = [207, 226, 255];
    // medir alto total primero (cuando draw=false)
    y += 7;
    const topY = y; y += 12;                      // isotipo + títulos
    const chipY = y; y += 11;                     // chip
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    const nameLines = doc.splitTextToSize(latin(M.name || 'Tu predio'), iw);
    const nameY = y + 5; y += nameLines.length * 6.4 + 1;
    const vertY = y + 3; y += 8;
    const rowsY = y + 2;
    const rowsLayout = [];
    doc.setFontSize(8.6);
    M.rows.forEach((r) => {
      const ry = y + 4;
      if (Array.isArray(r.v)) {
        // etiquetas que fluyen en varias líneas
        let tx = ix + 30, ty = ry - 3.4, lh = 4.6; const tags = [], maxW = iw - 30;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.2);
        r.v.forEach((t) => {
          let lines = [latin(t)], tw = doc.getTextWidth(lines[0]) + 4;
          if (tw > maxW) { lines = doc.splitTextToSize(lines[0], maxW - 4); tw = maxW; }
          const th = 4.6 + (lines.length - 1) * 3.1;
          if (tx + tw > ix + iw + 0.01 && tx > ix + 30) { tx = ix + 30; ty += lh + 0.8; lh = 4.6; }
          tags.push({ lines, x: tx, y: ty, w: tw, h: th }); tx += tw + 1.6; lh = Math.max(lh, th);
        });
        rowsLayout.push({ r, y: ry, tags });
        y = ty + lh + 2.4;
      } else {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.6);
        const lines = doc.splitTextToSize(latin(r.v), iw - 30);
        rowsLayout.push({ r, y: ry, lines });
        y += Math.max(1, lines.length) * 3.9 + 2.6;
      }
    });
    y += 4;
    const botY = y; const qs = 30; y += qs + 9;
    const cardH = y - cardTop;
    const total = cardTop + cardH + 22;
    if (!draw) return total;

    // fondo de página
    doc.setFillColor(7, 11, 20); doc.rect(0, 0, W, total, 'F');
    // tarjeta con chaflanes (como el isotipo)
    const c = 7, cx = x0, cy = cardTop;
    const poly = (pts) => doc.lines(pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]), pts[0][0], pts[0][1], [1, 1], 'F', true);
    doc.setFillColor(...blue);
    poly([[cx + c, cy], [cx + CW, cy], [cx + CW, cy + cardH - c], [cx + CW - c, cy + cardH], [cx, cy + cardH], [cx, cy + c]]);
    // brillo superior derecho (lo que sobresale de la tarjeta se tapa con el fondo)
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.12 }));
    doc.setFillColor(255, 255, 255); doc.circle(x0 + CW - 4, cy + 4, 34, 'F');
    doc.restoreGraphicsState();
    doc.setFillColor(7, 11, 20);
    doc.rect(0, 0, W, cy, 'F'); doc.rect(x0 + CW, 0, W - x0 - CW, total, 'F');

    // isotipo + encabezado
    const mk = 9;
    doc.setFillColor(...white);
    const pts = MARK_PTS.map(([px, py]) => [ix + (px * mk) / 3, topY + (py * mk) / 3]);
    doc.lines(pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]), pts[0][0], pts[0][1], [1, 1], 'F', true);
    doc.setTextColor(...white); doc.setFont('courier', 'bold'); doc.setFontSize(7);
    const rtext = (t, ty) => doc.text(t, ix + iw - (doc.getTextWidth(t) + 0.6 * (t.length - 1)), ty, { charSpace: 0.6 });
    rtext('PASE DE INGRESO', topY + 3.5);
    rtext('SILICON ACCESS', topY + 7.5);
    // chip
    doc.setFillColor(227, 199, 122); doc.roundedRect(ix, chipY, 11, 8, 1.4, 1.4, 'F');
    doc.setDrawColor(150, 120, 50); doc.setLineWidth(0.2); doc.line(ix, chipY + 2.7, ix + 11, chipY + 2.7); doc.line(ix, chipY + 5.3, ix + 11, chipY + 5.3);
    // sello
    doc.setDrawColor(...white); doc.setLineWidth(0.5); doc.setFillColor(10, 88, 205);
    doc.roundedRect(ix + iw - 38, chipY + 0.5, 38, 7, 1, 1, 'FD');
    doc.setFont('courier', 'bold'); doc.setFontSize(7.4); doc.text('ACCESO CONCEDIDO', ix + iw - 19, chipY + 5.1, { align: 'center', charSpace: 0.3 });
    // nombre + vertical
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(nameLines, ix, nameY, { lineHeightFactor: 1.12 });
    doc.setFont('courier', 'bold'); doc.setFontSize(7.6); doc.setTextColor(...ice);
    doc.text(latin(M.vertical.toUpperCase()), ix, vertY, { charSpace: 0.5 });
    // filas
    rowsLayout.forEach(({ r, y: ry, lines, tags }) => {
      doc.setFont('courier', 'bold'); doc.setFontSize(6.4); doc.setTextColor(...ice);
      doc.text(doc.splitTextToSize(latin(String(r.k).toUpperCase()), 27), ix, ry - 0.4, { charSpace: 0.2 });
      if (tags) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.2);
        tags.forEach((g) => {
          doc.setFillColor(51, 137, 255); doc.roundedRect(g.x, g.y - 0.2, g.w, g.h, 1, 1, 'F');
          doc.setTextColor(...white); doc.text(g.lines, g.x + 2, g.y + 3, { lineHeightFactor: 1.45 });
        });
      } else {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.6); doc.setTextColor(...white);
        doc.text(lines, ix + 30, ry, { lineHeightFactor: 1.3 });
      }
    });
    // pie: número de pase + QR real
    doc.setFont('courier', 'bold'); doc.setFontSize(6.4); doc.setTextColor(...ice);
    doc.text('N° DE PASE', ix, botY + 14);
    doc.setFontSize(12); doc.setTextColor(...white); doc.text(latin(M.id), ix, botY + 20);
    doc.setFontSize(6.4); doc.setTextColor(...ice); doc.text('EMITIDO ' + latin(M.fecha), ix, botY + 25);
    const qx = ix + iw - qs, qy = botY;
    doc.setFillColor(...white); doc.roundedRect(qx - 1.5, qy - 1.5, qs + 3, qs + 3, 1.6, 1.6, 'F');
    const { n, m, hole, h0 } = qrMatrix(link);
    const ms = qs / n;
    doc.setFillColor(10, 18, 34);
    for (let r = 0; r < n; r++) for (let cc = 0; cc < n; cc++) {
      if (r >= h0 - 1 && r < h0 + hole + 1 && cc >= h0 - 1 && cc < h0 + hole + 1) continue;
      if (m[r][cc]) doc.rect(qx + cc * ms, qy + r * ms, ms + 0.02, ms + 0.02, 'F');
    }
    const ls = (hole + 1) * ms, lx = qx + (h0 - 0.5) * ms;
    doc.setFillColor(...white); doc.roundedRect(lx, lx - qx + qy, ls, ls, ls * 0.18, ls * 0.18, 'F');
    doc.setFillColor(...blue);
    const s2 = ls * 0.68, ox = lx + ls * 0.16, oy = lx - qx + qy + ls * 0.16;
    const p2 = MARK_PTS.map(([px, py]) => [ox + (px * s2) / 3, oy + (py * s2) / 3]);
    doc.lines(p2.slice(1).map((p, i) => [p[0] - p2[i][0], p[1] - p2[i][1]]), p2[0][0], p2[0][1], [1, 1], 'F', true);
    doc.link(qx, qy, qs, qs, { url: link });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...ice);
    doc.text('Escaneá para volver a ver tu pase', qx + qs / 2, qy + qs + 4.6, { align: 'center' });

    // texto debajo de la tarjeta
    const fy = cardTop + cardH + 8;
    doc.setTextColor(234, 242, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('Un asesor de Silicon Access te contacta en 24 hs hábiles.', W / 2, fy, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(142, 162, 194);
    doc.text('Generado por SILA · silicon-access.com', W / 2, fy + 5, { align: 'center' });
    doc.text('Demostración: este pase no tiene validez como credencial de acceso.', W / 2, fy + 9.5, { align: 'center' });
    return total;
  }

  async function pdf(st) {
    const { jsPDF } = await loadJsPDF();
    const M = model(st), link = url(st);
    const probe = new jsPDF({ unit: 'mm', format: [100, 400] });
    const H = Math.ceil(drawCard(probe, M, link, false));
    const doc = new jsPDF({ unit: 'mm', format: [100, H], compress: true });
    doc.setProperties({ title: `Pase ${M.id} · Silicon Access`, subject: 'Pase de ingreso SILA', author: 'Silicon Access', creator: 'SILA' });
    drawCard(doc, M, link, true);
    return { doc, name: `Pase-${M.id || 'SILA'}.pdf` };
  }

  async function download(st) {
    const { doc, name } = await pdf(st);
    doc.save(name);
    return name;
  }

  window.SILA_PASE = { encode, decode, url, model, qrSVG, pdf, download };
})();
