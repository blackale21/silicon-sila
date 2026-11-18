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
- **Tono humano, sin citas.** Responde con 77 **fichas** (`kb/cards/*.json`) redactadas en voseo a partir de los manuales, con pasos cortos.
- **Nada inventado.** Cada paso lleva el fragmento y la cita literal que lo respalda. `kb/tools/check_cards.py` rechaza cualquier paso cuya cita no esté en el manual, y el build no arma la base si hay errores.
- **Círculo rojo.** Se ubica el botón con el OCR de Windows sobre las capturas reales (100 de 109 ubicados). Se muestra el recorte en alta resolución (`kb/shots/`) y se agranda al tocar.
- **Fuentes.** El residente no ve citas. La fuente queda en el caso y en el correo a la central como respaldo interno.
- **Base.** `kb/sila_kb.sqlite` tiene manuales, fragmentos y fichas; es SQL estándar y migrable (`kb/README.md`).
- **Flujo.**
  - Consulta vaga: ofrece temas y después las fichas de ese tema.
  - Dos fichas igual de probables: pregunta cuál.
  - Sin respaldo: "no encontré una solución en la documentación disponible".
  - Resuelto sólo si el residente lo confirma; si no, queda pendiente y se ofrece la central, con el formulario de barrio, nombre, lote, celular y correo, más lo ya intentado.
- **Registro.**
  - Producción: `backend/ayuda-casos.gs` escribe una fila en la planilla **"SILA Ayuda · Casos de residentes"** (Drive del usuario) y manda un correo a `CENTRAL_MAIL`.
  - Demo: todo queda en el navegador y se rotula SIMULADO.
- **Pendiente.**
  - Ticket en **Monday**: está el stub `mondayTicket()` en el `.gs`.
  - Correo de la central.
  - Publicar el Apps Script.
  - `config.ayuda.gestionUrl`, cuando se integre la app de gestión (rama `gestion-app`).
- **Discrepancias vistas en los manuales.** Los agentes encontraron diferencias entre el texto y las capturas:
  - nombres de botones, por ejemplo "Mis Expensas" vs "Expensas";
  - los tipos de emergencia;
  - los 5 vs 6 pasos de la inscripción.

  En esos casos las fichas usan el texto y no marcan un botón dudoso.


### Jev en vivo (2026-11-17)
- Backend publicado: Apps Script **"SILA Ayuda - backend"** en el Drive del usuario, como aplicación web pública. Su URL está en `config.ayuda.backendUrl`.
- **Clave:** está sólo en Propiedades del script (`TYPESAFE_KEY`).
- **Preguntas a Jev:** son fijas. Las opciones salen de `kb/jev-criterios.json`, publicado en GitHub y generado al rearmar la base.
- **Candados:** en el chat (`js/ayuda/jev.js`) y en el script (validación de entrada, caché de 6 h, topes altos anti-abuso).
- **Si Jev falla,** responde el buscador local.
- **Casos:** siguen simulados (`ayuda.demo = true`) hasta que se cargue `CENTRAL_MAIL` en el script.
- **Al cambiar las fichas:** rearmar la base y hacer push. El script relee las opciones solo, en hasta 6 h.

## Mascota 3D de SILA (2026-11-17)
SILA (robot "4" con visor y manos flotantes) acompaña el flujo comercial en `sila.html`.
- **Dónde:** PC a la izquierda del encabezado de la pregunta; celular arriba a la derecha; se oculta en celular horizontal.
- **Qué hace:** saluda al empezar, "dice" cada pregunta (boca), asiente al elegir, escucha mientras escribís, piensa al volver, señala la pregunta si pasan 22 s sin respuesta, celebra al emitir el pase. Te sigue con la mirada (cursor; si no, mira la pregunta). Tocarla: salta y saluda.
- **Peso:** `js/mascota.js` (~600 KB, ~150 KB gzip) + `assets/sila-mascota.glb` (~1,4 MB). Se carga **después** de mostrar la 1ª pregunta; nunca frena el flujo.
- **Botón de Residentes** (`index.html`, js/ayuda/bot.js): SILA en la esquina con globo "¿En qué puedo ayudarte dentro de la app?"; saluda cada 12-22 s, se alegra al pasar el mouse, no dibuja con el chat abierto. Mientras carga o sin WebGL queda el ícono de antes.
- **Apagar:** `config.mascota = false`, `?mascota=0`, o el navegador con ahorro de datos. Si WebGL falla, se retira sola.
- **Fuente:** `mascota/src/mascota.js` → `sh mascota/build.sh`. El modelo sale de `C:\Users\O-O\sila-avatar-vida` (`build_web_glb.sh`).

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
