/* SILA — flujo comercial (fuente: SILA_flujograma_completo.pptx)
 * Tipos de nodo: single | multi | text | contact
 * next: string o función(state) -> id. pass: rótulo en "Tu pase".
 */
(function () {
  const OTRA = { id: 'otra', label: 'Otra — contanos cuál', icon: 'otra', other: true };

  const N = {
    N1: {
      kind: 'single', cp: 'Destino', pass: 'Vertical',
      q: '¿Dónde querés implementar tu sistema de control de acceso?',
      sub: 'Elegí el tipo de predio. Cada uno tiene su propio recorrido.',
      big: true,
      options: [
        { id: 'urb', label: 'Urbanización', hint: 'Barrio cerrado · country', icon: 'v_urb' },
        { id: 'parque', label: 'Parque industrial', hint: 'Predio con varias empresas', icon: 'v_parque' },
        { id: 'planta', label: 'Industria o planta', hint: 'Una planta individual', icon: 'v_planta' },
        { id: 'conce', label: 'Concesionaria', hint: 'Autos · salón y playón', icon: 'v_conce' },
      ],
      next: (s) => ({ urb: 'N2A', parque: 'N2B', planta: 'N2D', conce: 'N2C' })[s.N1],
    },

    /* ───────── N2A · Urbanización ───────── */
    N2A: {
      kind: 'single', cp: 'Escala', pass: 'Lotes',
      q: '¿Cuántas unidades funcionales (lotes) tiene la urbanización?',
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
        { id: 'pyS', label: 'Un acceso principal y uno secundario', icon: 'gate_2' },
        { id: 'tres', label: 'Tres o más accesos', icon: 'gate_3' },
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
        { id: 'comunidad', label: 'Gestión de la comunidad', icon: 's_comunidad' },
        OTRA,
      ],
      next: 'N2A-5',
    },
    'N2A-5': {
      kind: 'text', cp: 'Cuenta', pass: 'Barrio', account: true,
      q: 'Para terminar, ¿cómo se llama el barrio o la urbanización?',
      placeholder: 'Ej.: Barrio Los Álamos',
      next: 'N3',
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
        { id: 'sep', label: 'Accesos separados para camiones y livianos', icon: 'gate_truckcar' },
        { id: 'tres', label: 'Tres o más accesos', icon: 'gate_3' },
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
      next: 'N2B-5',
    },
    'N2B-5': {
      kind: 'single', cp: 'Flujo', pass: 'Demoras',
      q: '¿Se generan demoras o colas en el ingreso al parque?',
      options: [
        { id: 'frec', label: 'Sí, es un problema frecuente', icon: 'queue' },
        { id: 'pico', label: 'A veces, en horas pico', icon: 'clock' },
        { id: 'no', label: 'No, el ingreso fluye bien', icon: 'flow' },
      ],
      next: 'N2B-6',
    },
    'N2B-6': {
      kind: 'multi', cp: 'Soluciones', pass: 'Soluciones',
      q: '¿Qué soluciones te interesan para el parque?',
      sub: 'Podés marcar varias.',
      options: [
        { id: 'lpr', label: 'LPR con validación de egreso', icon: 's_lpr' },
        { id: 'web', label: 'Acceso web propio para cada empresa', icon: 's_web' },
        { id: 'visitas', label: 'Registro de visitas, proveedores y contratistas', icon: 's_visitas' },
        { id: 'selfie', label: 'Selfie ID para personal recurrente', icon: 's_selfie' },
        { id: 'obras', label: 'Gestión de obras y contratistas', icon: 's_obras' },
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
      next: (s) => (s['N2B-1'] === 'empresa' ? 'N2B-8' : 'N3'),
    },
    'N2B-8': {
      kind: 'text', cp: 'Empresa', pass: 'Empresa', account: true,
      q: '¿Y cómo se llama la empresa desde la que nos consultás?',
      placeholder: 'Razón social o nombre comercial',
      next: 'N3',
    },

    /* ───────── N2D · Industria o planta ───────── */
    N2D: {
      kind: 'single', cp: 'Escala', pass: 'Ingresos/día',
      q: '¿Cuántas personas ingresan por día a la planta?',
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
      q: '¿Hay sectores restringidos dentro de la planta?',
      sub: 'Depósitos, vestuarios, salas técnicas, áreas de riesgo.',
      options: [
        { id: 'formal', label: 'Sí, con control formal', icon: 'lock' },
        { id: 'sinctl', label: 'Sí, pero sin control real', icon: 'lock_open' },
        { id: 'no', label: 'No hay sectores restringidos', icon: 'door_free' },
      ],
      next: 'N2D-3',
    },
    'N2D-3': {
      kind: 'single', cp: 'Documentos', pass: 'Docs contratistas',
      q: '¿Cómo validan hoy la documentación de contratistas?',
      sub: 'Seguro de RC, ART, nómina.',
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
      q: '¿Qué soluciones te interesan para la planta?',
      sub: 'Podés marcar varias.',
      options: [
        { id: 'lpr', label: 'LPR con validación de egreso', icon: 's_lpr' },
        { id: 'selfie', label: 'Selfie ID para personal recurrente', icon: 's_selfie' },
        { id: 'puertas', label: 'Puertas de acceso por sector', icon: 's_door' },
        { id: 'obras', label: 'Gestión de obras y contratistas', icon: 's_obras' },
        { id: 'balanza', label: 'Balanza de pesaje integrada', icon: 'truck_scale' },
        { id: 'tailgating', label: 'Anti-Tailgating', icon: 's_tailgating' },
        { id: 'emergencia', label: 'Botón de emergencias', icon: 's_sos' },
        { id: 'reportes', label: 'Reportes exportables', icon: 's_export' },
        OTRA,
      ],
      next: 'N2D-7',
    },
    'N2D-7': {
      kind: 'text', cp: 'Cuenta', pass: 'Planta', account: true,
      q: 'Para terminar, ¿cómo se llama la planta o la empresa?',
      placeholder: 'Ej.: Planta Campana',
      next: 'N3',
    },

    /* ───────── N2C · Concesionaria ───────── */
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
      q: '¿Hay sectores con acceso restringido?',
      sub: 'Taller, depósito, 0 km.',
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
        { id: 'lpr', label: 'LPR para vehículos de stock', icon: 's_lpr' },
        { id: 'selfie', label: 'Selfie ID para personal', icon: 's_selfie' },
        { id: 'fast', label: 'Fast Checkout (entrega de 0 km)', icon: 's_key' },
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
      next: 'N3',
    },

    /* ───────── Tramo común ───────── */
    N3: {
      kind: 'single', cp: 'Necesidad', pass: 'Necesidad',
      q: '¿Qué necesitás resolver principalmente?',
      options: (s) => [
        { id: 'veh', label: 'Acceso vehicular', icon: 'car' },
        { id: 'pea', label: 'Acceso peatonal', icon: 'walker' },
        { id: 'ambos', label: 'Ambos', icon: 'both_same' },
        {
          id: 'gestion', icon: 'gestion',
          label: ({
            urb: 'Gestión de comunidad',
            parque: 'Gestión integral del parque',
            planta: 'Gestión integral de la planta',
            conce: 'Gestión comercial',
          })[s.N1] || 'Gestión integral',
        },
      ],
      next: 'N4',
    },
    N4: {
      kind: 'single', cp: 'Etapa', pass: 'Etapa',
      q: '¿Estás en etapa de evaluación o ya tenés una decisión más avanzada?',
      options: [
        { id: 'comparando', label: 'Comparando opciones', icon: 'compare' },
        { id: 'pronto', label: 'Quiero avanzar pronto', icon: 'fast' },
        { id: 'cambiar', label: 'Cambiar sistema actual', icon: 'swap' },
      ],
      next: 'N5',
    },
    N5: {
      kind: 'text', cp: 'Nombre', pass: 'Contacto', field: 'nombre',
      q: '¿Cómo te llamás?', sub: 'Nombre y apellido.',
      placeholder: 'Nombre y apellido', autocomplete: 'name',
      next: 'N6',
    },
    N6: {
      kind: 'text', cp: 'Localidad', pass: 'Localidad', field: 'localidad',
      q: (s) => `Un gusto, ${firstName(s.N5)}. ¿En qué localidad están?`,
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
      q: '¿A dónde te escribe el asesor?',
      sub: 'Email o teléfono (con código de área).',
      placeholder: 'nombre@empresa.com  ·  11 5555 5555',
      autocomplete: 'email', inputmode: 'email',
      next: 'N9',
    },
    N9: { kind: 'end', cp: 'Pase' },
  };

  function firstName(full) {
    return String(full || '').trim().split(/\s+/)[0] || '';
  }

  window.SILA_FLOW = { nodes: N, start: 'N1' };
})();
