# Central SILA · gestión + experiencia (demo)

Capas 2 y 3 de `SiliconAccess_2.docx`: la app propia que reemplaza Monday.com y la medición de experiencia.
Vanilla HTML/CSS/JS, sin build. **Todo es simulado**: no sale ningún WhatsApp, email ni pedido de reseña; los datos son ficticios y viven en el `localStorage` del navegador.

## Cómo se navega
- **Ver como** (arriba): Dirección (todos los barrios + config), Operador (sólo su barrio: aislamiento multi-tenant) o Técnico de campo (sólo sus visitas). Cada pestaña del navegador puede tener otro rol.
- **Tickets**: grilla en vivo ordenada por % de SLA consumido. Semáforo verde / ámbar (≥ 75 %, alerta automática) / rojo (vencido, escala a Dirección). Ficha con contexto del bot, gestión, bitácora y cierre.
- **Reloj demo** (+15 min / +1 h): adelanta el tiempo para ver cruzar el 75 % y el vencimiento.
- **Lotes**: historial consolidado Barrio → Lote → Usuarios; junta reportes de la familia, la guardia y el bot sobre la misma propiedad (los del mismo lote y categoría se vinculan y se cierran juntos).
- **Experiencia**: al cerrar, encuesta CSAT/NPS por WhatsApp (resolvió el bot) o email formal (resolvió una persona). Detractores → protocolo de recuperación; promotores → pedido de reseña de Google por barrio.
- **Reputación**: NPS, CSAT, Google (simulado), cumplimiento de SLA y tendencia semanal por barrio.
- **SLA y config.**: horas por categoría y umbral de alerta (Dirección edita). Restablecer datos de ejemplo.

## Integración con el bot (`js/ayuda/`)
- Lee `localStorage['sila_demo_casos_v1']` y escucha `BroadcastChannel('sila-demo')` (`{type:'caso', id}`), con sondeo de respaldo cada 5 s.
- Cada caso con `derivado_central === 'sí'` se vuelve ticket con consulta, aclaraciones, módulo, fuentes y pasos intentados.
- En el caso sólo se escribe `monday_ticket` (= id del ticket). Si el bot lo pisa, se vuelve a anotar.
- Claves propias: `sila_demo_tickets_v1`, `sila_demo_encuestas_v1`, `sila_demo_gestion_v1`.
- Para que el bot muestre el acceso: `js/config.js → ayuda.gestionUrl = 'gestion/'`.
