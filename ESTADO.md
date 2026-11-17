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

## SILA Ayuda: asistente para residentes (2026-11-17)
Botón flotante en la maqueta (`index.html`, se abre directo con `?ayuda=1`). Globo en PC y pantalla completa en celular.
- **Responde sólo con los manuales.** 52 manuales únicos bajados de las 2 carpetas de Drive → `kb/sila_kb.sqlite` (182 fragmentos, uno por página) + capturas en `kb/pages/`. Ver `kb/README.md`.
- **Búsqueda en el navegador.** sql.js + BM25 en español, sin internet ni IA generativa (`js/ayuda/kb.js`). Muestra el texto literal con manual, página y público (residentes o administración), y un botón para ver la página.
- **Cuándo pregunta y cuándo no responde.**
  - Consulta vaga: pide aclaración (módulo o detalle).
  - Coincide con varios módulos: pregunta cuál.
  - Sin respaldo: "No encontré una solución en la documentación disponible".
  - Dos versiones del mismo manual que no coinciden: lo señala y pregunta cuál aplica.
- **Casos.**
  - Se registran al primer mensaje.
  - "Resuelto" sólo cuando el residente lo confirma; si no, queda pendiente y le ofrece la central.
  - Formulario con barrio, residente, lote, celular y correo, que se envía con los pasos ya intentados y las fuentes.
- **Registro.**
  - Producción: `backend/ayuda-casos.gs` escribe una fila en la planilla **"SILA Ayuda · Casos de residentes"** (Drive del usuario) y manda un correo a `CENTRAL_MAIL`.
  - Demo (`config.ayuda.demo = true`): todo queda sólo en el navegador y se rotula SIMULADO.
- **Pendiente.**
  - Ticket en **Monday** por cada caso derivado: está el stub `mondayTicket()` en el `.gs`, falta token y board id.
  - Correo de la central.
  - Publicar el Apps Script.
  - App de gestión de la central: `config.ayuda.gestionUrl`.
- **Límite.** La detección de contradicciones es automática sólo entre versiones de un mismo manual. Contradicciones de fondo entre manuales distintos no se detectan solas.

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
