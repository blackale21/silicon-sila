/* SILA — configuración. Todo lo vacío queda desactivado (modo demo: el lead se guarda en el navegador). */
window.SILA_CONFIG = {
  // DEMO: true = no envía NADA; simula HubSpot + mail y muestra lo que recibiría el comercial.
  demo: true,

  siteUrl: 'https://www.silicon-access.com/',
  logoUrl: 'https://cdn.prod.website-files.com/6182a6498e5d9c44fad44d26/67dc400b8d0c490a7daa35fc_Logo%20Silicon%20Access%20Smart%20Security%20-Blanco.png',

  // WhatsApp comercial para el cierre (formato internacional sin +, ej. 5491155555555). Vacío = oculto.
  whatsapp: '',

  // HubSpot (CRM gratis). Crear un formulario y copiar portalId + formGuid. Vacío = no se usa.
  hubspot: { portalId: '', formGuid: '' },

  // Google Apps Script (backend/apps-script.gs) publicado como Web App. Vacío = no se usa.
  appsScriptUrl: '',

  // Anti-spam: segundos mínimos para completar el flujo.
  minSeconds: 6,
};
