/* SILA — configuración. Todo lo vacío queda desactivado (modo demo: el lead se guarda en el navegador). */
window.SILA_CONFIG = {
  // DEMO: true = no envía NADA; simula HubSpot + mail y muestra lo que recibiría el comercial.
  demo: true,

  // Destino de "Volver al sitio". En la demo de GitHub es la maqueta ('./'); en producción, la web real.
  siteUrl: './',
  logoUrl: 'https://cdn.prod.website-files.com/6182a6498e5d9c44fad44d26/67dc400b8d0c490a7daa35fc_Logo%20Silicon%20Access%20Smart%20Security%20-Blanco.png',

  // WhatsApp comercial para el cierre (formato internacional sin +, ej. 5491155555555). Vacío = oculto.
  // En demo cualquier valor activa el WhatsApp simulado (no abre WhatsApp real).
  whatsapp: 'demo',

  // HubSpot (CRM gratis). Crear un formulario y copiar portalId + formGuid. Vacío = no se usa.
  hubspot: { portalId: '', formGuid: '' },

  // Google Apps Script (backend/apps-script.gs) publicado como Web App. Vacío = no se usa.
  appsScriptUrl: '',

  // Anti-spam: segundos mínimos para completar el flujo.
  minSeconds: 6,

  // SILA Ayuda (asistente para residentes)
  ayuda: {
    // DEMO: true = los casos se guardan sólo en el navegador; no se escribe la planilla ni se manda correo.
    demo: true,
    // URL /exec del Apps Script de backend/ayuda-casos.gs (planilla "SILA Ayuda · Casos de residentes" + correo).
    casosUrl: '',
    // Base de conocimiento SQLite generada con kb/tools/build_kb.py
    kbUrl: 'kb/sila_kb.sqlite',
    // App de la central que recibe los casos derivados (vacío = no se muestra el acceso).
    gestionUrl: 'gestion/',
  },
};
