/* SILA — pictogramas propios (64×64). Estilo: línea de plano + bloque azul del isotipo.
 * Clases: a=bloque acento · as=trazo acento · g=fantasma · dash=punteado
 *         w=rueda (tapa fondo) · ck=trazo sobre acento · arm=brazo de barrera (sube al hover)
 */
(function () {
  const P = (d, c) => `<path d="${d}"${c ? ` class="${c}"` : ''}/>`;
  const R = (x, y, w, h, r = 1.5, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"${c ? ` class="${c}"` : ''}/>`;
  const C = (cx, cy, r, c) => `<circle cx="${cx}" cy="${cy}" r="${r}"${c ? ` class="${c}"` : ''}/>`;
  const T = (x, y, s, c) => `<text x="${x}" y="${y}" class="${c || 'tx'}" text-anchor="middle">${s}</text>`;
  const ground = (y = 56) => P(`M4 ${y}H60`, 'g');

  // ── piezas ──
  const post = (x, base = 56, h = 18) => R(x - 2.5, base - h, 5, h, 1, 'a');
  const arm = (x, y, len) =>
    `<path d="M${x} ${y}H${x + len}" class="as arm" style="transform-origin:${x}px ${y}px"/>`;
  const armL = (x, y, len) =>
    `<path d="M${x} ${y}H${x - len}" class="as arm armL" style="transform-origin:${x}px ${y}px"/>`;
  const barrier = (x, len, base = 56, h = 18) => post(x, base, h) + arm(x, base - h + 4, len);
  const person = (cx, top, c) =>
    `<g${c ? ` class="${c}"` : ''}>${C(cx, top + 4, 4)}${P(`M${cx - 7} ${top + 22}V${top + 17}Q${cx - 7} ${top + 10} ${cx} ${top + 10}Q${cx + 7} ${top + 10} ${cx + 7} ${top + 17}V${top + 22}`)}</g>`;
  const car = (x, y, w = 28, c = 'a') => {
    const k = (f) => +(x + w * f).toFixed(1);
    return (
      P(`M${x} ${y - 3}V${y - 8}Q${x} ${y - 10} ${x + 3} ${y - 10}L${k(0.24)} ${y - 10.5}L${k(0.37)} ${y - 16.5}H${k(0.66)}L${k(0.8)} ${y - 10.5}H${x + w - 2}Q${x + w} ${y - 10} ${x + w} ${y - 8}V${y - 3}Z`, c) +
      C(k(0.25), y - 3, 3, 'w') + C(k(0.76), y - 3, 3, 'w')
    );
  };
  const truck = (x, y) =>
    R(x, y - 15, 20, 11, 1, 'a') +
    P(`M${x + 21} ${y - 4}V${y - 12}H${x + 26}L${x + 30} ${y - 8}V${y - 4}Z`) +
    C(x + 5, y - 3, 2.6, 'w') + C(x + 14, y - 3, 2.6, 'w') + C(x + 26, y - 3, 2.6, 'w');
  const doc = (x, y, w, h, c) =>
    `<g${c ? ` class="${c}"` : ''}>${P(`M${x} ${y}H${x + w - 6}L${x + w} ${y + 6}V${y + h}H${x}Z`)}${P(`M${x + w - 6} ${y}V${y + 6}H${x + w}`)}${P(`M${x + 5} ${y + 14}H${x + w - 6}M${x + 5} ${y + 20}H${x + w - 9}M${x + 5} ${y + 26}H${x + w - 7}`, 'g')}</g>`;
  const phone = (x, y, w, h) => R(x, y, w, h, 4) + P(`M${x + w / 2 - 3} ${y + h - 4}H${x + w / 2 + 3}`);
  const badgeCheck = (cx, cy, r = 7) =>
    C(cx, cy, r, 'a') + P(`M${cx - r * 0.45} ${cy}l${r * 0.32} ${r * 0.34}l${r * 0.58} -${r * 0.62}`, 'ck');
  const ban = (cx, cy, r) =>
    C(cx, cy, r, 'as') + P(`M${cx - r * 0.7} ${cy - r * 0.7}L${cx + r * 0.7} ${cy + r * 0.7}`, 'as');
  const pin = (cx, cy, s = 1, c = 'a') =>
    P(`M${cx} ${cy + 9 * s}C${cx - 2 * s} ${cy + 5 * s} ${cx - 7 * s} ${cy + 1 * s} ${cx - 7 * s} ${cy - 4 * s}A${7 * s} ${7 * s} 0 0 1 ${cx + 7 * s} ${cy - 4 * s}C${cx + 7 * s} ${cy + 1 * s} ${cx + 2 * s} ${cy + 5 * s} ${cx} ${cy + 9 * s}Z`, c) +
    C(cx, cy - 4 * s, 2.4 * s, 'w0');
  const house = (x, y, w, h, c) => P(`M${x} ${y}V${y - h * 0.6}L${x + w / 2} ${y - h}L${x + w} ${y - h * 0.6}V${y}`, c);

  // ── medidores de densidad (rangos) ──
  const TINY = {
    house: P('M2 15V8L8 2.5L14 8V15Z', 'a'),
    ware: P('M1 15V7L5 4V7L9 4V7L13 4V7L15 7V15Z', 'a'),
    person: C(8, 4, 3, 'a') + P('M2.5 15.5V12.5Q2.5 8.5 8 8.5Q13.5 8.5 13.5 12.5V15.5Z', 'a'),
    car: P('M1 12.5V9.5L3.5 9L5.5 5.5H10.5L12.5 9L15 9.5V12.5Z', 'a') + C(4.5, 12.5, 1.6, 'w') + C(11.5, 12.5, 1.6, 'w'),
  };
  function meter(kind, n) {
    const cols = Math.ceil(Math.sqrt(n * 1.4));
    const rows = Math.ceil(n / cols);
    const cell = Math.min(46 / cols, 40 / rows);
    const s = Math.min(cell * 0.82 / 16, 1.9);
    const gw = cols * cell, gh = rows * cell;
    const ox = 32 - gw / 2, oy = 34 - gh / 2;
    let out = R(6, 8, 52, 50, 4, 'g dash');
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      const x = ox + c * cell + (cell - 16 * s) / 2;
      const y = oy + r * cell + (cell - 16 * s) / 2;
      out += `<g class="dot" style="--i:${i}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s.toFixed(2)})">${TINY[kind]}</g>`;
    }
    return out;
  }

  // ── catálogo ──
  const I = {
    /* verticales (escenas) */
    v_urb:
      ground() +
      house(6, 56, 20, 26) + R(13, 45, 6, 11, 1, 'a') +
      house(24, 56, 16, 20, 'g') +
      C(48, 30, 7, 'g') + P('M48 37V56', 'g') +
      barrier(36, 22, 56, 14),
    v_parque:
      ground() +
      P('M4 56V30L11 25V30L18 25V30L25 25V30L32 25V56') + P('M8 38H28M8 45H28', 'g') +
      P('M36 26H58V42', 'g') +
      truck(30, 56),
    v_planta:
      ground() +
      P('M6 56V36L15 30V36L24 30V36L33 30V36H44V56Z') +
      R(10, 42, 6, 5, 1, 'g') + R(20, 42, 6, 5, 1, 'g') + R(30, 42, 6, 5, 1, 'g') +
      R(47, 18, 7, 38, 1, 'a') +
      `<g class="smoke">${C(52, 11, 3.4, 'g')}${C(58, 6, 2.6, 'g')}</g>` +
      R(14, 49, 8, 7, 1, 'a'),
    v_conce:
      ground() +
      R(5, 16, 54, 6, 1.5, 'a') + P('M7 22V56M57 22V56') + P('M22 22V40M42 22V40', 'g') +
      car(12, 54, 40),
    v_edif:
      ground() +
      R(14, 8, 26, 48, 1.5) + P('M14 8L27 4L40 8', 'g') +
      R(18, 14, 5, 5, 1, 'g') + R(25, 14, 5, 5, 1, 'g') + R(32, 14, 5, 5, 1, 'g') +
      R(18, 23, 5, 5, 1, 'g') + R(25, 23, 5, 5, 1, 'g') + R(32, 23, 5, 5, 1, 'g') +
      R(18, 32, 5, 5, 1, 'g') + R(32, 32, 5, 5, 1, 'g') + R(23, 42, 9, 14, 1, 'a') +
      R(44, 26, 14, 30, 1.5, 'g') + P('M48 32H54M48 38H54M48 44H54', 'g'),

    /* edificios corporativos */
    reception:
      ground() + person(32, 10, 'a') + R(8, 34, 48, 8, 1.5) + P('M12 42V56M52 42V56', 'g') + R(40, 26, 10, 8, 1, 'g'),
    s_totem:
      R(20, 6, 24, 44, 4) + R(24, 11, 16, 16, 2, 'a') + C(32, 35, 4, 'g') + P('M26 50L22 58H42L38 50') + badgeCheck(46, 18, 7),
    s_floors:
      R(14, 6, 30, 50, 2) + P('M14 18H44M14 30H44M14 42H44', 'g') + R(18, 22, 8, 5, 1, 'a') +
      R(48, 28, 10, 14, 2, 'a') + P('M51 28V24Q51 20 53 20Q55 20 55 24V28', 'as'),
    s_package:
      P('M10 22L32 12L54 22V46L32 56L10 46Z') + P('M10 22L32 32L54 22M32 32V56', 'g') + P('M21 17L43 27V35', 'as'),
    s_room:
      R(8, 14, 34, 24, 2) + P('M14 22H36M14 28H30', 'g') + P('M25 38V48M18 48H32', 'g') +
      C(48, 40, 9, 'a') + P('M48 35V40L51 43', 'ck'),

    /* rangos */
    ...Object.fromEntries(
      [['house', [2, 5, 9, 16]], ['ware', [2, 5, 9, 16]], ['person', [2, 5, 9, 16]], ['car', [2, 6, 14]]]
        .flatMap(([k, ns]) => ns.map((n) => [`m_${k}_${n}`, meter(k, n)]))
    ),

    /* accesos */
    gate_1: ground() + R(8, 34, 14, 22, 2) + R(11, 38, 8, 6, 1, 'a') + barrier(30, 26),
    gate_2: ground() + barrier(12, 40) + `<g class="g">${post(40, 34, 10)}${P('M40 28H58')}</g>` + P('M4 34H60', 'g dash'),
    gate_3: ground() + barrier(10, 13, 56, 14) + barrier(28, 13, 56, 14) + barrier(46, 13, 56, 14) + P('M6 30H58', 'g dash'),
    gate_split:
      ground() + P('M32 10V56', 'g dash') +
      house(9, 34, 14, 14) + R(41, 22, 14, 12, 1.5) + P('M48 22V34', 'g') +
      post(8, 56, 14) + arm(8, 46, 20) + post(56, 56, 14) + armL(56, 46, 20),
    gate_truckcar:
      ground() + P('M32 8V56', 'g dash') + truck(2, 34) + car(36, 34, 24) +
      post(8, 56, 14) + arm(8, 46, 20) + post(40, 56, 14) + arm(40, 46, 18),
    gate_open:
      ground() + post(14) + P('M14 42V12', 'as') +
      P('M24 48H52', 'g dash') + P('M46 42L53 48L46 54', 'as'),

    /* sistema actual */
    sys_ok: R(8, 10, 48, 32, 3) + P('M26 50H38M32 42V50') + P('M14 19H34M14 25H30M14 31H36', 'g') + badgeCheck(46, 32, 8),
    clipboard:
      R(14, 10, 36, 46, 3) + R(24, 6, 16, 8, 2, 'a') +
      R(19, 21, 5, 5, 1) + P('M28 23.5H44', 'g') + R(19, 31, 5, 5, 1) + P('M28 33.5H42', 'g') + R(19, 41, 5, 5, 1) + P('M28 43.5H40', 'g') +
      P('M20 23L21.5 25L24 21M20 33L21.5 35L24 31', 'as'),

    /* soluciones */
    s_barrier: ground() + R(8, 34, 14, 22, 2) + R(11, 38, 8, 6, 1, 'a') + barrier(30, 26) + badgeCheck(50, 18, 7),
    s_app: phone(20, 6, 24, 50) + R(24, 11, 16, 7, 1.5, 'a') + P('M25 25H39M25 31H36M25 37H38', 'g') + badgeCheck(44, 46, 7),
    s_comunidad: ground() + person(16, 30, 'g') + person(48, 30, 'g') + `<g class="solid">${person(32, 24)}</g>`,
    otra: R(10, 10, 44, 44, 8, 'g dash') + R(28, 18, 8, 28, 2, 'a') + R(18, 28, 28, 8, 2, 'a'),
    s_lpr:
      P('M54 56V16') + P('M54 18H34V28H54', 'a') + C(36, 23, 2, 'w') +
      P('M34 27L12 42M36 28L34 42', 'g dash') +
      R(6, 40, 34, 16, 5) + R(13, 47, 20, 6, 1, 'a') + P('M17 50H29', 'ck'),
    s_web:
      R(6, 10, 52, 42, 3) + P('M6 18H58') + C(11, 14, 1.2) + C(15, 14, 1.2) + C(19, 14, 1.2) +
      R(12, 24, 12, 10, 1.5, 'a') + R(27, 24, 12, 10, 1.5) + R(42, 24, 11, 10, 1.5) +
      R(12, 38, 12, 9, 1.5) + R(27, 38, 12, 9, 1.5) + P('M44 38L50 50L52 45L57 44Z', 'as'),
    s_visitas:
      P('M16 9H48', 'g') + R(10, 13, 44, 32, 3) + R(15, 19, 13, 16, 2, 'a') +
      P('M33 22H48M33 28H44M33 34H46', 'g') + badgeCheck(48, 48, 7),
    s_selfie:
      phone(18, 4, 28, 52) + C(32, 24, 7) + P('M23 40Q23 33 32 33Q41 33 41 40', 'g') +
      P('M22 13H24M22 13V15M42 13H40M42 13V15M22 37V35M42 37V35', 'as') + badgeCheck(46, 48, 7),
    s_obras:
      ground() + P('M14 42Q14 22 32 22Q50 22 50 42Z', 'a') + P('M8 42H56', 'as') +
      P('M27 22V30M37 22V30', 'ck') + P('M26 56L30 46H34L38 56', 'g'),
    s_tailgating:
      P('M10 56V10H54V56', 'g dash') + `<g class="solid">${person(24, 22)}</g>` + person(40, 26) +
      ban(48, 18, 7),
    s_reportes:
      P('M8 8V56H58') + R(14, 38, 8, 16, 1) + R(26, 28, 8, 26, 1, 'a') + R(38, 34, 8, 20, 1) + R(50, 20, 6, 34, 1, 'a') +
      P('M14 26L28 16L40 22L54 10', 'as'),
    s_export:
      doc(10, 6, 32, 44) + R(16, 34, 4, 10, 0.5, 'a') + R(23, 30, 4, 14, 0.5, 'a') + R(30, 36, 4, 8, 0.5, 'a') +
      C(46, 46, 10, 'a') + P('M46 40V52M41 47L46 52L51 47', 'ck'),
    s_door: R(12, 8, 26, 48, 2) + C(32, 34, 1.6, 'as') + R(46, 26, 10, 14, 2, 'a') + P('M49 21Q51 19 53 21M47 17Q51 13 55 17', 'as'),
    s_sos: C(32, 32, 22) + C(32, 32, 15, 'a') + T(32, 36.5, 'SOS', 'tx tx-in'),
    s_sync:
      P('M32 22Q40 22 40 25Q40 28 32 28Q24 28 24 25Q24 22 32 22ZM24 25V39Q24 42 32 42Q40 42 40 39V25', 'a') +
      P('M10 30A22 22 0 0 1 48 14', 'as') + P('M42 12L48 14L47 20', 'as') +
      P('M54 34A22 22 0 0 1 16 50', 'as') + P('M22 52L16 50L17 44', 'as'),
    s_key: R(10, 22, 22, 32, 7, 'a') + C(21, 32, 3, 'w0') + C(21, 43, 3, 'w0') + C(42, 20, 8) + P('M30 24L35 22', '') + badgeCheck(48, 46, 8),
    s_docs: doc(10, 6, 32, 44) + C(46, 46, 10, 'a') + P('M46 52V40M41 45L46 40L51 45', 'ck'),
    s_photo: P('M20 20L25 12H39L44 20') + R(8, 20, 48, 34, 5) + C(32, 37, 11) + C(32, 37, 6, 'a') + R(46, 25, 5, 3, 1, 'a'),

    /* parque */
    admin:
      ground() + R(14, 20, 36, 36, 2) + P('M32 20V8') + P('M32 8H43L40 11.5L43 15H32', 'a') +
      R(19, 26, 6, 5, 1, 'g') + R(29, 26, 6, 5, 1, 'g') + R(39, 26, 6, 5, 1, 'g') +
      R(19, 35, 6, 5, 1, 'g') + R(39, 35, 6, 5, 1, 'g') + R(27, 42, 10, 14, 1, 'a'),
    company_in:
      R(5, 8, 54, 50, 4, 'g dash') + R(10, 36, 12, 16, 1.5) + R(42, 36, 12, 16, 1.5) + R(26, 30, 12, 22, 1.5, 'a') +
      pin(32, 19, 0.9),
    crane:
      ground() + P('M16 56V10M10 12H56M16 6L52 12M16 6V10') + P('M46 12V28', 'as') + R(41, 28, 10, 7, 1, 'a') +
      R(28, 40, 26, 16, 1, 'g dash') + R(13, 14, 6, 6, 1, 'a'),
    each_company:
      ground() + R(6, 32, 14, 24, 1.5) + R(25, 26, 14, 30, 1.5) + R(44, 32, 14, 24, 1.5) +
      badgeCheck(13, 22, 5) + badgeCheck(32, 16, 5) + badgeCheck(51, 22, 5),
    central:
      P('M32 32L12 12M32 32L52 12M32 32L12 52M32 32L52 52', 'g') +
      C(12, 12, 5) + C(52, 12, 5) + C(12, 52, 5) + C(52, 52, 5) + R(22, 22, 20, 20, 3, 'a'),
    informal:
      `<g transform="rotate(-12 18 30)">${R(8, 18, 18, 22, 1.5, 'g')}</g>` +
      `<g transform="rotate(14 46 34)">${R(36, 22, 18, 22, 1.5, 'g')}</g>` +
      P('M25 24Q25 16 32 16Q39 16 39 23Q39 28 32 30V36', 'as thick') + C(32, 44, 2.2, 'a'),
    queue:
      ground() + car(2, 54, 16, 'g') + car(20, 54, 16, 'g') + car(38, 54, 16) +
      post(58, 56, 22) + C(58, 22, 4, 'a'),
    clock:
      C(26, 28, 18) + P('M26 16V28L34 33', 'as') +
      R(44, 44, 4, 12, 1) + R(50, 34, 4, 22, 1, 'a') + R(56, 42, 4, 14, 1),
    flow:
      ground() + `<g class="flowl">${P('M6 24H40M6 34H46M6 44H38', 'g dash')}</g>` +
      P('M40 24L44 24M46 34', '') + post(54, 56, 18) + P('M54 42V12', 'as') + P('M42 30L48 34L42 38', 'as'),

    /* planta */
    people_visit: ground() + `<g class="solid">${person(22, 22)}</g>` + person(44, 26) + R(39, 38, 10, 7, 1.5, 'a'),
    people_mix:
      ground() + person(12, 30) + person(32, 30) + P('M25 33Q25 27 32 27Q39 27 39 33Z', 'a') +
      `<g transform="translate(44 34) scale(1.1)">${TINY.car}</g>`,
    truck:
      ground() + R(4, 22, 34, 24, 2, 'a') + P('M40 46V28H51L58 36V46Z') + P('M43 31H50L54 36H43Z', 'g') +
      C(13, 48, 4, 'w') + C(27, 48, 4, 'w') + C(50, 48, 4, 'w'),
    lock: P('M23 30V22Q23 13 32 13Q41 13 41 22V30') + R(18, 30, 28, 24, 4, 'a') + C(32, 40, 2.6, 'w0') + P('M32 43V48', 'ck'),
    lock_open: P('M23 30V18Q23 9 32 9Q41 9 41 18V21') + R(18, 30, 28, 24, 4) + C(32, 40, 2.6, 'a') + P('M32 43V48', 'as'),
    door_free: R(14, 8, 30, 48, 2) + P('M14 8L30 14V60L14 56Z', 'a') + P('M36 32H58', 'g dash') + P('M52 26L58 32L52 38', 'as'),
    doc_paper: doc(10, 8, 32, 44) + P('M44 50L54 24L58 26L48 52Z', 'a') + P('M44 50L43 55L48 52', 'as'),
    doc_msg: doc(8, 16, 28, 38) + P('M34 8H58V30H46L40 36V30H34Z', 'a') + C(41, 19, 1.4, 'w0') + C(46, 19, 1.4, 'w0') + C(51, 19, 1.4, 'w0'),
    doc_none: doc(8, 8, 32, 44, 'g') + ban(44, 42, 11),
    truck_scale:
      truck(8, 46) + R(4, 46, 44, 5, 1, 'a') + P('M55 51V30') + R(48, 16, 14, 13, 2) + P('M51 22.5H59', 'as'),
    calendar:
      R(10, 14, 44, 40, 4) + R(10, 14, 44, 10, 4, 'a') + P('M22 9V18M42 9V18') +
      C(19, 33, 1.5, 'g0') + C(27, 33, 1.5, 'g0') + C(35, 33, 1.5, 'g0') + C(43, 33, 1.5, 'g0') +
      C(19, 43, 1.5, 'g0') + C(27, 43, 1.5, 'g0') + R(39, 39, 8, 8, 1.5, 'a'),
    truck_none: `<g class="g">${truck(6, 52)}</g>` + ground() + ban(46, 22, 11),
    stop: P('M32 48V58') + P('M24 6H40L52 18V34L40 46H24L12 34V18Z', 'a') + P('M21 26H43', 'ck thick'),
    late:
      ground() + post(10) + P('M10 42V14', 'as') + person(30, 34) +
      P('M47 8L59 30H35Z', 'a') + P('M47 15V22', 'ck') + C(47, 26, 1.2, 'w0'),
    shield: P('M32 6L52 14V30Q52 46 32 56Q12 46 12 30V14Z', 'a') + P('M23 31L29 37L42 24', 'ck thick'),

    /* concesionaria */
    lot_closed:
      P('M28 54H8V10H56V54H36', '') + P('M28 54H36', 'as arm2') + R(16, 18, 20, 14, 1.5, 'a') +
      R(16, 38, 8, 5, 1, 'g') + R(28, 38, 8, 5, 1, 'g') + R(42, 18, 8, 5, 1, 'g'),
    lot_street:
      R(12, 12, 40, 26, 2, 'a') + R(26, 26, 12, 12, 1, 'w0') +
      P('M4 46H60M4 60H60', '') + P('M4 53H60', 'g dash'),
    lot_mixed:
      R(6, 14, 24, 24, 2, 'a') + R(36, 10, 22, 30, 2, 'dash') + R(40, 15, 6, 4, 1, 'g') + R(48, 15, 6, 4, 1, 'g') + R(40, 24, 6, 4, 1, 'g') +
      P('M4 46H60M4 60H60', '') + P('M4 53H60', 'g dash'),
    pin_1: P('M6 44L22 36L42 44L58 36', 'g') + P('M6 54L22 46L42 54L58 46', 'g') + pin(32, 26, 1.7),
    pin_3: P('M6 44L22 36L42 44L58 36', 'g') + P('M6 54L22 46L42 54L58 46', 'g') + pin(16, 28, 1.05) + pin(32, 18, 1.2) + pin(48, 30, 1.05),
    pin_6:
      P('M6 50L22 42L42 50L58 42', 'g') +
      pin(12, 22, 0.75) + pin(26, 14, 0.75) + pin(40, 22, 0.75) + pin(54, 14, 0.75) + pin(20, 36, 0.75) + pin(46, 36, 0.75),
    seller: ground() + person(22, 22) + R(34, 28, 18, 24, 2, 'a') + P('M38 35H48M38 40H46M38 45H48', 'ck'),
    crm_cloud:
      P('M18 46Q8 46 8 37Q8 28 18 28Q20 17 31 17Q43 17 46 28Q56 28 56 37Q56 46 46 46Z', 'a') +
      C(32, 30, 4, 'w0') + P('M25 42Q25 36 32 36Q39 36 39 42', 'ck'),
    crm: R(8, 12, 38, 28, 3, 'g') + R(16, 22, 40, 28, 3, 'a') + C(28, 33, 4, 'w0') + P('M21 45Q21 39 28 39Q35 39 35 45M40 31H50M40 37H48', 'ck'),
    crm_none: `<g class="g">${R(8, 12, 38, 28, 3)}${R(16, 22, 40, 28, 3)}</g>` + ban(46, 44, 11),
    unknown: C(32, 32, 22, 'g dash') + P('M24 25Q24 15 32 15Q40 15 40 23Q40 29 32 31V37', 'as thick') + C(32, 46, 2.6, 'a'),
    car: ground() + car(6, 52, 52),
    walker:
      ground() + C(33, 12, 5, 'a') +
      P('M33 20L30 35L22 54M30 35L41 44L40 54M31 24L21 31M31 24L43 30', 'as thick'),
    both_same:
      P('M4 12H60', 'as thick') + R(4, 12, 4, 44, 1, 'a') + R(56, 12, 4, 44, 1, 'a') + ground() +
      car(11, 54, 28) + person(47, 34),
    both_sep:
      P('M32 12V56', 'g dash') + P('M4 14H30M34 14H60', 'as thick') + ground() +
      car(5, 54, 24) + person(47, 34),
    barrier_auto:
      ground() + R(6, 32, 14, 24, 2, 'a') + arm(13, 37, 44) + P('M15 14L10 22H16L12 29', 'as') +
      P('M24 22Q27 25 24 28M28 19Q33 25 28 31', 'g'),
    barrier_manual:
      ground() + P('M8 56V20H56V56') + P('M18 20V56M28 20V56M38 20V56M48 20V56', 'g') +
      R(27, 33, 10, 9, 1.5, 'a') + P('M29 33V30Q29 27 32 27Q35 27 35 30V33', 'as'),

    /* tramo común */
    gestion:
      R(6, 10, 52, 40, 3) + R(11, 15, 20, 14, 2, 'a') + R(35, 15, 18, 6, 1.5) + R(35, 23, 18, 6, 1.5) +
      P('M11 42L19 36L27 40L37 32L53 38', 'as') + P('M26 56H38M32 50V56'),
    compare:
      P('M32 10V54M12 18H52M22 54H42') + C(32, 10, 2.4, 'a') +
      P('M12 18L6 34M12 18L18 34M52 18L46 34M52 18L58 34', 'g') +
      P('M5 34H19Q19 41 12 41Q5 41 5 34Z', 'a') + P('M45 34H59Q59 41 52 41Q45 41 45 34Z'),
    fast: P('M8 16L26 32L8 48Z', 'a') + P('M28 16L46 32L28 48Z', 'a') + P('M52 16V48', 'as thick'),
    swap:
      R(6, 14, 14, 14, 2, 'a') + R(44, 36, 14, 14, 2) +
      P('M24 21H52M45 14L52 21L45 28', 'as') + P('M40 43H12M19 36L12 43L19 50', 'as'),
  };

  function icon(key) {
    const body = I[key] || I.otra;
    return `<svg class="ic" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
  }

  window.SILA_ICONS = { icon, keys: Object.keys(I) };
})();
