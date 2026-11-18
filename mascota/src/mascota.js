/* SILA · mascota 3D con vida propia para el flujo comercial.
 * Se compila con `mascota/build.sh` a js/mascota.js (IIFE, sin dependencias externas).
 * API: window.SilaMascota.emit(evento, datos)  — eventos: inicio, pregunta, elige, escribe, volver, fin, foco
 * Si WebGL falla o no hay modelo, se retira sola y la página sigue igual.
 */
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const wander = (t, s) => Math.sin(t * 0.61 + s) * 0.5 + Math.sin(t * 1.37 + s * 2.1) * 0.3 + Math.sin(t * 0.23 + s * 3.7) * 0.2;

// Resorte de 2º orden: ζ<1 rebote cartoon, ζ≈1 suave
class Spring {
  constructor(f = 2, z = 0.6) { this.f = f; this.z = z; this.x = 0; this.v = 0; }
  step(target, dt) {
    const w = 2 * Math.PI * this.f, h = dt / 4;
    for (let i = 0; i < 4; i++) { const a = w * w * (target - this.x) - 2 * this.z * w * this.v; this.v += a * h; this.x += this.v * h; }
    return this.x;
  }
  kick(v) { this.v += v; }
}

const IDLE = ['idle', 'reposo', 'escucha'];

class Mascota {
  constructor(host, opts) {
    this.host = host; this.opts = opts; this.t = 0;
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(this.canvas);
    this.renderer = new THREE.WebGLRenderer({canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'low-power'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4b66, 2.6));
    const key = new THREE.DirectionalLight(0xffffff, 3.6); key.position.set(3, 5, 6); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x5aa2ff, 3); rim.position.set(-5, 3, -4); this.scene.add(rim);
    this.clock = new THREE.Clock();
    // capa de vida
    this.yaw = new Spring(1.6, 0.6); this.pitch = new Spring(1.6, 0.6);
    this.vyaw = new Spring(2.4, 0.5); this.vpitch = new Spring(2.4, 0.5);
    this.ex = new Spring(7, 0.9); this.ey = new Spring(7, 0.9);
    this.squash = new Spring(3.2, 0.25); this.hop = new Spring(2.6, 0.3); this.joy = new Spring(5, 0.8); this.pop = new Spring(4, 0.5);
    this.handLag = new Spring(2.2, 0.9);
    this.pointer = null; this.lastMove = -99; this.focusEl = null; this.blinkT = -1; this.lastBlink = 0;
    this.prevGaze = new THREE.Vector2(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler();
    this.visible = true; this.gestureEnd = 0; this.queue = null;
    this.onMove = (e) => { this.pointer = {x: e.clientX, y: e.clientY}; this.lastMove = this.t; };
    addEventListener('pointermove', this.onMove, {passive: true});
    this.canvas.addEventListener('click', () => this.poke());
    this.io = new IntersectionObserver(([en]) => { this.visible = en.isIntersecting; }, {threshold: 0});
    this.io.observe(host);
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host);
  }

  async load(url) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url);
    this.root = gltf.scene;
    this.root.traverse((o) => { if (/^Icosphere/.test(o.name)) o.visible = false; if (o.isMesh) o.frustumCulled = false; });
    this.scene.add(this.root);
    const g = (n) => this.root.getObjectByName(n);
    this.b = {root: g('AZUL_RIG'), body: g('Cuerpo'), visor: g('Visor'), eyeR: g('Ojo_der'), eyeL: g('Ojo_izq'), handR: g('Mano_der'), handL: g('Mano_izq')};
    this.clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
    this.mixer = new THREE.AnimationMixer(this.root);
    this.mixer.addEventListener('loop', (e) => { if (e.action === this.action && this.isIdle) this.nextIdle(); });
    this.frame();
    this.play('idle');
    this.resize();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  // encuadre: cuerpo + manos en reposo (con margen para gestos amplios)
  frame() {
    this.mixer.update(0);
    const box = new THREE.Box3().setFromObject(this.root);
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    this.center = c; this.size = s;
  }
  resize() {
    if (!this.center) return;
    const {width, height} = this.host.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const needW = this.size.x * 1.18 / this.camera.aspect, needH = this.size.y * 1.3;
    const dist = Math.max(needW, needH) / 2 / Math.tan(fov / 2);
    this.camera.position.set(this.center.x, this.center.y + this.size.y * 0.04, this.center.z + dist);
    this.camera.lookAt(this.center.x, this.center.y, this.center.z);
    this.camera.near = dist / 20; this.camera.far = dist * 4;
    this.camera.updateProjectionMatrix();
  }

  play(name, {rate = 1, max = 0, fade = 0.45} = {}) {
    const clip = this.clips?.[name];
    if (!clip) return;
    const next = this.mixer.clipAction(clip), old = this.action;
    next.reset().setLoop(THREE.LoopRepeat, Infinity);
    next.enabled = true; next.setEffectiveTimeScale(rate); next.setEffectiveWeight(1).play();
    if (old && old !== next) { old.fadeOut(fade); next.fadeIn(fade); }
    this.action = next; this.current = name;
    this.isIdle = IDLE.includes(name);
    this.gestureEnd = this.isIdle ? 0 : this.t + (max || clip.duration / rate);
    if (!this.isIdle) this.pop.kick(5);
  }
  nextIdle() {
    const pool = IDLE.filter((n) => n !== this.current && this.clips[n]);
    this.play(pool[Math.floor(Math.random() * pool.length)] || 'idle', {fade: 0.8});
  }
  gesture(name, opts = {}) {
    if (this.opts.reduced) return;
    this.play(name, opts);
  }

  poke() {
    this.squash.kick(-9); this.hop.kick(6); this.joy.kick(60);
    this.gesture('saludo', {rate: 1.6, max: 3});
  }

  // mirada: cursor si se mueve; si no, el elemento en foco (la pregunta / el campo)
  gaze() {
    const r = this.host.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height * 0.42;
    let px, py;
    if (this.pointer && this.t - this.lastMove < 3) { px = this.pointer.x; py = this.pointer.y; }
    else if (this.focusEl && this.focusEl.isConnected) {
      const f = this.focusEl.getBoundingClientRect();
      px = f.left + Math.min(f.width, 420) * 0.45 + wander(this.t * 0.5, 2) * 40; py = f.top + Math.min(f.height, 120) / 2 + wander(this.t * 0.4, 7) * 18;
    } else { px = cx + wander(this.t * 0.6, 1) * 160; py = cy + wander(this.t * 0.5, 4) * 60 + 80; }   // al frente (al usuario)
    const yaw = clamp(Math.atan2(px - cx, 520), -0.9, 0.9), pitch = clamp(Math.atan2(cy - py, 520), -0.6, 0.6);
    return [yaw, pitch];
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (!this.visible || document.hidden || this.opts.paused?.()) return;
    this.t += dt;
    if (this.gestureEnd && this.t > this.gestureEnd) { this.gestureEnd = 0; this.nextIdle(); }
    this.mixer.update(this.opts.reduced ? 0 : dt);
    if (!this.opts.reduced) this.life(dt);
    this.renderer.render(this.scene, this.camera);
  }

  life(dt) {
    const {root, body, visor, eyeR, eyeL, handR, handL} = this.b, t = this.t;
    const [yaw, pitch] = this.gaze();
    // ojos primero, después visor, al final el cuerpo
    const ex = this.ex.step(clamp(yaw * 0.09, -0.06, 0.06), dt), ey = this.ey.step(clamp(pitch * 0.08, -0.04, 0.04), dt);
    const by = this.yaw.step(yaw * 0.3, dt), bp = this.pitch.step(-pitch * 0.2, dt);
    const vy = this.vyaw.step(yaw * 0.14, dt), vp = this.vpitch.step(-pitch * 0.12, dt);
    body.quaternion.multiply(this.q.setFromEuler(this.e.set(bp, by, -by * 0.15)));
    visor.quaternion.multiply(this.q.setFromEuler(this.e.set(vp, vy, 0)));
    for (const eye of [eyeR, eyeL]) { eye.position.x += ex; eye.position.y += ey; }
    // parpadeo en cambios grandes de mirada
    const g = new THREE.Vector2(yaw, pitch);
    if (g.distanceTo(this.prevGaze) > 0.3) { if (t - this.lastBlink > 1.2 && this.blinkT < 0) { this.blinkT = 0; this.lastBlink = t; } this.prevGaze.copy(g); }
    let blink = 1;
    if (this.blinkT >= 0) {
      this.blinkT += dt; const k = this.blinkT;
      blink = k < 0.07 ? 1 - k / 0.07 * 0.92 : k < 0.1 ? 0.08 : k < 0.24 ? 0.08 + (k - 0.1) / 0.14 * 0.92 : 1;
      if (k >= 0.24) this.blinkT = -1;
    }
    const joy = clamp(this.joy.step(0, dt), 0, 1), pop = this.pop.step(0, dt);
    for (const eye of [eyeR, eyeL]) { eye.scale.y *= blink * (1 - joy * 0.7) * (1 + pop); eye.scale.x *= (1 + (1 - blink) * 0.12) * (1 + pop); }
    // flotar; las manos llegan apenas después
    const bob = Math.sin(t * 1.25) * 0.1 + wander(t, 9) * 0.04, hop = this.hop.step(0, dt);
    root.position.y += bob + hop;
    const lag = this.handLag.step(bob + hop, dt);
    for (const h of [handR, handL]) h.position.y += (lag - (bob + hop)) * 0.5;
    const s = clamp(this.squash.step(0, dt), -0.35, 0.35) * 0.4;
    body.scale.y *= 1 + s; body.scale.x /= Math.sqrt(1 + s); body.scale.z /= Math.sqrt(1 + s);
  }
}

// ───────── puente con el flujo ─────────
let m = null, pending = [], idleTimer = 0, lastPoint = 0;
const movil = () => matchMedia('(max-width: 860px)').matches;
function onEvent(ev, d = {}) {
  if (!m?.clips) { pending.push([ev, d]); return; }
  clearTimeout(idleTimer);
  switch (ev) {
    case 'inicio': m.gesture('hola', {rate: 1.7, max: 4.2}); break;
    case 'pregunta': {
      m.focusEl = d.el || null;
      const words = (d.text || '').split(/\s+/).filter(Boolean).length;
      if (!d.first) {
        const talk = () => m.gesture('habla', {max: clamp(words * 0.32, 1.4, 3.6)});
        // si viene de asentir, termina el gesto y recién ahí "dice" la pregunta
        if (m.current === 'asiente' && m.gestureEnd) setTimeout(talk, Math.max(0, (m.gestureEnd - m.t - 0.35) * 1000));
        else talk();
      }
      // si se queda quieto en la pregunta, SILA la señala (como mucho cada 40 s)
      idleTimer = setTimeout(() => {
        if (m.t - lastPoint < 40) return;
        lastPoint = m.t; m.gesture(movil() ? 'senala_a' : 'senala_b', {max: 3.4});
      }, 22000);
      break;
    }
    case 'elige': m.gesture('asiente', {rate: 1.25, max: 1.6}); break;
    case 'escribe': if (m.isIdle) m.gesture('escribe', {max: 2.5}); m.focusEl = d.el || m.focusEl; break;
    case 'volver': m.gesture('piensa', {max: 2.8}); break;
    case 'fin': m.focusEl = d.el || null; m.gesture('celebra', {max: 5}); m.joy.kick(40); m.hop.kick(5); break;
    case 'foco': m.focusEl = d.el || null; break;
  }
}

// ───────── botón de ayuda a residentes: SILA en la esquina, con su globo ─────────
// Saluda cada tanto, se alegra al pasar el mouse y deja de dibujar mientras el chat está abierto.
function botonVida(b, host) {
  const btn = host.closest('button, a') || host;
  const panelOpen = () => !!host.closest('.open');
  const extras = ['saludo', 'presenta', 'explica'];
  const next = () => setTimeout(() => {
    if (!panelOpen() && !document.hidden && b.isIdle) {
      const g = extras[Math.floor(Math.random() * extras.length)];
      b.gesture(g, {rate: g === 'saludo' ? 1.6 : 1.2, max: 2.8});
    }
    next();
  }, 12000 + Math.random() * 10000);
  setTimeout(() => b.gesture('hola', {rate: 1.8, max: 3}), 600);   // llega saludando
  next();
  btn.addEventListener('pointerenter', () => { b.pop.kick(6); b.hop.kick(3); if (b.isIdle) b.gesture('saludo', {rate: 1.8, max: 2}); });
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
async function mountOne(host) {
  if (host.__silaMascota) return;
  const modo = host.dataset.silaMascota || 'flujo';
  const inst = new Mascota(host, {reduced: reducedMotion(), paused: () => !!host.closest('.open')});
  host.__silaMascota = inst;
  try {
    await inst.load(host.dataset.src);
    host.classList.add('mascota-lista');
    requestAnimationFrame(() => inst.resize());
    if (modo === 'boton') { botonVida(inst, host); return; }
    m = inst;
    document.body.classList.add('mascota-on');
    const q = pending; pending = [];
    // de lo que pasó mientras cargaba, alcanza con el último foco y un saludo
    const last = [...q].reverse().find(([e]) => e === 'pregunta');
    if (last) onEvent('pregunta', {...last[1], first: true});
    if (q.some(([e]) => e === 'inicio')) onEvent('inicio');
    if (q.some(([e]) => e === 'fin')) onEvent('fin', q.find(([e]) => e === 'fin')[1]);
  } catch (e) {
    console.warn('SILA mascota desactivada:', e.message);
    inst.canvas.remove();
    host.classList.add('mascota-error');
    if (modo === 'flujo') host.remove();
  }
}
// cualquier elemento con data-sila-mascota="flujo|boton" y data-src="…glb"
function mountAll() { document.querySelectorAll('[data-sila-mascota]').forEach(mountOne); }

window.SilaMascota = {emit: onEvent, mount: mountAll, get ready() { return !!m?.clips; }};
const q0 = window.__silaMascotaQ || []; q0.forEach(([e, d]) => onEvent(e, d));
mountAll();
