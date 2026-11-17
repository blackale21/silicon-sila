# Central SILA · gestión + experiencia

Capas 2 y 3 de `SiliconAccess_2.docx`: la app propia que reemplaza Monday.com y la medición de experiencia.
Vanilla HTML/CSS/JS, sin build. **Sin datos de ejemplo**: todo lo que se ve entró por el chat de residentes.
Lo único simulado son los envíos (WhatsApp, email formal, pedido de reseña): se muestran rotulados SIMULADO y no sale nada.

## Conexión
- Lee `../js/config.js → SILA_CONFIG.ayuda.backendUrl` (Apps Script, `backend/ayuda-casos.gs`). Vacío → "Falta conectar el backend" y no muestra nada.
- `POST` con `Content-Type: text/plain;charset=utf-8` (sin preflight). Acciones:
  `central_estado`, `central_crear_clave`, `casos_listar` (con `desde`), `caso_actualizar`, `kv_get`, `kv_set`.
- **Clave de la central**: la primera vez se crea (dos veces, mínimo 8). Queda en `localStorage.sila_central_clave`; "Salir de esta PC" (Config.) la borra. Sin clave no se ve ningún dato.
- **Casos**: refresco cada 9 s con `desde`. `BroadcastChannel('sila-demo')` sólo adelanta el refresco.
  - `derivado_central === 'sí'` → ticket con consulta, pasos intentados, fuentes y contacto. Se anota `monday_ticket` en el caso.
  - Cerrar el ticket → `caso_actualizar {estado:'resuelto', resultado}`.
  - Casos que resolvió el bot → encuesta por WhatsApp (simulada) y métrica "Resueltos por el bot".
  - Barrios y lotes se dan de alta solos con lo que escribe el residente (Dirección puede renombrarlos o unir duplicados).
- **Estado compartido** (`kv_set` con versión, ~1 s de espera): `sila_central_tickets`, `_encuestas`, `_config`, `_equipo`, `_barrios`, `_alertas`.
  Si otra PC escribió antes (`conflicto`), se toma la versión del backend y se vuelven a aplicar los cambios pendientes: no se pierde ninguno.
- Indicador arriba: "Conectado · actualizado hace X s" / "Sin conexión".

## Qué carga Dirección (Config.)
- Categorías de SLA (nombre, horas, palabras clave para categorizar solo). Hay un atajo para los dos plazos del contrato: barrera caída 2 h, cambio de datos 24 h. Sin categoría el semáforo queda en gris.
- Umbral de alerta (75 % por defecto).
- Equipo: operadores (con sus barrios: aislamiento) y técnicos de campo (sólo ven sus visitas). "Ver como" cambia la vista en esa pestaña.
- Barrios: nombre, perfil de Google (link, calificación, cantidad de reseñas) y "es el mismo que…" para unificar.

## Vistas
Tickets (semáforo SLA, alerta al umbral, vencido → Dirección) · Lotes (historial consolidado: tickets + consultas del chat del mismo lote) · Experiencia (CSAT/NPS, detractores con protocolo, pedidos de reseña) · Reputación por barrio · Config.
