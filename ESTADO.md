# SILA — estado (2026-11-13)

Canal de ingreso de leads para silicon-access.com. Concepto e ideas: [docs/IDEAS.md](docs/IDEAS.md).

## Hecho (prototipo v1, funcionando)
- Flujo completo del flujograma (4 ramas, condicionales N2A-3 y N2B-8, N3 dinámico, menús múltiples con "Otra").
- Intro con el isotipo armándose (saltable, 1 vez por sesión, respeta "reducir movimiento").
- Ruta de checkpoints con los próximos bloqueados, log de eventos, "Tu pase" en vivo, pase emitido con sello.
- ~90 pictogramas propios (vector, sin imágenes externas). Galería: `docs/icons.html`.
- PC + celular (cajón del pase, barra de acción fija, sin scroll horizontal).
- Envío: HubSpot Forms API y/o Google Apps Script; sin config = modo demo (guarda en el navegador).
  Cola de reintento, honeypot + tiempo mínimo, UTM, temperatura del lead (frío/tibio/caliente).
- Snippet Webflow `embed/launcher.js`: botón flotante + engancha CONTACTANOS / SOLICITÁ UNA DEMO.
- Maqueta de la home (`index.html`, noindex + aviso): SOLICITÁ UNA DEMO → transición → SILA → vuelve al sitio.

- Destino simulado: `crm.html` (tablero por estado, planilla tipo Google Sheet, ficha, CSV real, llegada en vivo entre pestañas) + WhatsApp simulado al cierre. Leads en localStorage del navegador.

## Probar local
Servidor estático en la carpeta (ej. `python -m http.server 8340`) y abrir:
- `http://localhost:8340/` → maqueta de la web; SOLICITÁ UNA DEMO → SILA
- `http://localhost:8340/sila.html?intro=1` → SILA con intro
- `?intro=0` salta la intro · `?embed=1` modo overlay

## Pendiente (decisiones del cliente)
1. Destino del lead: ¿HubSpot? (portalId + formGuid) o Google Sheet (`backend/apps-script.gs`).
2. Hosting gratis: GitHub Pages / Cloudflare Pages (+ subdominio `sila.silicon-access.com` opcional).
3. ¿Enganchar CONTACTANOS/DEMO o sólo botón flotante? (`data-hook="false"`).
4. WhatsApp comercial para el cierre (`config.js → whatsapp`).
5. Texto "Para terminar…" en los nodos de nombre (después siguen 6 preguntas).

## HubSpot: campos del formulario
`firstname, lastname, email, phone, city, jobtitle, company` + propiedades custom
`sila_vertical, sila_temperatura, sila_resumen, sila_id`.
