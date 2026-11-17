/* SILA — almacén de leads de la DEMO (localStorage del navegador, en vivo entre pestañas).
 * Simula el destino real (CRM / planilla). En producción se reemplaza por HubSpot o Google Sheet.
 */
(function () {
  const KEY = 'sila_demo_leads_v1';
  const ch = 'BroadcastChannel' in window ? new BroadcastChannel('sila-demo') : null;
  const ESTADOS = ['nuevo', 'contactado', 'propuesta', 'ganado'];

  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; } };
  const write = (l) => { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch (_) { /* bloqueado */ } };
  const ping = (type, id) => { ch && ch.postMessage({ type, id }); };
  const now = () => new Date().toISOString();

  function add(p) {
    const l = read().filter((x) => x.id !== p.id);
    l.unshift({
      ...p,
      estado: 'nuevo',
      eventos: [
        { t: p.fecha || now(), txt: 'Completó SILA' + (p.origen && p.origen.segundos ? ` en ${p.origen.segundos} s` : '') },
        { t: p.fecha || now(), txt: `Cargado en CRM como ${String(p.temperatura).toUpperCase()}` },
        { t: p.fecha || now(), txt: 'Mail de aviso al equipo comercial' },
      ],
    });
    write(l.slice(0, 200));
    ping('add', p.id);
  }
  function update(id, fn) {
    const l = read();
    const x = l.find((y) => y.id === id);
    if (!x) return;
    fn(x);
    write(l);
    ping('update', id);
  }
  function setEstado(id, estado) {
    update(id, (x) => { x.estado = estado; x.eventos.push({ t: now(), txt: `Movido a ${estado.toUpperCase()}` }); });
  }
  function log(id, txt) { update(id, (x) => x.eventos.push({ t: now(), txt })); }
  function clear() { write([]); ping('clear'); }
  function onChange(cb) {
    ch && ch.addEventListener('message', (e) => cb(e.data));
    addEventListener('storage', (e) => { if (e.key === KEY) cb({ type: 'storage' }); });
  }

  /* ── ejemplos ficticios ── */
  function seed() {
    const h = (n) => new Date(Date.now() - n * 3600e3).toISOString();
    const mk = (o) => {
      const respuestas = o.qa.map(([pregunta, respuesta]) => ({ pregunta, respuesta }));
      return {
        id: o.id, fecha: h(o.hace), vertical: o.vertical, cuenta: o.cuenta,
        nombre: o.nombre, apellido: o.apellido, rol: o.rol, localidad: o.localidad,
        email: o.email || '', telefono: o.telefono || '',
        necesidad: o.necesidad, etapa: o.etapa, temperatura: o.temp, score: o.score,
        resumen: respuestas.map((r) => `${r.pregunta} → ${r.respuesta}`).join('\n'), respuestas,
        origen: { utm_source: 'web', utm_medium: o.medio, segundos: o.seg, embed: false },
        ejemplo: true, estado: o.estado,
        eventos: [
          { t: h(o.hace), txt: `Completó SILA en ${o.seg} s` },
          { t: h(o.hace), txt: `Cargado en CRM como ${o.temp.toUpperCase()}` },
          { t: h(o.hace), txt: 'Mail de aviso al equipo comercial' },
          ...(o.estado !== 'nuevo' ? [{ t: h(o.hace - 2), txt: `Movido a ${o.estado.toUpperCase()}` }] : []),
        ],
      };
    };
    const ej = [
      mk({ id: 'SA-EJ01', hace: 3, vertical: 'Barrios cerrados / Consorcios', cuenta: 'Barrio Los Robles (ejemplo)', nombre: 'Laura', apellido: 'Gómez', rol: 'Administradora', localidad: 'Pilar', email: 'laura@ejemplo.com', necesidad: 'Ambos', etapa: 'Quiero avanzar pronto', temp: 'caliente', score: 6, seg: 74, medio: 'solicita_una_demo', estado: 'nuevo',
        qa: [['¿Cuántas unidades funcionales (lotes) tiene la urbanización?', 'Más de 600'], ['¿Cuántas entradas o accesos tiene el barrio?', 'Accesos separados para residentes y proveedores'], ['¿Tienen hoy algún sistema de control de acceso?', 'No, el registro es manual en la garita'], ['¿Qué soluciones te interesan para el barrio?', 'Soluciones de control de acceso | App para residentes | Gestión de la comunidad']] }),
      mk({ id: 'SA-EJ02', hace: 9, vertical: 'Parques industriales', cuenta: 'Parque Industrial Norte · Logitrans SA (ejemplo)', nombre: 'Diego', apellido: 'Herrera', rol: 'Jefe de seguridad', localidad: 'Escobar', telefono: '+54 9 11 5555-0101', necesidad: 'Acceso vehicular', etapa: 'Comparando opciones', temp: 'tibio', score: 4, seg: 96, medio: 'boton_flotante', estado: 'contactado',
        qa: [['¿Cuántas empresas operan dentro del parque?', 'Entre 30 y 60'], ['¿Desde dónde nos consultás?', 'Una empresa que opera adentro'], ['¿Se generan demoras o colas en el ingreso al parque?', 'Sí, es un problema frecuente'], ['¿Qué soluciones te interesan para el parque?', 'LPR con validación de egreso | Acceso web propio para cada empresa']] }),
      mk({ id: 'SA-EJ03', hace: 26, vertical: 'Industrias', cuenta: 'Planta Campana (ejemplo)', nombre: 'Sofía', apellido: 'Méndez', rol: 'Gerente de planta', localidad: 'Campana', email: 'sofia@ejemplo.com', necesidad: 'Gestión integral de la planta', etapa: 'Cambiar sistema actual', temp: 'caliente', score: 6, seg: 88, medio: 'contactanos', estado: 'propuesta',
        qa: [['¿Cuántas personas ingresan por día a la planta?', 'Entre 500 y 1.000'], ['¿Cómo validan hoy la documentación de contratistas?', 'En la puerta, en papel'], ['Si un contratista llega con el seguro vencido, ¿qué pasa hoy?', 'Nos enteramos en la puerta y frena la operación'], ['¿Qué soluciones te interesan para la planta?', 'Gestión de obras y contratistas | Balanza de pesaje integrada | Reportes exportables']] }),
      mk({ id: 'SA-EJ04', hace: 50, vertical: 'Concesionarios de autos', cuenta: 'Autos del Oeste — Peugeot (ejemplo)', nombre: 'Martín', apellido: 'Ruiz', rol: 'Gerente comercial', localidad: 'Morón', telefono: '+54 9 11 5555-0202', necesidad: 'Gestión comercial', etapa: 'Comparando opciones', temp: 'frío', score: 2, seg: 121, medio: 'solicita_una_demo', estado: 'nuevo',
        qa: [['¿Cuántos vehículos o personas circulan por día?', 'Entre 50 y 200'], ['Cuando llega un cliente sin cita, ¿cómo queda registrado?', 'Lo carga un vendedor si puede'], ['¿Usan CRM para gestionar leads y clientes?', 'Sí, otro CRM'], ['¿Qué soluciones te interesan para la concesionaria?', 'Registro de clientes y visitas | Integración con CRM']] }),
      mk({ id: 'SA-EJ05', hace: 75, vertical: 'Barrios cerrados / Consorcios', cuenta: 'Country San Jorge (ejemplo)', nombre: 'Pablo', apellido: 'Díaz', rol: 'Intendente', localidad: 'Canning', email: 'pablo@ejemplo.com', necesidad: 'Acceso peatonal', etapa: 'Comparando opciones', temp: 'tibio', score: 3, seg: 67, medio: 'solicita_una_demo', estado: 'ganado',
        qa: [['¿Cuántas unidades funcionales (lotes) tiene la urbanización?', 'Entre 100 y 300'], ['¿Tienen hoy algún sistema de control de acceso?', 'Sí, contamos con un sistema'], ['¿Cuál usan hoy?', 'Planilla + app propia'], ['¿Qué soluciones te interesan para el barrio?', 'App para residentes']] }),
    ];
    const l = read().filter((x) => !x.ejemplo).concat(ej);
    write(l);
    ping('seed');
  }

  window.SILA_STORE = { read, add, update, setEstado, log, clear, seed, onChange, ESTADOS };
})();
