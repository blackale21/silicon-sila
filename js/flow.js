/* SILA — flujo comercial (fuente: Flujograma nuevo Silicon v2 + «Cambios bot nuevo», nov 2026)
 * Tipos de nodo: single | multi | text | contact
 * next: string o función(state) -> id. pass: rótulo en "Tu pase".
 */
(function () {
  const OTRA = { id: 'otra', label: 'Otra — contanos cuál', icon: 'otra', other: true };

  const N = {
    N0: {
      kind: 'text', cp: 'Nombre', pass: 'Contacto', field: 'nombre',
      q: '¿Cuál es tu nombre y apellido?',
      placeholder: 'Nombre y apellido', autocomplete: 'name',
      next: 'N1',
    },
    N1: {
      kind: 'single', cp: 'Destino', pass: 'Vertical',
      q: (s) => `Un gusto${firstName(s.N0) ? ', ' + firstName(s.N0) : ''}. ¿Dónde querés implementar tu sistema de control de acceso?`,
      big: true,
      options: [
        { id: 'urb', label: 'Barrios cerrados / Consorcios', icon: 'v_urb' },
        { id: 'parque', label: 'Parques industriales', icon: 'v_parque' },
        { id: 'planta', label: 'Industrias', icon: 'v_planta' },
        { id: 'conce', label: 'Concesionarios de autos', icon: 'v_conce' },
        { id: 'edif', label: 'Edificios corporativos', icon: 'v_edif' },
      ],
      next: 'N1E',
    },
    N1E: {
      kind: 'single', cp: 'Etapa', pass: 'Etapa',
      q: '¿En qué etapa está tu proyecto?',
      options: [
        { id: 'comparando', label: 'Comparando opciones', icon: 'compare' },
        { id: 'pronto', label: 'Quiero avanzar pronto', icon: 'fast' },
        { id: 'cambiar', label: 'Cambiar sistema actual', icon: 'swap' },
      ],
      next: (s) => ({ urb: 'N2A', parque: 'N2B', planta: 'N2D', conce: 'N2C', edif: 'N2F' })[s.N1],
    },

    /* ───────── N2A · Urbanización ───────── */
    N2A: {
      kind: 'single', cp: 'Escala', pass: 'Lotes',
      q: '¿Cuántas unidades funcionales (lotes) tiene el barrio / consorcio?',
      options: [
        { id: 'lt100', label: 'Menos de 100', icon: 'm_house_2' },
        { id: '100_300', label: 'Entre 100 y 300', icon: 'm_house_5' },
        { id: '300_600', label: 'Entre 300 y 600', icon: 'm_house_9' },
        { id: 'gt600', label: 'Más de 600', icon: 'm_house_16' },
      ],
      next: 'N2A-1',
    },
    'N2A-1': {
      kind: 'single', cp: 'Accesos', pass: 'Accesos',
      q: '¿Cuántas entradas o accesos tiene el barrio?',
      options: [
        { id: 'unico', label: 'Un acceso único', icon: 'gate_1' },
        { id: 'dos', label: 'Dos o más accesos', icon: 'gate_2' },
        { id: 'sep', label: 'Accesos separados para residentes y proveedores', icon: 'gate_split' },
      ],
      next: 'N2A-2',
    },
    'N2A-2': {
      kind: 'single', cp: 'Hoy', pass: 'Control actual',
      q: '¿Tienen hoy algún sistema de control de acceso?',
      options: [
        { id: 'si', label: 'Sí, contamos con un sistema', icon: 'sys_ok' },
        { id: 'manual', label: 'No, el registro es manual en la garita', icon: 'clipboard' },
        { id: 'nada', label: 'No, no hay control de acceso', icon: 'gate_open' },
      ],
      next: (s) => (s['N2A-2'] === 'si' ? 'N2A-3' : 'N2A-4'),
    },
    'N2A-3': {
      kind: 'text', cp: 'Sistema', pass: 'Sistema actual',
      q: '¿Cuál usan hoy?',
      placeholder: 'Nombre del sistema o cómo funciona',
      skip: 'No sé el nombre',
      next: 'N2A-4',
    },
    'N2A-4': {
      kind: 'multi', cp: 'Soluciones', pass: 'Soluciones',
      q: '¿Qué soluciones te interesan para el barrio?',
      sub: 'Podés marcar varias.',
      options: [
        { id: 'acceso', label: 'Soluciones de control de acceso', icon: 's_barrier' },
        { id: 'app', label: 'App para residentes', icon: 's_app' },
        OTRA,
      ],
      next: 'N2A-5',
    },
    'N2A-5': {
      kind: 'text', cp: 'Cuenta', pass: 'Barrio', account: true,
      q: 'Para terminar, ¿cómo se llama el barrio o el consorcio?',
      placeholder: 'Ej.: Barrio Los Álamos',
      next: 'N6',
    },

    /* ───────── N2B · Parque industrial ───────── */
    N2B: {
      kind: 'single', cp: 'Escala', pass: 'Empresas',
      q: '¿Cuántas empresas operan dentro del parque?',
      options: [
        { id: 'lt10', label: 'Menos de 10', icon: 'm_ware_2' },
        { id: '10_30', label: 'Entre 10 y 30', icon: 'm_ware_5' },
        { id: '30_60', label: 'Entre 30 y 60', icon: 'm_ware_9' },
        { id: 'gt60', label: 'Más de 60', icon: 'm_ware_16' },
      ],
      next: 'N2B-1',
    },
    'N2B-1': {
      kind: 'single', cp: 'Origen', pass: 'Consulta desde',
      q: '¿Desde dónde nos consultás?',
      options: [
        { id: 'admin', label: 'La administración del parque', icon: 'admin' },
        { id: 'empresa', label: 'Una empresa que opera adentro', icon: 'company_in' },
        { id: 'dev', label: 'Un desarrollador del predio', icon: 'crane' },
      ],
      next: 'N2B-2',
    },
    'N2B-2': {
      kind: 'single', cp: 'Accesos', pass: 'Accesos',
      q: '¿Cuántos accesos tiene el predio?',
      options: [
        { id: 'unico', label: 'Un acceso único', icon: 'gate_1' },
        { id: 'dos', label: 'Dos o más accesos', icon: 'gate_2' },
        { id: 'sep', label: 'Accesos separados para camiones y livianos', icon: 'gate_truckcar' },
      ],
      next: 'N2B-3',
    },
    'N2B-3': {
      kind: 'single', cp: 'Hoy', pass: 'Control actual',
      q: '¿Cómo se controla hoy el ingreso al predio?',
      options: [
        { id: 'guardia', label: 'Guardia con planilla', icon: 'clipboard' },
        { id: 'sistema', label: 'Sistema de control de acceso', icon: 'sys_ok' },
        { id: 'barrera', label: 'Barrera sin registro', icon: 'gate_1' },
        { id: 'sin', label: 'Sin control', icon: 'gate_open' },
      ],
      next: 'N2B-4',
    },
    'N2B-4': {
      kind: 'single', cp: 'Visitas', pass: 'Gestión de visitas',
      q: '¿Cada empresa gestiona sus propias visitas y proveedores?',
      options: [
        { id: 'cada', label: 'Sí, cada una por su cuenta', icon: 'each_company' },
        { id: 'admin', label: 'No, todo pasa por la administración', icon: 'central' },
        { id: 'nada', label: 'No hay gestión formal', icon: 'informal' },
      ],
      next: 'N2B-6',
    },
    'N2B-6': {
      kind: 'multi', cp: 'Soluciones', pass: 'Soluciones',
      q: '¿Qué soluciones te interesan para el parque?',
      sub: 'Podés marcar varias.',
      options: [
        { id: 'lpr', label: 'Reconocimiento de patentes vehiculares (LPR)', icon: 's_lpr' },
        { id: 'web', label: 'Acceso web propio para cada empresa', icon: 's_web' },
        { id: 'visitas', label: 'Registro de visitas, proveedores y contratistas', icon: 's_visitas' },
        { id: 'selfie', label: 'Reconocimiento facial para el personal recurrente (Selfie ID)', icon: 's_selfie' },
        { id: 'obras', label: 'Gestión de obras y contratistas', icon: 's_obras' },
        { id: 'balanza', label: 'Balanza de pesaje', icon: 'truck_scale' },
        { id: 'tailgating', label: 'Anti-Tailgating', icon: 's_tailgating' },
        { id: 'reportes', label: 'Reportes y auditoría del predio', icon: 's_reportes' },
        OTRA,
      ],
      next: 'N2B-7',
    },
    'N2B-7': {
      kind: 'text', cp: 'Cuenta', pass: 'Parque', account: true,
      q: 'Para terminar, ¿cómo se llama el parque industrial?',
      placeholder: 'Ej.: Parque Industrial Pilar',
      next: (s) => (s['N2B-1'] === 'empresa' ? 'N2B-8' : 'N6'),
    },
    'N2B-8': {
      kind: 'text', cp: 'Empresa', pass: 'Empresa', account: true,
      q: '¿Y cómo se llama la empresa desde la que nos consultás?',
      placeholder: 'Razón social o nombre comercial',
      next: 'N6',
    },

    /* ───────── N2D · Industrias ───────── */
    N2D: {
      kind: 'single', cp: 'Escala', pass: 'Ingresos/día',
      q: '¿Cuántas personas ingresan por día al predio?',
      options: [
        { id: 'lt100', label: 'Menos de 100', icon: 'm_person_2' },
        { id: '100_500', label: 'Entre 100 y 500', icon: 'm_person_5' },
        { id: '500_1000', label: 'Entre 500 y 1.000', icon: 'm_person_9' },
        { id: 'gt1000', label: 'Más de 1.000', icon: 'm_person_16' },
      ],
      next: 'N2D-1',
    },
    'N2D-1': {
      kind: 'single', cp: 'Ingresantes', pass: 'Ingresantes',
      q: '¿Qué tipo de ingresantes manejan a diario?',
      options: [
        { id: 'pv', label: 'Personal propio y visitas', icon: 'people_visit' },
        { id: 'pct', label: 'Personal, contratistas y transporte', icon: 'people_mix' },
        { id: 'tl', label: 'Principalmente transporte y logística', icon: 'truck' },
      ],
      next: 'N2D-2',
    },
    'N2D-2': {
      kind: 'single', cp: 'Sectores', pass: 'Sectores',
      q: '¿Hay sectores restringidos dentro del predio (depósitos, vestuarios, salas técnicas, áreas de riesgo)?',
      options: [
        { id: 'formal', label: 'Sí, con control formal', icon: 'lock' },
        { id: 'sinctl', label: 'Sí, pero sin control real', icon: 'lock_open' },
        { id: 'no', label: 'No hay sectores restringidos', icon: 'door_free' },
      ],
      next: 'N2D-3',
    },
    'N2D-3': {
      kind: 'single', cp: 'Documentos', pass: 'Docs contratistas',
      q: '¿Cómo validan hoy la documentación de contratistas (seguro de RC, ART, nómina)?',
      options: [
        { id: 'papel', label: 'En la puerta, en papel', icon: 'doc_paper' },
        { id: 'mail', label: 'Por mail o WhatsApp, antes del ingreso', icon: 'doc_msg' },
        { id: 'sistema', label: 'Con un sistema propio', icon: 'sys_ok' },
        { id: 'no', label: 'No se valida', icon: 'doc_none' },
      ],
      next: 'N2D-4',
    },
    'N2D-4': {
      kind: 'single', cp: 'Carga', pass: 'Camiones',
      q: '¿Reciben camiones de carga? ¿Tienen balanza de pesaje?',
      options: [
        { id: 'bal', label: 'A diario, con balanza', icon: 'truck_scale' },
        { id: 'sinbal', label: 'A diario, sin balanza', icon: 'truck' },
        { id: 'ocas', label: 'Ocasionalmente', icon: 'calendar' },
        { id: 'no', label: 'No recibimos camiones', icon: 'truck_none' },
      ],
      next: 'N2D-5',
    },
    'N2D-5': {
      kind: 'single', cp: 'Riesgo', pass: 'Seguro vencido',
      q: 'Si un contratista llega con el seguro vencido, ¿qué pasa hoy?',
      options: [
        { id: 'frena', label: 'Nos enteramos en la puerta y frena la operación', icon: 'stop' },
        { id: 'entra', label: 'Entra igual y se regulariza después', icon: 'late' },
        { id: 'ctl', label: 'Lo detectamos antes, ya tenemos control', icon: 'shield' },
      ],
      next: 'N2D-6',
    },
    'N2D-6': {
      kind: 'multi', cp: 'Soluciones', pass: 'Soluciones',
      q: '¿Qué soluciones te interesan para el predio?',
      sub: 'Podés marcar varias.',
      options: [
        { id: 'lpr', label: 'Reconocimiento de patentes vehiculares (LPR)', icon: 's_lpr' },
        { id: 'selfie', label: 'Reconocimiento facial para el personal recurrente (Selfie ID)', icon: 's_selfie' },
        { id: 'puertas', label: 'Puertas de acceso por sector', icon: 's_door' },
        { id: 'obras', label: 'Gestión de obras y contratistas', icon: 's_obras' },
        { id: 'balanza', label: 'Balanza de pesaje', icon: 'truck_scale' },
        { id: 'tailgating', label: 'Anti-Tailgating (autos colados)', icon: 's_tailgating' },
        { id: 'emergencia', label: 'Botón de emergencias', icon: 's_sos' },
        { id: 'reportes', label: 'Reportes exportables', icon: 's_export' },
        OTRA,
      ],
      next: 'N2D-7',
    },
    'N2D-7': {
      kind: 'text', cp: 'Cuenta', pass: 'Predio', account: true,
      q: 'Para terminar, ¿cómo se llama el predio o la empresa?',
      placeholder: 'Ej.: Predio Campana',
      next: 'N6',
    },

    /* ───────── N2C · Concesionarios de autos ───────── */
    N2C: {
      kind: 'single', cp: 'Escala', pass: 'Circulación',
      q: '¿Cuántos vehículos o personas circulan por día?',
      options: [
        { id: 'lt50', label: 'Menos de 50', icon: 'm_car_2' },
        { id: '50_200', label: 'Entre 50 y 200', icon: 'm_car_6' },
        { id: 'gt200', label: 'Más de 200', icon: 'm_car_14' },
        { id: 'nose', label: 'No lo sé todavía', icon: 'unknown' },
      ],
      next: 'N2C-1',
    },
    'N2C-1': {
      kind: 'single', cp: 'Predio', pass: 'Predio',
      q: '¿El predio es cerrado?',
      options: [
        { id: 'cerrado', label: 'Sí, predio cerrado', icon: 'lot_closed' },
        { id: 'calle', label: 'No, sobre la calle', icon: 'lot_street' },
        { id: 'mixto', label: 'Mixto (salón y playón cerrado)', icon: 'lot_mixed' },
      ],
      next: 'N2C-2',
    },
    'N2C-2': {
      kind: 'single', cp: 'Sucursales', pass: 'Sucursales',
      q: '¿Cuántas sucursales o predios tiene?',
      options: [
        { id: '1', label: 'Uno solo', icon: 'pin_1' },
        { id: '2_5', label: 'Entre 2 y 5', icon: 'pin_3' },
        { id: 'gt5', label: 'Más de 5', icon: 'pin_6' },
      ],
      next: 'N2C-3',
    },
    'N2C-3': {
      kind: 'single', cp: 'Sin cita', pass: 'Cliente sin cita',
      q: 'Cuando llega un cliente sin cita, ¿cómo queda registrado?',
      options: [
        { id: 'planilla', label: 'A mano en planilla', icon: 'clipboard' },
        { id: 'nada', label: 'No queda registro', icon: 'doc_none' },
        { id: 'vendedor', label: 'Lo carga un vendedor si puede', icon: 'seller' },
        { id: 'digital', label: 'Ya tenemos sistema digital', icon: 'sys_ok' },
      ],
      next: 'N2C-4',
    },
    'N2C-4': {
      kind: 'single', cp: 'CRM', pass: 'CRM',
      q: '¿Usan CRM para gestionar leads y clientes?',
      options: [
        { id: 'sf', label: 'Sí, Salesforce', icon: 'crm_cloud' },
        { id: 'otro', label: 'Sí, otro CRM', icon: 'crm' },
        { id: 'no', label: 'No usamos CRM', icon: 'crm_none' },
        { id: 'nose', label: 'No lo sé', icon: 'unknown' },
      ],
      next: 'N2C-5',
    },
    'N2C-5': {
      kind: 'single', cp: 'Ingreso', pass: 'Ingreso',
      q: '¿Cómo es el ingreso al predio?',
      options: [
        { id: 'veh', label: 'Solo vehicular', icon: 'car' },
        { id: 'pea', label: 'Solo peatonal', icon: 'walker' },
        { id: 'mismo', label: 'Ambos por el mismo acceso', icon: 'both_same' },
        { id: 'sep', label: 'Ambos por accesos separados', icon: 'both_sep' },
      ],
      next: 'N2C-6',
    },
    'N2C-6': {
      kind: 'single', cp: 'Barreras', pass: 'Barreras',
      q: '¿Hay barreras o portones en depósito, taller o service?',
      options: [
        { id: 'auto', label: 'Sí, automáticos', icon: 'barrier_auto' },
        { id: 'manual', label: 'Sí, manuales', icon: 'barrier_manual' },
        { id: 'libre', label: 'No, acceso libre', icon: 'gate_open' },
      ],
      next: 'N2C-7',
    },
    'N2C-7': {
      kind: 'single', cp: 'Sectores', pass: 'Sectores',
      q: '¿Hay sectores con acceso restringido (taller, depósito, 0km)?',
      options: [
        { id: 'formal', label: 'Sí, con control formal', icon: 'lock' },
        { id: 'sinctl', label: 'Sí, pero sin control real', icon: 'lock_open' },
        { id: 'no', label: 'No hay sectores restringidos', icon: 'door_free' },
      ],
      next: 'N2C-8',
    },
    'N2C-8': {
      kind: 'multi', cp: 'Soluciones', pass: 'Soluciones',
      q: '¿Qué soluciones te interesan para la concesionaria?',
      sub: 'Podés marcar varias.',
      options: [
        { id: 'clientes', label: 'Registro de clientes y visitas', icon: 's_visitas' },
        { id: 'crm', label: 'Integración con CRM', icon: 's_sync' },
        { id: 'lpr', label: 'Lector de patentes vehiculares (LPR)', icon: 's_lpr' },
        { id: 'selfie', label: 'Reconocimiento facial para el personal recurrente (Selfie ID)', icon: 's_selfie' },
        { id: 'fast', label: 'Fast Checkout (entrega de 0km)', icon: 's_key' },
        { id: 'puertas', label: 'Puertas internas (taller y depósito)', icon: 's_door' },
        { id: 'docs', label: 'Presentación de documentación', icon: 's_docs' },
        { id: 'foto', label: 'Auditoría fotográfica de ingresos', icon: 's_photo' },
        OTRA,
      ],
      next: 'N2C-9',
    },
    'N2C-9': {
      kind: 'text', cp: 'Cuenta', pass: 'Concesionaria', account: true,
      q: 'Para terminar, ¿cómo se llama la concesionaria y qué marca representa?',
      placeholder: 'Ej.: Autos del Sur — Toyota',
      next: 'N6',
    },

    /* ───────── N2F · Edificios corporativos ───────── */
    N2F: {
      kind: 'single', cp: 'Escala', pass: 'Personas/día',
      q: '¿Cuántas personas circulan por día en el edificio?',
      options: [
        { id: 'lt100', label: 'Menos de 100', icon: 'm_person_2' },
        { id: '100_500', label: 'Entre 100 y 500', icon: 'm_person_5' },
        { id: '500_1000', label: 'Entre 500 y 1.000', icon: 'm_person_9' },
        { id: 'gt1000', label: 'Más de 1.000', icon: 'm_person_16' },
      ],
      next: 'N2F-1',
    },
    'N2F-1': {
      kind: 'single', cp: 'Origen', pass: 'Consulta desde',
      q: '¿Desde dónde nos consultás?',
      options: [
        { id: 'admin', label: 'La administración del edificio', icon: 'admin' },
        { id: 'recepcion', label: 'La recepción o front desk', icon: 'reception' },
        { id: 'empresa', label: 'Una empresa que ocupa oficinas', icon: 'company_in' },
      ],
      next: 'N2F-2',
    },
    'N2F-2': {
      kind: 'single', cp: 'Accesos', pass: 'Accesos',
      q: '¿Cuántas entradas o accesos tiene el edificio?',
      options: [
        { id: 'unico', label: 'Un acceso único', icon: 'gate_1' },
        { id: 'dos', label: 'Dos o más accesos', icon: 'gate_2' },
        { id: 'sep', label: 'Accesos separados para personal y proveedores', icon: 'gate_split' },
      ],
      next: 'N2F-3',
    },
    'N2F-3': {
      kind: 'single', cp: 'Hoy', pass: 'Control actual',
      q: '¿Tienen hoy algún sistema de control de acceso?',
      options: [
        { id: 'si', label: 'Sí, contamos con un sistema', icon: 'sys_ok' },
        { id: 'manual', label: 'No, el registro es manual en recepción', icon: 'clipboard' },
        { id: 'nada', label: 'No, no hay control de acceso', icon: 'gate_open' },
      ],
      next: 'N2F-4',
    },
    'N2F-4': {
      kind: 'single', cp: 'Pisos', pass: 'Acceso por piso',
      q: '¿El edificio tiene acceso diferenciado por piso o sector?',
      options: [
        { id: 'formal', label: 'Sí, con control formal', icon: 'lock' },
        { id: 'sinctl', label: 'Sí, pero sin control real', icon: 'lock_open' },
        { id: 'general', label: 'No, el acceso es general', icon: 'door_free' },
      ],
      next: 'N2F-5',
    },
    'N2F-5': {
      kind: 'multi', cp: 'Soluciones', pass: 'Soluciones',
      q: '¿Qué soluciones te interesan para el edificio?',
      sub: 'Podés marcar varias.',
      options: [
        { id: 'totem', label: 'Tótems de acceso para visitas', icon: 's_totem' },
        { id: 'selfie', label: 'Reconocimiento facial para el personal recurrente (Selfie ID)', icon: 's_selfie' },
        { id: 'autogestion', label: 'Autogestión de ingresos y visitas', icon: 's_visitas' },
        { id: 'pisos', label: 'Asignación de accesos por piso o sector', icon: 's_floors' },
        { id: 'lpr', label: 'Reconocimiento de patentes vehiculares (LPR) para cocheras', icon: 's_lpr' },
        { id: 'paqueteria', label: 'Gestión de paquetería', icon: 's_package' },
        { id: 'amenities', label: 'Amenities (reserva de salas)', icon: 's_room' },
        { id: 'emergencia', label: 'Botón de emergencia', icon: 's_sos' },
        { id: 'reportes', label: 'Reportes y trazabilidad', icon: 's_reportes' },
        OTRA,
      ],
      next: 'N2F-6',
    },
    'N2F-6': {
      kind: 'text', cp: 'Cuenta', pass: 'Edificio', account: true,
      q: 'Para terminar, ¿cómo se llama el edificio o la empresa?',
      placeholder: 'Ej.: Torre Madero',
      next: 'N6',
    },

    /* ───────── Tramo común: datos de contacto ───────── */
    N6: {
      kind: 'text', cp: 'Localidad', pass: 'Localidad', field: 'localidad',
      q: '¿En qué localidad están?',
      placeholder: 'Ej.: Pilar, Buenos Aires', autocomplete: 'address-level2',
      next: 'N7',
    },
    N7: {
      kind: 'text', cp: 'Rol', pass: 'Rol', field: 'rol',
      q: '¿Cuál es tu rol o función?',
      placeholder: 'Ej.: Administrador, Jefe de seguridad, Gerente',
      autocomplete: 'organization-title',
      next: 'N8',
    },
    N8: {
      kind: 'text', cp: 'Contacto', pass: 'Email / Tel', field: 'contacto', validate: 'emailOrPhone',
      q: '¿Cuál es tu email o teléfono?',
      sub: 'Si es teléfono, con código de área.',
      placeholder: 'nombre@empresa.com  ·  11 5555 5555',
      autocomplete: 'email', inputmode: 'email',
      next: 'N9',
    },
    N9: { kind: 'end', cp: 'Pase' },
  };

  function firstName(full) {
    return String(full || '').trim().split(/\s+/)[0] || '';
  }

  window.SILA_FLOW = { nodes: N, start: 'N0' };
})();
